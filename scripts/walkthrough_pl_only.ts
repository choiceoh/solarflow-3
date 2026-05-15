#!/usr/bin/env bun
/**
 * walkthrough_pl_only.ts — PL only 69건을 사람이 한 건씩 검토하기 쉬운 마크다운으로 출력.
 *
 * 각 케이스에 대해:
 *   - PL/CI 파일 경로 (Dropbox 절대경로)
 *   - 같은 폴더의 모든 PDF/ZIP
 *   - 부모 폴더 (한 칸 위) 의 PDF/ZIP
 *   - BL 후보 추론 (filename pattern + ID overlap)
 *   - "확인 필요" 체크박스
 *
 * 출력: scripts/output/pl_only_walkthrough.md
 */

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'

const DEFAULT_ROOT = 'C:/Users/user/Dropbox (개인용)/8. 코딩/솔라플로우 참고 자료'
const INV_CSV = join(import.meta.dir, 'output', 'pl_bl_inventory.csv')
const DIAG_CSV = join(import.meta.dir, 'output', 'pl_only_diagnosis.csv')
const OUT_MD = join(import.meta.dir, 'output', 'pl_only_walkthrough.md')

type InvRow = {
  year: string
  vendor: string
  prefix: string
  fileType: string
  filename: string
  relPath: string
}

type DiagRow = {
  year: string
  vendor: string
  prefix: string
  plCount: number
  ciCount: number
  sampleFilename: string
  parentFolder: string
  siblingBlPdfs: string
  parentZips: string
  enhancedIds: string
  hypothesis: string
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
      } else if (c === '"') {
        inQ = false
      } else {
        field += c
      }
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
      } else {
        field += c
      }
    }
  }
  if (field !== '' || cur.length) {
    cur.push(field)
    rows.push(cur)
  }
  return rows
}

async function loadCsv<T>(path: string, map: (r: string[], idx: Record<string, number>) => T): Promise<T[]> {
  let text = await readFile(path, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows = parseCsv(text)
  const [header, ...body] = rows
  const idx = Object.fromEntries(header.map((h, i) => [h, i])) as Record<string, number>
  return body.filter((r) => r.length > 1).map((r) => map(r, idx))
}

async function listDir(absDir: string): Promise<{ pdfs: string[]; zips: string[]; sub: string[] }> {
  try {
    const names = await readdir(absDir, { withFileTypes: true })
    const pdfs: string[] = []
    const zips: string[] = []
    const sub: string[] = []
    for (const e of names) {
      if (e.isDirectory()) sub.push(e.name)
      else if (/\.pdf$/i.test(e.name)) pdfs.push(e.name)
      else if (/\.zip$/i.test(e.name)) zips.push(e.name)
    }
    return { pdfs, zips, sub }
  } catch {
    return { pdfs: [], zips: [], sub: [] }
  }
}

function fileLabel(name: string): string {
  const up = name.toUpperCase().replace(/\.PDF$/, '')
  if (/(^|[ _])HBL\b|HOUSE.?BL/.test(up)) return 'HBL'
  if (/(^|[ _])OBL\b|OCEAN.?BL/.test(up)) return 'OBL'
  if (/(^|[ _])BL([ _.]|$)|BL[ _]DRAFT|BL[ _]UPDATE/.test(up)) return 'BL'
  if (/CI ?& ?PL|CI[_ ]?PL|PACKING.?LIST/.test(up)) return 'PL'
  if (/(^|[ _])PL([ _.]|$)/.test(up)) return 'PL'
  if (/(^|[ _])CI([ _.]|$)|COMMERCIAL.?INVOICE/.test(up)) return 'CI'
  return '·'
}

async function main() {
  const inv = await loadCsv<InvRow>(INV_CSV, (r, idx) => ({
    year: r[idx['year']] ?? '',
    vendor: r[idx['vendor']] ?? '',
    prefix: r[idx['prefix']] ?? '',
    fileType: r[idx['file_type']] ?? '',
    filename: r[idx['filename']] ?? '',
    relPath: r[idx['rel_path']] ?? '',
  }))

  const diag = await loadCsv<DiagRow>(DIAG_CSV, (r, idx) => ({
    year: r[idx['year']] ?? '',
    vendor: r[idx['vendor']] ?? '',
    prefix: r[idx['prefix']] ?? '',
    plCount: Number(r[idx['pl_count']] ?? 0),
    ciCount: Number(r[idx['ci_count']] ?? 0),
    sampleFilename: r[idx['sample_filename']] ?? '',
    parentFolder: r[idx['parent_folder']] ?? '',
    siblingBlPdfs: r[idx['sibling_bl_pdfs']] ?? '',
    parentZips: r[idx['parent_zips']] ?? '',
    enhancedIds: r[idx['enhanced_ids_in_filename']] ?? '',
    hypothesis: r[idx['hypothesis']] ?? '',
  }))

  // 그룹별 모든 파일 가져오기
  const filesByGroup = new Map<string, InvRow[]>()
  for (const r of inv) {
    const key = `${r.year}::${r.vendor}::${r.prefix}`
    const a = filesByGroup.get(key) ?? []
    a.push(r)
    filesByGroup.set(key, a)
  }

  // H1 → H2 → H3 → H4 순으로 정렬
  const order: Record<string, number> = { H1: 1, H2: 2, H3: 3, H4: 4 }
  diag.sort((a, b) => {
    const oa = order[a.hypothesis] ?? 9
    const ob = order[b.hypothesis] ?? 9
    if (oa !== ob) return oa - ob
    return (a.year + a.vendor + a.prefix).localeCompare(b.year + b.vendor + b.prefix)
  })

  const md: string[] = []
  md.push('# PL Only 69건 워크스루')
  md.push('')
  md.push(`생성: ${new Date().toISOString()}`)
  md.push(`경로 prefix: \`${DEFAULT_ROOT}\``)
  md.push('')
  md.push(
    `규칙: 각 케이스 아래 "BL 후보" 줄에 ✓ 박으면 매칭 OK / "보관 없음" 박으면 H4 확정 / 메모 자유.`,
  )
  md.push('')

  // 가설별 섹션
  const groupedByHyp = new Map<string, DiagRow[]>()
  for (const d of diag) {
    const arr = groupedByHyp.get(d.hypothesis) ?? []
    arr.push(d)
    groupedByHyp.set(d.hypothesis, arr)
  }

  const hypTitle: Record<string, string> = {
    H1: '같은/근처 폴더에 BL 파일이 다른 prefix 로 존재 (매칭 휴리스틱 개선으로 잡힘)',
    H2: 'dash 포함 ID — 정규식 강화 시 매칭 가능',
    H3: '근처에 zip 존재 — 압축 안에 BL 있을 가능성',
    H4: 'BL 파일이 안 보임 (샘플·미수령·다른 곳 보관 추정)',
  }

  for (const hyp of ['H1', 'H2', 'H3', 'H4']) {
    const rows = groupedByHyp.get(hyp) ?? []
    if (!rows.length) continue
    md.push(`## ${hyp} (${rows.length}건) — ${hypTitle[hyp]}`)
    md.push('')

    for (let i = 0; i < rows.length; i++) {
      const d = rows[i]
      const key = `${d.year}::${d.vendor}::${d.prefix}`
      const files = filesByGroup.get(key) ?? []
      const samplePath = files[0]?.relPath ?? d.sampleFilename
      const absSample = join(DEFAULT_ROOT, samplePath)
      const parentAbs = dirname(absSample)
      const grandAbs = dirname(parentAbs)

      const parent = await listDir(parentAbs)
      const grand = await listDir(grandAbs)

      md.push(`### ${hyp}-${i + 1}. ${d.vendor} / ${d.prefix} (${d.year})`)
      md.push('')
      md.push(`- PL/CI 파일 (그룹 ${files.length}개):`)
      for (const f of files) {
        md.push(`  - [${f.fileType}] \`${f.filename}\``)
      }
      md.push(`- 부모 폴더: \`${basename(parentAbs)}\``)

      // 부모 폴더의 모든 PDF (BL 후보 강조)
      const parentList = parent.pdfs.filter((n) => !files.some((f) => f.filename === n))
      if (parentList.length) {
        md.push(`- 같은 폴더의 다른 PDF (BL 후보 우선):`)
        for (const n of parentList) {
          const label = fileLabel(n)
          const tag = label === 'BL' || label === 'OBL' || label === 'HBL' ? `**[${label}]**` : `[${label}]`
          md.push(`  - ${tag} \`${n}\``)
        }
      }
      // 부모 폴더 zip
      if (parent.zips.length) {
        md.push(`- 같은 폴더 zip: ${parent.zips.map((z) => `\`${z}\``).join(', ')}`)
      }
      // 조부모 zip
      if (grand.zips.length && hyp === 'H3') {
        md.push(`- 한 칸 위 zip: ${grand.zips.map((z) => `\`${z}\``).join(', ')}`)
      }
      // 한 칸 위 BL 후보
      const gpBlCands = grand.pdfs.filter((n) => /(^|[ _])(BL|OBL|HBL)([ _.]|$)/i.test(n))
      if (gpBlCands.length && hyp === 'H1') {
        md.push(`- 한 칸 위에 BL 후보: ${gpBlCands.map((n) => `\`${n}\``).join(', ')}`)
      }

      md.push(`- 확인: [ ] BL = \`__________\` / [ ] 보관 없음 / 메모: __________`)
      md.push(`- 풀경로: \`${parentAbs}\``)
      md.push('')
    }
  }

  await writeFile(OUT_MD, md.join('\n'), 'utf8')
  console.log(`작성: ${OUT_MD}`)
  console.log(`총 ${diag.length}건 (H1=${(groupedByHyp.get('H1') ?? []).length}, H2=${(groupedByHyp.get('H2') ?? []).length}, H3=${(groupedByHyp.get('H3') ?? []).length}, H4=${(groupedByHyp.get('H4') ?? []).length})`)
}

await main()
