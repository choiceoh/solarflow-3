#!/usr/bin/env bun
/**
 * match_to_bl_shipments.ts — 인벤토리 prefix → 운영 DB bl_shipments.bl_number 매칭.
 *
 * 입력:
 *   scripts/output/bl_shipments.psv     운영 DB 덤프 (bl_id|bl_number|invoice_number|etd|eta|mfg|company)
 *   scripts/output/pl_bl_inventory.csv  파일 인벤토리
 *   scripts/output/pl_only_matched.csv  PL-only 자동 매칭 (BL ↔ PL 페어)
 *
 * 처리:
 *   1. 169개 prefix 그룹마다 그룹의 모든 ID 후보 (filename + parent + grandparent) 추출
 *   2. 운영 DB 150개 bl_number 와 매칭:
 *      - EXACT: bl_number == prefix 또는 그룹의 ID 중 하나
 *      - CONTAINS: bl_number 가 파일명/폴더명에 포함
 *      - NONE: 매칭 실패 (운영 ERP 미등록 BL — 신규 입력 또는 모듈 외)
 *
 * 출력:
 *   scripts/output/group_to_bl.csv  그룹 → bl_id 매핑 (EXACT / CONTAINS / NONE 마킹)
 *   scripts/output/db_match_summary.txt
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join, basename, dirname } from 'node:path'

const OUT_DIR = join(import.meta.dir, 'output')

type BL = {
  bl_id: string
  bl_number: string
  invoice_number: string | null
  etd: string | null
  eta: string | null
  mfg: string | null
  company: string | null
}

type InvRow = {
  year: string
  vendor: string
  prefix: string
  fileType: string
  filename: string
  relPath: string
}

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

function csvEscape(v: string | number): string {
  const s = String(v ?? '')
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const ID_RES = [
  /(?<![A-Z0-9])([A-Z]{2,10}\d{6,14})(?![A-Z0-9])/g,
  /(?<![A-Z0-9-])([A-Z]{2,5}-\d{4}-\d{3,6})(?![A-Z0-9-])/g,
]
function extractIds(text: string): Set<string> {
  const out = new Set<string>()
  for (const re of ID_RES) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) out.add(m[1])
  }
  return out
}

async function main() {
  // 1. 운영 DB BL 마스터 로드
  const psv = await readFile(join(OUT_DIR, 'bl_shipments.psv'), 'utf8')
  const bls: BL[] = psv
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      const [bl_id, bl_number, invoice_number, etd, eta, mfg, company] = l.split('|')
      return {
        bl_id,
        bl_number,
        invoice_number: invoice_number || null,
        etd: etd || null,
        eta: eta || null,
        mfg: mfg || null,
        company: company || null,
      }
    })
  console.error(`운영 DB BL: ${bls.length}건`)

  // 2. 인벤토리 로드
  let invText = await readFile(join(OUT_DIR, 'pl_bl_inventory.csv'), 'utf8')
  if (invText.charCodeAt(0) === 0xfeff) invText = invText.slice(1)
  const invRows = parseCsv(invText)
  const [invHeader, ...invBody] = invRows
  const idxOf = Object.fromEntries(invHeader.map((h, i) => [h, i])) as Record<string, number>
  const inv: InvRow[] = invBody
    .filter((r) => r.length >= 7)
    .map((r) => ({
      year: r[idxOf['year']],
      vendor: r[idxOf['vendor']],
      prefix: r[idxOf['prefix']],
      fileType: r[idxOf['file_type']],
      filename: r[idxOf['filename']],
      relPath: r[idxOf['rel_path']],
    }))

  // 3. 그룹화
  type Group = { year: string; vendor: string; prefix: string; files: InvRow[]; candidateIds: Set<string>; allText: string }
  const groupMap = new Map<string, Group>()
  for (const r of inv) {
    const key = `${r.year}::${r.vendor}::${r.prefix}`
    let g = groupMap.get(key)
    if (!g) {
      g = { year: r.year, vendor: r.vendor, prefix: r.prefix, files: [], candidateIds: new Set(), allText: '' }
      groupMap.set(key, g)
    }
    g.files.push(r)
    // ID 후보 수집 (파일명 + 부모 + 조부모)
    for (const id of extractIds(r.filename)) g.candidateIds.add(id)
    const parent = basename(dirname(r.relPath))
    const grand = basename(dirname(dirname(r.relPath)))
    for (const id of extractIds(parent)) g.candidateIds.add(id)
    for (const id of extractIds(grand)) g.candidateIds.add(id)
    g.allText += ' ' + r.relPath + ' ' + r.filename
  }
  // prefix 자체도 ID 후보로
  for (const g of groupMap.values()) {
    if (!g.prefix.includes('(no-id)')) g.candidateIds.add(g.prefix)
  }

  console.error(`인벤토리 그룹: ${groupMap.size}`)

  // 4. PL-only 자동매칭 (다른 폴더의 BL) 도 그룹에 합치자: matched.csv 에서 PL 그룹이 어떤 BL 파일에 짝지어졌는지 → 그 BL 파일의 부모 폴더의 ID 도 후보에 포함
  let mText = await readFile(join(OUT_DIR, 'pl_only_matched.csv'), 'utf8')
  if (mText.charCodeAt(0) === 0xfeff) mText = mText.slice(1)
  const mRows = parseCsv(mText)
  const [mHeader, ...mBody] = mRows
  const mIdx = Object.fromEntries(mHeader.map((h, i) => [h, i])) as Record<string, number>
  for (const r of mBody) {
    if (r.length < 5) continue
    const year = r[mIdx['year']]
    const vendor = r[mIdx['vendor']]
    const prefix = r[mIdx['prefix']]
    const blPath = r[mIdx['matched_bl_abs']]
    const g = groupMap.get(`${year}::${vendor}::${prefix}`)
    if (!g || !blPath) continue
    const blParent = basename(dirname(blPath))
    const blFile = basename(blPath)
    g.allText += ' ' + blParent + ' ' + blFile
    for (const id of extractIds(blFile)) g.candidateIds.add(id)
    for (const id of extractIds(blParent)) g.candidateIds.add(id)
  }

  // 5. 매칭 — 각 그룹에 대해 운영 DB BL 후보 점수 매기기
  type Match = { group: Group; bl: BL; matchType: 'EXACT' | 'CONTAINS' | 'INVOICE'; matchedKey: string }
  const matches: Match[] = []
  const unmatched: Group[] = []

  for (const g of groupMap.values()) {
    let best: Match | null = null
    for (const bl of bls) {
      // EXACT: bl_number 가 ID 후보에 포함
      if (g.candidateIds.has(bl.bl_number)) {
        best = { group: g, bl, matchType: 'EXACT', matchedKey: bl.bl_number }
        break
      }
      // INVOICE: invoice_number 가 ID 후보에 포함
      if (bl.invoice_number && g.candidateIds.has(bl.invoice_number)) {
        if (!best) best = { group: g, bl, matchType: 'INVOICE', matchedKey: bl.invoice_number }
      }
    }
    if (!best) {
      // CONTAINS: bl_number 가 allText 안에 포함 (전체 텍스트 substring)
      const upText = g.allText.toUpperCase()
      for (const bl of bls) {
        if (bl.bl_number.length >= 10 && upText.includes(bl.bl_number.toUpperCase())) {
          best = { group: g, bl, matchType: 'CONTAINS', matchedKey: bl.bl_number }
          break
        }
      }
    }
    if (best) matches.push(best)
    else unmatched.push(g)
  }

  // bl_id 가 여러 그룹에 동시 매칭됐는지 체크
  const blIdGroups = new Map<string, Match[]>()
  for (const m of matches) {
    const arr = blIdGroups.get(m.bl.bl_id) ?? []
    arr.push(m)
    blIdGroups.set(m.bl.bl_id, arr)
  }
  const duplicates = [...blIdGroups.entries()].filter(([, ms]) => ms.length > 1)

  // 6. CSV 출력
  const header = ['year', 'vendor', 'group_prefix', 'bl_id', 'bl_number', 'invoice_number', 'etd', 'eta', 'match_type', 'matched_key', 'file_count', 'pdf_paths']
  const rows = [header.join(',')]
  for (const m of matches.sort((a, b) => a.bl.bl_number.localeCompare(b.bl.bl_number))) {
    const paths = m.group.files.map((f) => `${f.fileType}:${f.filename}`).join(' | ')
    rows.push(
      [
        m.group.year,
        m.group.vendor,
        m.group.prefix,
        m.bl.bl_id,
        m.bl.bl_number,
        m.bl.invoice_number ?? '',
        m.bl.etd ?? '',
        m.bl.eta ?? '',
        m.matchType,
        m.matchedKey,
        m.group.files.length,
        paths,
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  await writeFile(join(OUT_DIR, 'group_to_bl.csv'), '﻿' + rows.join('\n'), 'utf8')

  // 미매칭
  const uHeader = ['year', 'vendor', 'group_prefix', 'file_count', 'candidate_ids', 'sample_files']
  const uRows = [uHeader.join(',')]
  for (const g of unmatched.sort((a, b) => a.vendor.localeCompare(b.vendor) + a.prefix.localeCompare(b.prefix))) {
    uRows.push(
      [
        g.year,
        g.vendor,
        g.prefix,
        g.files.length,
        [...g.candidateIds].slice(0, 5).join(' | '),
        g.files.slice(0, 3).map((f) => `${f.fileType}:${f.filename}`).join(' | '),
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  await writeFile(join(OUT_DIR, 'group_to_bl_unmatched.csv'), '﻿' + uRows.join('\n'), 'utf8')

  // 7. 요약 stdout
  const byType = new Map<string, number>()
  for (const m of matches) byType.set(m.matchType, (byType.get(m.matchType) ?? 0) + 1)

  console.log('')
  console.log('=== 인벤토리 ↔ 운영 DB bl_shipments 매칭 ===')
  console.log(`인벤토리 그룹:  ${groupMap.size}`)
  console.log(`운영 DB BL:     ${bls.length}`)
  console.log(`매칭 성공:      ${matches.length}`)
  for (const [t, n] of [...byType.entries()].sort()) {
    console.log(`  ${t.padEnd(10)}: ${n}`)
  }
  console.log(`매칭 실패:      ${unmatched.length}  (운영 DB 미등록 BL 또는 모듈 외)`)
  console.log('')
  console.log(`bl_id 중복 매칭 (한 BL → 여러 그룹): ${duplicates.length}`)
  for (const [blId, ms] of duplicates.slice(0, 5)) {
    console.log(`  ${ms[0].bl.bl_number} (${blId}): ${ms.map((x) => x.group.prefix).join(' | ')}`)
  }
  console.log('')
  console.log(`매칭:    ${join(OUT_DIR, 'group_to_bl.csv')}`)
  console.log(`미매칭:  ${join(OUT_DIR, 'group_to_bl_unmatched.csv')}`)
}

await main()
