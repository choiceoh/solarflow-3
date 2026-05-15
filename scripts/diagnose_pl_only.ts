#!/usr/bin/env bun
/**
 * diagnose_pl_only.ts — PL only 그룹의 원인 분류.
 *
 * 입력: scripts/output/pl_bl_inventory.csv (rerun inventory if missing)
 * 출력:
 *   scripts/output/pl_only_diagnosis.csv  각 PL-only 그룹의 hypothesis
 *   stdout 요약 (원인별 카운트)
 *
 * 가설 (우선순위 순):
 *   H1: '같은 부모/조부모 폴더에 BL 파일이 다른 prefix 로 존재'  → 폴더 묶음 재정의 필요
 *   H2: '파일명에 dash 포함된 ID' (TED-2507-09808 / 8000363763,DJSCNGB260008239) → 정규식 강화 필요
 *   H3: 'BL 파일은 zip 안에 있음' → 같은 폴더에 .zip 또는 '선적서류 송부건.zip' 존재
 *   H4: 'BL 미수령 / 보관 안 됨' → 위 셋 다 해당 없음
 */

import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'

const DEFAULT_ROOT = 'C:/Users/user/Dropbox (개인용)/8. 코딩/솔라플로우 참고 자료'
const INV_CSV = join(import.meta.dir, 'output', 'pl_bl_inventory.csv')
const OUT_CSV = join(import.meta.dir, 'output', 'pl_only_diagnosis.csv')

type InvRow = {
  year: string
  vendor: string
  prefix: string
  fileType: string
  filename: string
  sizeBytes: number
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

async function loadInventory(): Promise<InvRow[]> {
  let text = await readFile(INV_CSV, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows = parseCsv(text)
  const [header, ...body] = rows
  const idx = Object.fromEntries(header.map((h, i) => [h, i])) as Record<string, number>
  return body
    .filter((r) => r.length >= 7)
    .map((r) => ({
      year: r[idx['year']] ?? '',
      vendor: r[idx['vendor']] ?? '',
      prefix: r[idx['prefix']] ?? '',
      fileType: r[idx['file_type']] ?? '',
      filename: r[idx['filename']] ?? '',
      sizeBytes: Number(r[idx['size_bytes']] ?? 0),
      relPath: r[idx['rel_path']] ?? '',
    }))
}

function groupByPrefix(rows: InvRow[]) {
  const m = new Map<string, InvRow[]>()
  for (const r of rows) {
    const key = `${r.year}::${r.vendor}::${r.prefix}`
    const arr = m.get(key) ?? []
    arr.push(r)
    m.set(key, arr)
  }
  return m
}

// Dash-tolerant 추출: 'TED-2507-09808', 'DJSCNGB260008239', 'TS-25-01'
const ID_RES = [
  /(?<![A-Z0-9])([A-Z]{2,8}\d{6,14})(?![A-Z0-9])/,
  /(?<![A-Z0-9-])([A-Z]{2,5}-\d{4}-\d{3,6})(?![A-Z0-9-])/,
  /(?<![A-Z0-9-])(\d{10,14})(?![A-Z0-9-])/,
]
function extractIds(text: string): string[] {
  const ids = new Set<string>()
  for (const re of ID_RES) {
    const g = new RegExp(re.source, 'g')
    let m: RegExpExecArray | null
    while ((m = g.exec(text)) !== null) {
      ids.add(m[1])
    }
  }
  return [...ids]
}

async function listSiblingPdfs(absDir: string): Promise<string[]> {
  try {
    const names = await readdir(absDir)
    const out: string[] = []
    for (const n of names) {
      if (/\.pdf$/i.test(n)) out.push(n)
    }
    return out
  } catch {
    return []
  }
}

async function listSiblingZips(absDir: string): Promise<string[]> {
  try {
    const names = await readdir(absDir)
    return names.filter((n) => /\.zip$/i.test(n))
  } catch {
    return []
  }
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '')
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function main() {
  const inv = await loadInventory()
  const groups = groupByPrefix(inv)

  // PL-only groups
  const plOnly: { key: string; files: InvRow[] }[] = []
  for (const [key, files] of groups) {
    const hasBL = files.some((f) => f.fileType === 'BL')
    const hasPL = files.some((f) => f.fileType === 'PL')
    if (!hasBL && hasPL) plOnly.push({ key, files })
  }

  const rows: string[] = []
  rows.push(
    [
      'year',
      'vendor',
      'prefix',
      'pl_count',
      'ci_count',
      'sample_filename',
      'parent_folder',
      'sibling_bl_pdfs',
      'parent_zips',
      'enhanced_ids_in_filename',
      'hypothesis',
    ].join(','),
  )

  const counts: Record<string, number> = { H1: 0, H2: 0, H3: 0, H4: 0 }

  for (const g of plOnly) {
    const [year, vendor, prefix] = g.key.split('::')
    const sample = g.files[0]
    const absSamplePath = join(DEFAULT_ROOT, sample.relPath)
    const parent = dirname(absSamplePath)
    const parentName = basename(parent)
    const grandparent = dirname(parent)
    const grandparentName = basename(grandparent)

    const [siblings, gpSiblings, parentZips, gpZips] = await Promise.all([
      listSiblingPdfs(parent),
      listSiblingPdfs(grandparent),
      listSiblingZips(parent),
      listSiblingZips(grandparent),
    ])

    // BL 후보 (파일명에 ' BL' or '_BL_' 또는 BL_<digit>)
    const blRe = /(^|[ _])BL([ _.]|$)|BL[ _]DRAFT/i
    const blSiblings = siblings.filter((n) => blRe.test(n))
    const blGpSiblings = gpSiblings.filter((n) => blRe.test(n))

    // dash-tolerant 추출
    const enhancedIds = new Set<string>()
    for (const f of g.files) {
      for (const id of extractIds(f.filename)) enhancedIds.add(id)
      for (const id of extractIds(parentName)) enhancedIds.add(id)
      for (const id of extractIds(grandparentName)) enhancedIds.add(id)
    }

    let hyp: 'H1' | 'H2' | 'H3' | 'H4' = 'H4'
    if (blSiblings.length > 0 || blGpSiblings.length > 0) hyp = 'H1'
    else if (parentZips.length > 0 || gpZips.length > 0) hyp = 'H3'
    else if (enhancedIds.size > 0 && !prefix.includes('(no-id)')) hyp = 'H4'
    else if (enhancedIds.size > 0) hyp = 'H2'
    counts[hyp]++

    const plCount = g.files.filter((f) => f.fileType === 'PL').length
    const ciCount = g.files.filter((f) => f.fileType === 'CI').length

    rows.push(
      [
        year,
        vendor,
        prefix,
        plCount,
        ciCount,
        sample.filename,
        parentName,
        [...blSiblings, ...blGpSiblings.map((n) => '../' + n)].slice(0, 6).join(' | '),
        [...parentZips, ...gpZips.map((n) => '../' + n)].slice(0, 4).join(' | '),
        [...enhancedIds].slice(0, 5).join(' | '),
        hyp,
      ]
        .map(csvEscape)
        .join(','),
    )
  }

  await writeFile(OUT_CSV, '﻿' + rows.join('\n'), 'utf8')
  console.log('')
  console.log(`PL-only 그룹 ${plOnly.length}건 분류:`)
  console.log(`  H1 (같은 폴더에 BL 파일이 따로 존재): ${counts.H1}`)
  console.log(`  H2 (dash 포함 ID — 정규식 강화하면 매칭 가능): ${counts.H2}`)
  console.log(`  H3 (BL 이 zip 안에 있음): ${counts.H3}`)
  console.log(`  H4 (BL 진짜 없음 / 보관 안 됨 추정): ${counts.H4}`)
  console.log('')
  console.log(`상세: ${OUT_CSV}`)
}

await main()
