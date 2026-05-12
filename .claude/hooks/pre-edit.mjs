#!/usr/bin/env node
// pre-edit.mjs — Edit/Write/MultiEdit 직전 hook (Node 18+ ESM)
//
// 역할: 변경 대상 file 의 도메인을 식별 후 blast_radius / depends_on 을
//       stdout JSON {hookSpecificOutput.additionalContext} 로 출력.
//       Claude 가 다음 턴 system context 로 자동 주입.
//
// 동작: 모든 모드에서 exit 0. PreToolUse 는 *Edit 전* 이라 verify 무관 — STRICT 영향 없음.
//
// spec: https://code.claude.com/docs/en/hooks
// 자매: post-edit.mjs, .claude/hooks/domains.json

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function compileGlob(pattern) {
  // trailing slash 는 디렉토리 prefix 매칭으로 (domains/po/ → 그 안 모든 file)
  if (pattern.endsWith('/')) {
    pattern = pattern + '**'
  }
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__GLOBSTAR__/g, '.*')
  return new RegExp('^' + escaped + '$')
}

function normalize(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}

function findDomain(filePath, db) {
  const rel = normalize(filePath)
  for (const [id, def] of Object.entries(db.domains)) {
    if (!def.paths) continue
    for (const pat of def.paths) {
      if (compileGlob(normalize(pat)).test(rel)) return id
    }
  }
  for (const { glob, domain_id } of db.path_to_domain_fallback ?? []) {
    if (compileGlob(normalize(glob)).test(rel)) return domain_id
  }
  return null
}

function findGlobalHints(filePath, db) {
  const rel = normalize(filePath)
  const out = []
  for (const [pat, hints] of Object.entries(db.global_hints ?? {})) {
    if (compileGlob(normalize(pat)).test(rel)) {
      out.push(...hints)
    }
  }
  return out
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  let s = Buffer.concat(chunks).toString('utf8')
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1)
  return s
}

async function main() {
  let raw = ''
  try {
    raw = await readStdin()
  } catch {
    process.exit(0)
  }
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    process.exit(0)
  }
  const filePath = input.tool_input?.file_path
  if (!filePath) process.exit(0)

  const dbPath = join(__dirname, 'domains.json')
  let db
  try {
    db = JSON.parse(readFileSync(dbPath, 'utf8'))
  } catch {
    process.exit(0)
  }

  const domainId = findDomain(filePath, db)
  const globalHints = findGlobalHints(filePath, db)

  const lines = []

  if (domainId && domainId.startsWith('_')) {
    const sp = db.special_paths?.[domainId]
    if (sp) {
      lines.push(`\n[domain] ${domainId} — ${sp.display_name}`)
      for (const item of sp.blast_radius ?? []) {
        lines.push(`  - ${item}`)
      }
    }
  } else if (domainId) {
    const def = db.domains[domainId]
    if (def) {
      lines.push(`\n[domain] ${domainId} — ${def.display_name}`)
      if (def.feature_id) lines.push(`  feature: ${def.feature_id}`)
      if (def.depends_on?.length) {
        lines.push(`  의존 도메인: ${def.depends_on.join(', ')}`)
      }
      if (def.blast_radius?.length) {
        lines.push('  같이 봐야 할 곳:')
        for (const item of def.blast_radius) {
          lines.push(`  - ${item}`)
        }
      }
    } else {
      lines.push(`\n[domain] ${domainId} (manifest 미작성)`)
    }
  }

  if (globalHints.length > 0) {
    lines.push('\n[hints]')
    for (const h of globalHints) lines.push(`  - ${h}`)
  }

  if (lines.length > 0) {
    // Claude Code spec: exit 0 + stdout JSON {hookSpecificOutput.additionalContext}
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: lines.join('\n'),
        },
      }),
    )
  }
  process.exit(0)
}

void main()
