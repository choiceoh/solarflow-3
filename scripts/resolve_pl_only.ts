#!/usr/bin/env bun
/**
 * resolve_pl_only.ts — PL only 69건의 BL 후보를 자동으로 찾는다.
 *
 * 알고리즘:
 *   1. Dropbox 트리의 모든 PDF 를 인덱싱 (filename + parent path + 추출 ID 셋)
 *   2. 모든 PDF 에 file_type 라벨링 (BL/OBL/HBL/PL/CI/other)
 *   3. PL-only 그룹마다:
 *        - 그룹 내 PL/CI 파일에서 ID 셋 추출 (파일명 + 부모 폴더명 + 조부모 폴더명)
 *        - 전체 트리에서 BL/OBL/HBL 라벨 + ID 교집합 있는 파일 찾기
 *        - 점수: ID 일치 수 × 5 + 같은 폴더 보너스 10 + 같은 부모 보너스 5
 *        - 최고점 후보 = matched_bl, 동점이면 같은 폴더 우선
 *   4. 결과 CSV: prefix, pl_files, matched_bl_path, score, alternatives
 *
 * 출력:
 *   scripts/output/pl_only_matched.csv      자동 매칭 결과 (1차 정본)
 *   scripts/output/pl_only_unresolved.csv   매칭 실패 (사람 검토 필요)
 *   stdout 요약
 */

import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'

const ROOT = 'C:/Users/user/Dropbox (개인용)/8. 코딩/솔라플로우 참고 자료'
const INV_CSV = join(import.meta.dir, 'output', 'pl_bl_inventory.csv')

const ID_RES = [
  /(?<![A-Z0-9])([A-Z]{2,8}\d{6,14})(?![A-Z0-9])/g,
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

function classify(filename: string): 'BL' | 'OBL' | 'HBL' | 'PL' | 'CI' | 'other' {
  const up = filename.toUpperCase().replace(/\.PDF$/, '')
  // HBL/HWB/HAWB/MAWB/AWB 모두 항공·해상 운송장 변형 → 'HBL' 통합
  if (/(?<![A-Z])(HBL|HWB|HAWB|MAWB|AWB)(?![A-Z])|HOUSE.?BL/.test(up)) return 'HBL'
  if (/(?<![A-Z])OBL(?![A-Z])|OCEAN.?BL/.test(up)) return 'OBL'
  if (/CI ?& ?PL|CI[_ -]?PL|PACKING.?LIST/.test(up)) return 'PL'
  if (/(?<![A-Z])PL(?![A-Z])/.test(up)) return 'PL'
  // BL: 일반 분리형 + 포워더 시리얼 안 BL (JBL/MBL/SBL/CBL 등) + 중국어 提单
  if (
    /(?<![A-Z])BL(?![A-Z])|BL[ _-]DRAFT|BL[ _-]UPDATE|BL[ _-]COPY|COPY[ _-]BL|BL NO/.test(up) ||
    /(?<![A-Z])[A-Z]{2,10}BL\d{4,}(?!\d)/.test(up) || // 포워더 BL 시리얼 (PCSLJBL001250720, PCCLBL... 등 — BL 앞 2~10자 알파벳 + 뒤 4자+ 숫자)
    /提单/.test(filename)
  )
    return 'BL'
  if (/(?<![A-Z])CI(?![A-Z])|COMMERCIAL.?INVOICE/.test(up)) return 'CI'
  return 'other'
}

type IndexedFile = {
  abs: string
  filename: string
  parent: string
  grand: string
  fileType: ReturnType<typeof classify>
  ids: Set<string>
}

async function* walkPdfs(dir: string): AsyncGenerator<string> {
  let names: string[] = []
  try {
    names = await readdir(dir)
  } catch {
    return
  }
  for (const n of names) {
    const full = join(dir, n)
    let s
    try {
      s = await stat(full)
    } catch {
      continue
    }
    if (s.isDirectory()) yield* walkPdfs(full)
    else if (/\.pdf$/i.test(n)) yield full
  }
}

async function buildIndex(): Promise<IndexedFile[]> {
  const out: IndexedFile[] = []
  for await (const abs of walkPdfs(ROOT)) {
    const filename = basename(abs)
    const parent = basename(dirname(abs))
    const grand = basename(dirname(dirname(abs)))
    const ids = new Set([
      ...extractIds(filename),
      ...extractIds(parent),
      ...extractIds(grand),
    ])
    out.push({
      abs,
      filename,
      parent,
      grand,
      fileType: classify(filename),
      ids,
    })
  }
  return out
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

async function main() {
  console.error('인덱싱 중...')
  const idx = await buildIndex()
  console.error(`인덱싱 완료: PDF ${idx.length}개`)
  const bls = idx.filter((f) => f.fileType === 'BL' || f.fileType === 'OBL' || f.fileType === 'HBL')
  console.error(`BL/OBL/HBL: ${bls.length}개`)

  // 인벤토리 CSV 에서 PL only 그룹 추출
  let invText = await readFile(INV_CSV, 'utf8')
  if (invText.charCodeAt(0) === 0xfeff) invText = invText.slice(1)
  const invRows = parseCsv(invText)
  const [invHeader, ...invBody] = invRows
  const idxOf = Object.fromEntries(invHeader.map((h, i) => [h, i])) as Record<string, number>

  type GroupKey = string
  const groupFiles = new Map<GroupKey, { year: string; vendor: string; prefix: string; types: Set<string>; files: { type: string; filename: string; relPath: string }[] }>()

  for (const r of invBody) {
    if (r.length < 7) continue
    const year = r[idxOf['year']] ?? ''
    const vendor = r[idxOf['vendor']] ?? ''
    const prefix = r[idxOf['prefix']] ?? ''
    const type = r[idxOf['file_type']] ?? ''
    const filename = r[idxOf['filename']] ?? ''
    const relPath = r[idxOf['rel_path']] ?? ''
    const key = `${year}::${vendor}::${prefix}`
    let g = groupFiles.get(key)
    if (!g) {
      g = { year, vendor, prefix, types: new Set(), files: [] }
      groupFiles.set(key, g)
    }
    g.types.add(type)
    g.files.push({ type, filename, relPath })
  }

  // BL/OBL/HBL 모두 ocean/house BL → "BL 류" 로 통합. 셋 다 없고 PL 있는 경우만 PL-only.
  const plOnlyGroups = [...groupFiles.entries()].filter(
    ([, g]) => g.types.has('PL') && !g.types.has('BL') && !g.types.has('OBL') && !g.types.has('HBL'),
  )
  console.error(`PL-only 그룹: ${plOnlyGroups.length}개`)

  type Match = {
    year: string
    vendor: string
    prefix: string
    plFilenames: string
    plIds: string
    matchedBlAbs: string
    matchedBlFilename: string
    matchedBlType: string
    score: number
    alternatives: string
    reason: string
  }
  const matches: Match[] = []
  const unresolved: { year: string; vendor: string; prefix: string; plFilenames: string; plIds: string; reason: string }[] = []

  for (const [, g] of plOnlyGroups) {
    // PL 그룹의 모든 ID + parent path
    const plFile = g.files[0]
    const plAbs = join(ROOT, plFile.relPath)
    const plParent = dirname(plAbs)
    const plGrand = dirname(plParent)

    const groupIds = new Set<string>()
    for (const f of g.files) {
      for (const id of extractIds(f.filename)) groupIds.add(id)
    }
    for (const id of extractIds(basename(plParent))) groupIds.add(id)
    for (const id of extractIds(basename(plGrand))) groupIds.add(id)

    // 점수 매기기
    type Cand = { f: IndexedFile; score: number; reason: string[] }
    const candidates: Cand[] = []
    for (const f of bls) {
      const overlap = [...groupIds].filter((id) => f.ids.has(id))
      let score = overlap.length * 5
      const reasons: string[] = []
      if (overlap.length > 0) reasons.push(`id매치=${overlap.join(',')}`)
      // 같은 부모 폴더 보너스 (큼)
      if (dirname(f.abs) === plParent) {
        score += 10
        reasons.push('같은폴더')
      } else if (dirname(dirname(f.abs)) === plParent || dirname(f.abs) === plGrand) {
        score += 5
        reasons.push('인접폴더')
      }
      if (score > 0) candidates.push({ f, score, reason: reasons })
    }
    candidates.sort((a, b) => b.score - a.score)

    // Fallback: 같은 폴더에 BL/OBL/HBL 류가 *정확히 1개* 존재하면, ID 안 맞아도 그게 답.
    // (포워더 시리얼 vs 인보이스 번호처럼 ID 가 다른 시스템인 경우)
    if (!candidates.length || candidates[0].score < 5) {
      const sameFolderBls = bls.filter((f) => dirname(f.abs) === plParent)
      if (sameFolderBls.length === 1) {
        candidates.unshift({
          f: sameFolderBls[0],
          score: 8,
          reason: ['단독BL폴백'],
        })
      } else if (sameFolderBls.length === 0) {
        // 한 단계 더: 부모 폴더가 1개 BL 만 있는 경우
        const sameGpBls = bls.filter((f) => dirname(f.abs) === plGrand)
        if (sameGpBls.length === 1) {
          candidates.unshift({
            f: sameGpBls[0],
            score: 6,
            reason: ['조부폴더단독BL폴백'],
          })
        }
        // 한 단계 더: 같은 폴더의 PDF 중 中文 '扫描件'/'正本' 단독 1개면 BL 정본 스캔으로 인정
        if (!candidates.length) {
          const chineseScan = idx.filter(
            (f) =>
              dirname(f.abs) === plParent &&
              f.fileType === 'other' &&
              /(扫描件|正本)/.test(f.filename) &&
              !/(发票|invoice|inv)/i.test(f.filename),
          )
          if (chineseScan.length === 1) {
            candidates.unshift({
              f: chineseScan[0],
              score: 7,
              reason: ['중문스캔본폴백'],
            })
          }
        }
      }
    }

    const top = candidates[0]
    if (top && top.score >= 5) {
      // 동점/같은 폴더 우선 처리는 이미 점수에 반영
      const alts = candidates
        .slice(1, 4)
        .map((c) => `${c.f.filename} (${c.score})`)
        .join(' | ')
      matches.push({
        year: g.year,
        vendor: g.vendor,
        prefix: g.prefix,
        plFilenames: g.files.map((f) => `${f.type}:${f.filename}`).join(' | '),
        plIds: [...groupIds].join(','),
        matchedBlAbs: top.f.abs,
        matchedBlFilename: top.f.filename,
        matchedBlType: top.f.fileType,
        score: top.score,
        alternatives: alts,
        reason: top.reason.join(' / '),
      })
    } else {
      unresolved.push({
        year: g.year,
        vendor: g.vendor,
        prefix: g.prefix,
        plFilenames: g.files.map((f) => `${f.type}:${f.filename}`).join(' | '),
        plIds: [...groupIds].join(','),
        reason: groupIds.size === 0 ? 'PL/CI 파일·폴더에서 ID 추출 실패' : 'ID 매칭되는 BL/OBL/HBL 파일 없음',
      })
    }
  }

  const outDir = join(import.meta.dir, 'output')
  const matchedHeader = ['year', 'vendor', 'prefix', 'pl_files', 'pl_ids', 'matched_bl_filename', 'matched_bl_type', 'score', 'reason', 'alternatives', 'matched_bl_abs']
  const matchedRows = [matchedHeader.join(',')]
  for (const m of matches.sort((a, b) => b.score - a.score)) {
    matchedRows.push(
      [
        m.year,
        m.vendor,
        m.prefix,
        m.plFilenames,
        m.plIds,
        m.matchedBlFilename,
        m.matchedBlType,
        m.score,
        m.reason,
        m.alternatives,
        m.matchedBlAbs,
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  await writeFile(join(outDir, 'pl_only_matched.csv'), '﻿' + matchedRows.join('\n'), 'utf8')

  const unresolvedHeader = ['year', 'vendor', 'prefix', 'pl_files', 'pl_ids', 'reason']
  const unresolvedRows = [unresolvedHeader.join(',')]
  for (const u of unresolved.sort((a, b) => a.vendor.localeCompare(b.vendor))) {
    unresolvedRows.push(
      [u.year, u.vendor, u.prefix, u.plFilenames, u.plIds, u.reason].map(csvEscape).join(','),
    )
  }
  await writeFile(join(outDir, 'pl_only_unresolved.csv'), '﻿' + unresolvedRows.join('\n'), 'utf8')

  // 신뢰도 buckets
  const high = matches.filter((m) => m.score >= 15).length
  const mid = matches.filter((m) => m.score >= 10 && m.score < 15).length
  const low = matches.filter((m) => m.score < 10).length

  console.log('')
  console.log(`PL-only 69건 자동 매칭 결과:`)
  console.log(`  매칭 성공: ${matches.length}건`)
  console.log(`    HIGH (score ≥ 15, ID+같은폴더): ${high}`)
  console.log(`    MID  (score 10-14, ID2개 또는 같은폴더만): ${mid}`)
  console.log(`    LOW  (score 5-9, ID 1개): ${low}`)
  console.log(`  미매칭: ${unresolved.length}건`)
  console.log('')
  console.log(`매칭:    ${join(outDir, 'pl_only_matched.csv')}`)
  console.log(`미매칭:  ${join(outDir, 'pl_only_unresolved.csv')}`)
}

await main()
