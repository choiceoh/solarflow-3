#!/usr/bin/env node
// post-edit.mjs — Edit/Write/MultiEdit 직후 hook (Node 18+ ESM)
//
// 역할: 변경 path 의 도메인을 식별 후 verify_scripts 권장 명령을 stderr 출력.
// 동작: v1 advisory — exit 0 보장. 실 실행 X. PR-B 부터 STRICT_RULES=1 로 실 실행 + 실패 시 차단.
//
// 입력 (stdin JSON):
//   { tool_name: "Edit|Write|MultiEdit",
//     tool_input: { file_path: "...", ... }, ... }
//
// 자매: pre-edit.mjs, .claude/hooks/domains.json

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * @typedef {object} HookInput
 * @property {string} [tool_name]
 * @property {{ file_path?: string }} [tool_input]
 */

/**
 * @typedef {object} DomainEntry
 * @property {string} display_name
 * @property {string[]} [paths]
 * @property {string[]} [verify_scripts]
 */

/**
 * @typedef {object} DomainsDB
 * @property {number} schema_version
 * @property {Record<string, DomainEntry>} domains
 * @property {{ glob: string, domain_id: string }[]} [path_to_domain_fallback]
 */

/**
 * @param {string} pattern
 * @returns {RegExp}
 */
function compileGlob(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__GLOBSTAR__/g, '.*')
  return new RegExp('^' + escaped + '$')
}

/** @param {string} p */
function normalize(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * @param {string} filePath
 * @param {DomainsDB} db
 * @returns {string | null}
 */
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
  /** @type {HookInput} */
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    process.exit(0)
  }
  const filePath = input.tool_input?.file_path
  if (!filePath) process.exit(0)

  const dbPath = join(__dirname, 'domains.json')
  /** @type {DomainsDB} */
  let db
  try {
    db = JSON.parse(readFileSync(dbPath, 'utf8'))
  } catch {
    process.exit(0)
  }

  const domainId = findDomain(filePath, db)
  if (!domainId || domainId.startsWith('_')) {
    process.exit(0)
  }

  const def = db.domains[domainId]
  const scripts = def?.verify_scripts ?? []

  if (scripts.length === 0) {
    process.exit(0)
  }

  const lines = [`\n[post-edit] ${domainId} 도메인 변경 — 권장 검증 명령:`]
  for (const s of scripts) {
    lines.push(`  $ ${s}`)
  }
  lines.push('  (v1 advisory — 실 실행은 PR-B 의 STRICT 단계부터)')
  // Claude Code spec: exit 0 + stdout JSON {hookSpecificOutput.additionalContext}
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: lines.join('\n'),
      },
    }),
  )
  process.exit(0)
}

main()
