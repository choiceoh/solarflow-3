#!/usr/bin/env bun
/**
 * 각 unresolved 케이스의 부모/조부모/증조부모 폴더의 모든 파일 (PDF + 기타) 출력.
 * 사람이 직접 BL 후보를 눈으로 찾기 위한 dump.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'

const ROOT = 'C:/Users/user/Dropbox (개인용)/8. 코딩/솔라플로우 참고 자료'
const INV_CSV = join(import.meta.dir, 'output', 'pl_bl_inventory.csv')
const UNRESOLVED = join(import.meta.dir, 'output', 'pl_only_unresolved.csv')

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

async function listDir(absDir: string) {
  try {
    const entries = await readdir(absDir, { withFileTypes: true })
    const out: string[] = []
    for (const e of entries) {
      const tag = e.isDirectory() ? '[D]' : '   '
      out.push(`  ${tag} ${e.name}`)
    }
    return out
  } catch (err) {
    return [`  (read fail: ${err instanceof Error ? err.message : err})`]
  }
}

async function main() {
  // 1. inventory 에서 각 group → 첫 PL relPath
  let invText = await readFile(INV_CSV, 'utf8')
  if (invText.charCodeAt(0) === 0xfeff) invText = invText.slice(1)
  const invRows = parseCsv(invText)
  const [invHeader, ...invBody] = invRows
  const idxOf = Object.fromEntries(invHeader.map((h, i) => [h, i])) as Record<string, number>
  const groupToRel = new Map<string, string>()
  for (const r of invBody) {
    if (r.length < 7) continue
    const key = `${r[idxOf['year']]}::${r[idxOf['vendor']]}::${r[idxOf['prefix']]}`
    if (!groupToRel.has(key) && r[idxOf['file_type']] === 'PL') {
      groupToRel.set(key, r[idxOf['rel_path']])
    }
  }

  // 2. unresolved 13건 읽기
  let unText = await readFile(UNRESOLVED, 'utf8')
  if (unText.charCodeAt(0) === 0xfeff) unText = unText.slice(1)
  const unRows = parseCsv(unText)
  const [unHeader, ...unBody] = unRows
  const unIdx = Object.fromEntries(unHeader.map((h, i) => [h, i])) as Record<string, number>

  const lines: string[] = []
  for (let i = 0; i < unBody.length; i++) {
    const r = unBody[i]
    if (r.length < 4) continue
    const year = r[unIdx['year']]
    const vendor = r[unIdx['vendor']]
    const prefix = r[unIdx['prefix']]
    const plFiles = r[unIdx['pl_files']]
    const plIds = r[unIdx['pl_ids']]

    const key = `${year}::${vendor}::${prefix}`
    const rel = groupToRel.get(key)
    if (!rel) {
      lines.push(`### ${i + 1}. ${vendor} / ${prefix} (NO REL)`)
      continue
    }
    const abs = join(ROOT, rel)
    const parent = dirname(abs)
    const grand = dirname(parent)
    const ggrand = dirname(grand)

    lines.push(`\n### ${i + 1}. ${vendor} / ${prefix} (${year})`)
    lines.push(`PL files: ${plFiles}`)
    lines.push(`PL ids:   ${plIds || '(none)'}`)
    lines.push(`Parent:   ${basename(parent)}`)
    lines.push(`Path:     ${parent}`)
    lines.push('')
    lines.push('--- parent contents ---')
    lines.push(...(await listDir(parent)))
    lines.push('')
    lines.push(`--- grandparent (${basename(grand)}) ---`)
    lines.push(...(await listDir(grand)))
    lines.push('')
    lines.push(`--- great-grandparent (${basename(ggrand)}) ---`)
    lines.push(...(await listDir(ggrand)))
  }

  console.log(lines.join('\n'))
}

await main()
