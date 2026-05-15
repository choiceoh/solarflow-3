#!/usr/bin/env bun
/**
 * gen_m132_migration.ts — M132 마이그 SQL 생성.
 *
 * 운영 DB 의 bl_shipments 와 매칭된 97 그룹 → 312 PDF 파일을
 * document_files 테이블에 INSERT 하는 SQL 을 생성한다.
 *
 * 입력:
 *   scripts/output/group_to_bl.csv      그룹 ↔ bl_id 매핑
 *   scripts/output/pl_bl_inventory.csv  파일 단위 인벤토리
 *
 * 출력:
 *   backend/migrations/132_backfill_document_files_pl_bl.sql
 *
 * 매핑:
 *   inventory file_type → document_files.file_type
 *     BL  → 'bill_of_lading'
 *     OBL → 'ocean_bl'
 *     HBL → 'house_bl'
 *     PL  → 'packing_list'
 *     CI  → 'commercial_invoice'
 *
 * 멱등성:
 *   document_files 에 unique constraint 없음.
 *   각 INSERT 를 WHERE NOT EXISTS (entity_id + stored_path 동일) 로 감싸 idempotent.
 *   stored_path = inventory 의 rel_path (Dropbox 루트 기준 상대경로).
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OUT_DIR = join(import.meta.dir, 'output')
const MIG_PATH = join(import.meta.dir, '..', 'backend', 'migrations', '132_backfill_document_files_pl_bl.sql')

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') inQ = false
      else field += c
    } else {
      if (c === '"') inQ = true
      else if (c === ',') {
        cur.push(field)
        field = ''
      } else if (c === '\n' || c === '\r') {
        if (field !== '' || cur.length) {
          cur.push(field)
          rows.push(cur)
        }
        cur = []
        field = ''
        if (c === '\r' && text[i + 1] === '\n') i++
      } else field += c
    }
  }
  if (field !== '' || cur.length) {
    cur.push(field)
    rows.push(cur)
  }
  return rows
}

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

const FILE_TYPE_MAP: Record<string, string> = {
  BL: 'bill_of_lading',
  OBL: 'ocean_bl',
  HBL: 'house_bl',
  PL: 'packing_list',
  CI: 'commercial_invoice',
}

async function main() {
  // 1. group_to_bl.csv: 그룹키 → bl_id
  let mText = await readFile(join(OUT_DIR, 'group_to_bl.csv'), 'utf8')
  if (mText.charCodeAt(0) === 0xfeff) mText = mText.slice(1)
  const mRows = parseCsv(mText)
  const [mHeader, ...mBody] = mRows
  const mIdx = Object.fromEntries(mHeader.map((h, i) => [h, i])) as Record<string, number>

  const groupToBl = new Map<string, { bl_id: string; bl_number: string; match_type: string }>()
  for (const r of mBody) {
    if (r.length < 5) continue
    const key = `${r[mIdx['year']]}::${r[mIdx['vendor']]}::${r[mIdx['group_prefix']]}`
    groupToBl.set(key, {
      bl_id: r[mIdx['bl_id']],
      bl_number: r[mIdx['bl_number']],
      match_type: r[mIdx['match_type']],
    })
  }
  console.error(`매칭된 그룹: ${groupToBl.size}`)

  // 2. inventory CSV: 각 파일
  let iText = await readFile(join(OUT_DIR, 'pl_bl_inventory.csv'), 'utf8')
  if (iText.charCodeAt(0) === 0xfeff) iText = iText.slice(1)
  const iRows = parseCsv(iText)
  const [iHeader, ...iBody] = iRows
  const iIdx = Object.fromEntries(iHeader.map((h, i) => [h, i])) as Record<string, number>

  type FileRec = {
    bl_id: string
    bl_number: string
    file_type: string
    filename: string
    rel_path: string
    size_bytes: number
    match_type: string
  }
  const files: FileRec[] = []
  for (const r of iBody) {
    if (r.length < 7) continue
    const groupKey = `${r[iIdx['year']]}::${r[iIdx['vendor']]}::${r[iIdx['prefix']]}`
    const m = groupToBl.get(groupKey)
    if (!m) continue
    const invType = r[iIdx['file_type']]
    const mappedType = FILE_TYPE_MAP[invType] ?? 'other'
    files.push({
      bl_id: m.bl_id,
      bl_number: m.bl_number,
      file_type: mappedType,
      filename: r[iIdx['filename']],
      rel_path: r[iIdx['rel_path']].replace(/\\/g, '/'),
      size_bytes: Number(r[iIdx['size_bytes']] ?? 0),
      match_type: m.match_type,
    })
  }

  // 같은 (bl_id, rel_path) 중복 제거 (한 BL 에 같은 파일이 여러 그룹 통해 매칭된 경우)
  const seen = new Set<string>()
  const dedup: FileRec[] = []
  for (const f of files) {
    const k = `${f.bl_id}|${f.rel_path}`
    if (seen.has(k)) continue
    seen.add(k)
    dedup.push(f)
  }
  console.error(`파일 (dedup 후): ${dedup.length}`)

  // file_type 별 카운트
  const byType = new Map<string, number>()
  for (const f of dedup) byType.set(f.file_type, (byType.get(f.file_type) ?? 0) + 1)
  for (const [t, n] of [...byType.entries()].sort()) console.error(`  ${t}: ${n}`)

  // 3. SQL 생성
  const lines: string[] = []
  lines.push('-- M132: PL/BL/CI PDF 메타 백필 — 운영 DB 매칭된 97 BL → document_files')
  lines.push('-- @auto-apply: yes')
  lines.push('-- 입력 자료: scripts/output/group_to_bl.csv (인벤토리 ↔ bl_shipments 매칭)')
  lines.push('-- 멱등성: (entity_id, stored_path) 동일 행이 이미 있으면 skip')
  lines.push('--')
  lines.push(`-- 통계: ${dedup.length} 파일, ${groupToBl.size} BL`)
  lines.push('--   ' + [...byType.entries()].map(([t, n]) => `${t}=${n}`).join(', '))
  lines.push('')
  lines.push('BEGIN;')
  lines.push('')

  for (const f of dedup) {
    lines.push('INSERT INTO document_files (entity_type, entity_id, file_type, original_name, stored_name, stored_path, content_type, size_bytes, uploaded_by)')
    lines.push(`SELECT 'bl_shipments', ${sqlString(f.bl_id)}::uuid, ${sqlString(f.file_type)}, ${sqlString(f.filename)}, ${sqlString(f.filename)}, ${sqlString(f.rel_path)}, 'application/pdf', ${f.size_bytes}, 'M132-backfill'`)
    lines.push(`WHERE NOT EXISTS (SELECT 1 FROM document_files WHERE entity_type='bl_shipments' AND entity_id=${sqlString(f.bl_id)}::uuid AND stored_path=${sqlString(f.rel_path)});`)
  }

  lines.push('')
  lines.push('COMMIT;')
  lines.push('')

  await writeFile(MIG_PATH, lines.join('\n'), 'utf8')
  console.log(`작성: ${MIG_PATH}`)
  console.log(`INSERT 문: ${dedup.length}`)
  console.log(`SQL 줄수: ${lines.length}`)
}

await main()
