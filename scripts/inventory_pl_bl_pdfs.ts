#!/usr/bin/env bun
/**
 * inventory_pl_bl_pdfs.ts — Dropbox 참고 자료 폴더에서 PL/BL/CI PDF 인벤토리.
 *
 * 목적:
 *   - 무역 선적서류 PDF (Packing List / Bill of Lading / Commercial Invoice 등) 를
 *     shipment prefix 단위로 묶어 CSV 로 출력.
 *   - 이후 단계 (DB 매칭 + document_files 백필) 의 입력 자료가 된다.
 *
 * 입력:
 *   - --root <dir>   기본: 'C:/Users/user/Dropbox (개인용)/8. 코딩/솔라플로우 참고 자료'
 *
 * 출력:
 *   - scripts/output/pl_bl_inventory.csv  파일 단위 (file_type 분류)
 *   - scripts/output/pl_bl_pairs.csv      shipment prefix 단위 (BL/PL/CI 유무)
 *   - stdout: 요약 (벤더별/연도별 개수, 매칭 불가 경고)
 *
 * 매칭 키 추출 규칙 (filename + parent folder 기반 휴리스틱):
 *   1) 파일명 안에 [A-Z]{2,5}\d{8,12} 형식 ID 가 있으면 그것이 prefix (예: SHKWA25019106, RSPN251920, DJSCNGB260008239)
 *   2) 없으면 parent 폴더명에서 같은 패턴 추출 (예: 'RE_ 8000363763,DJSCNGB260008239_...')
 *   3) 그래도 없으면 parent 폴더명 + ' (no-id)' 그룹
 *
 * file_type 분류:
 *   - BL: '" BL"', '" BL."', '"BL_"', '"_BL_"', 'BL DRAFT'
 *   - PL: '" PL"', '" PL."', '"PL_"', '"_PL_"', 'CI&PL', 'CI PL'
 *   - CI: '" CI"', '"CI_"', 'Commercial Invoice'
 *   - HBL/OBL: 별도 분류 (House BL / Ocean BL)
 *   - other: 위에 해당 없음
 */

import { readdir, stat, mkdir, writeFile } from 'node:fs/promises'
import { join, basename, dirname, relative } from 'node:path'

type FileEntry = {
  path: string
  rel: string
  filename: string
  parent: string
  size: number
  vendor: string
  year: string
  prefix: string
  fileType: 'BL' | 'PL' | 'CI' | 'HBL' | 'OBL' | 'other'
}

const DEFAULT_ROOT = 'C:/Users/user/Dropbox (개인용)/8. 코딩/솔라플로우 참고 자료'

function parseArgs(): { root: string } {
  const args = process.argv.slice(2)
  let root = DEFAULT_ROOT
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) {
      root = args[i + 1]
      i++
    }
  }
  return { root }
}

async function* walkPdfs(dir: string): AsyncGenerator<string> {
  let entries: string[] = []
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const full = join(dir, name)
    let s
    try {
      s = await stat(full)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      yield* walkPdfs(full)
    } else if (/\.pdf$/i.test(name)) {
      yield full
    }
  }
}

// `_` 는 \b 가 word-char 로 보기 때문에 'LS2504998845_BL' 안의 ID 가 안 잡힌다.
// 문자/숫자만 boundary 로 보고, _ / space / punct 는 boundary 로 허용.
const ID_RE = /(?<![A-Z0-9])([A-Z]{2,8}\d{6,14})(?![A-Z0-9])/

function extractPrefix(filename: string, parent: string): string {
  const fromFile = filename.match(ID_RE)
  if (fromFile) return fromFile[1]
  const fromParent = parent.match(ID_RE)
  if (fromParent) return fromParent[1]
  return `${parent} (no-id)`
}

function classify(filename: string): FileEntry['fileType'] {
  const upper = filename.toUpperCase()
  const stem = upper.replace(/\.PDF$/, '')

  // boundary: 알파벳 아닌 모든 문자 (dash, underscore, space, comma, 끝) 허용
  // → '-BL.pdf', '-BL_', 'BL,', 'BL-' 등 모두 매치
  // HBL/OBL 류 (House BL / Ocean BL / House Way Bill 등 항공·해상 운송장 변형) → 'HBL' 로 통합
  if (/(?<![A-Z])(HBL|HWB|HAWB|MAWB|AWB)(?![A-Z])|HOUSE.?BL/.test(stem)) return 'HBL'
  if (/(?<![A-Z])OBL(?![A-Z])|OCEAN.?BL/.test(stem)) return 'OBL'

  if (/CI ?& ?PL|CI[_ -]?PL|PACKING.?LIST/.test(stem)) return 'PL'
  if (/(?<![A-Z])PL(?![A-Z])/.test(stem)) return 'PL'

  if (
    /(?<![A-Z])BL(?![A-Z])|BL[ _-]DRAFT|BL[ _-]UPDATE|BL[ _-]COPY|COPY[ _-]BL/.test(stem) ||
    /提单/.test(filename) // 중국어 提单 = Bill of Lading (filename 원문에서 검사)
  )
    return 'BL'

  if (/(?<![A-Z])CI(?![A-Z])|COMMERCIAL.?INVOICE/.test(stem)) return 'CI'

  return 'other'
}

function extractVendorYear(rel: string): { vendor: string; year: string } {
  // expect rel = '<year> 모듈 발주/<vendor>/...' or similar
  const parts = rel.split(/[\\/]/)
  const yearPart = parts[0] ?? ''
  const yearMatch = yearPart.match(/(\d{4})/)
  const year = yearMatch ? yearMatch[1] : ''
  const vendor = parts[1] ?? ''
  return { vendor, year }
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '')
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function main() {
  const { root } = parseArgs()
  console.error(`scanning: ${root}`)

  const files: FileEntry[] = []
  for await (const full of walkPdfs(root)) {
    const filename = basename(full)
    const parent = basename(dirname(full))
    const rel = relative(root, full)
    // 도메인 외 제외: '클립' (모듈 고정 부자재, 모듈 PL/BL 아님)
    if (/[\\/]클립[\\/]/.test(rel) || /클립\s*\d/.test(parent)) continue
    let size = 0
    try {
      size = (await stat(full)).size
    } catch {
      // ignore
    }
    const { vendor, year } = extractVendorYear(rel)
    const fileType = classify(filename)
    // 노이즈 컷: PL/BL/CI/HBL/OBL 가 아니면 인벤토리에서 제외 (계약서/필증/사양서 등)
    if (fileType === 'other') continue
    const prefix = extractPrefix(filename, parent)
    files.push({ path: full, rel, filename, parent, size, vendor, year, prefix, fileType })
  }

  // group by prefix
  type Group = {
    prefix: string
    vendor: string
    year: string
    files: FileEntry[]
    has: Record<FileEntry['fileType'], number>
  }
  const groups = new Map<string, Group>()
  for (const f of files) {
    const key = `${f.year}::${f.vendor}::${f.prefix}`
    let g = groups.get(key)
    if (!g) {
      g = {
        prefix: f.prefix,
        vendor: f.vendor,
        year: f.year,
        files: [],
        has: { BL: 0, PL: 0, CI: 0, HBL: 0, OBL: 0, other: 0 },
      }
      groups.set(key, g)
    }
    g.files.push(f)
    g.has[f.fileType] = (g.has[f.fileType] ?? 0) + 1
  }

  const outDir = join(import.meta.dir, 'output')
  await mkdir(outDir, { recursive: true })

  // 1) 파일 단위 인벤토리
  const invHeader = ['year', 'vendor', 'prefix', 'file_type', 'filename', 'size_bytes', 'rel_path']
  const invRows = [invHeader.join(',')]
  for (const f of files.sort(
    (a, b) =>
      (a.year || '').localeCompare(b.year || '') ||
      a.vendor.localeCompare(b.vendor) ||
      a.prefix.localeCompare(b.prefix) ||
      a.fileType.localeCompare(b.fileType) ||
      a.filename.localeCompare(b.filename),
  )) {
    invRows.push(
      [f.year, f.vendor, f.prefix, f.fileType, f.filename, f.size, f.rel].map(csvEscape).join(','),
    )
  }
  const invPath = join(outDir, 'pl_bl_inventory.csv')
  await writeFile(invPath, '﻿' + invRows.join('\n'), 'utf8')

  // 2) shipment prefix 단위 페어링
  const pairHeader = [
    'year',
    'vendor',
    'prefix',
    'has_BL',
    'has_PL',
    'has_CI',
    'has_HBL',
    'has_OBL',
    'file_count',
    'sample_filenames',
  ]
  const pairRows = [pairHeader.join(',')]
  const sortedGroups = [...groups.values()].sort(
    (a, b) =>
      (a.year || '').localeCompare(b.year || '') ||
      a.vendor.localeCompare(b.vendor) ||
      a.prefix.localeCompare(b.prefix),
  )
  for (const g of sortedGroups) {
    const sample = g.files
      .slice(0, 6)
      .map((f) => `${f.fileType}:${f.filename}`)
      .join(' | ')
    pairRows.push(
      [
        g.year,
        g.vendor,
        g.prefix,
        g.has.BL,
        g.has.PL,
        g.has.CI,
        g.has.HBL,
        g.has.OBL,
        g.files.length,
        sample,
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  const pairPath = join(outDir, 'pl_bl_pairs.csv')
  await writeFile(pairPath, '﻿' + pairRows.join('\n'), 'utf8')

  // 요약 stdout
  const byVendor = new Map<string, number>()
  const byYear = new Map<string, number>()
  for (const g of sortedGroups) {
    byVendor.set(g.vendor, (byVendor.get(g.vendor) ?? 0) + 1)
    byYear.set(g.year, (byYear.get(g.year) ?? 0) + 1)
  }

  const totalFiles = files.length
  const totalGroups = sortedGroups.length
  // BL/OBL/HBL 모두 ocean/house BL → "BL 류" 로 통합 카운트
  const hasAnyBl = (g: Group) => g.has.BL > 0 || g.has.OBL > 0 || g.has.HBL > 0
  const bothBlAndPl = sortedGroups.filter((g) => hasAnyBl(g) && g.has.PL > 0).length
  const blOnly = sortedGroups.filter((g) => hasAnyBl(g) && g.has.PL === 0).length
  const plOnly = sortedGroups.filter((g) => !hasAnyBl(g) && g.has.PL > 0).length

  console.log('')
  console.log('=== PL/BL PDF 인벤토리 요약 ===')
  console.log(`총 PDF 파일: ${totalFiles}`)
  console.log(`고유 shipment prefix: ${totalGroups}`)
  console.log(`  BL+PL 둘 다 있음: ${bothBlAndPl}`)
  console.log(`  BL 만:           ${blOnly}`)
  console.log(`  PL 만:           ${plOnly}`)
  console.log('')
  console.log('연도별 prefix 수:')
  for (const [year, n] of [...byYear.entries()].sort()) {
    console.log(`  ${year || '(unknown)'}: ${n}`)
  }
  console.log('')
  console.log('벤더별 prefix 수:')
  for (const [vendor, n] of [...byVendor.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${vendor || '(unknown)'}: ${n}`)
  }
  console.log('')
  console.log(`인벤토리:  ${invPath}`)
  console.log(`페어링:    ${pairPath}`)
}

await main()
