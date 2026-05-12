#!/usr/bin/env node
// pre-edit.mjs — Edit/Write/MultiEdit 직전 hook (Node 18+ ESM)
//
// 역할: 변경 대상 파일이 어느 도메인에 속하는지 lookup 한 뒤, 해당 도메인의
//       blast_radius / depends_on 를 stderr 로 노출 (Claude 가 system 컨텍스트로 인지).
// 동작: advisory — exit 0 보장. v1 은 차단 안 함. PR-B 부터 STRICT 도입.
//
// 입력 (stdin JSON):
//   { tool_name: "Edit|Write|MultiEdit",
//     tool_input: { file_path: "...", ... }, ... }
//
// 출력:
//   - 도메인 매칭 → stderr 에 blast_radius 출력
//   - 매칭 없음 → 침묵 (exit 0)
//
// 자매: post-edit.mjs, .claude/hooks/domains.json, harness/AGENT-BUILDER-VISION.md

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
 * @property {string[]} [blast_radius]
 * @property {string[]} [depends_on]
 * @property {string} [feature_id]
 * @property {string[]} [tables]
 * @property {string[]} [verify_scripts]
 * @property {string[]} [decisions]
 */

/**
 * @typedef {object} SpecialEntry
 * @property {string} display_name
 * @property {string[]} [blast_radius]
 */

/**
 * @typedef {object} DomainsDB
 * @property {number} schema_version
 * @property {Record<string, DomainEntry>} domains
 * @property {{ glob: string, domain_id: string }[]} [path_to_domain_fallback]
 * @property {Record<string, SpecialEntry>} [special_paths]
 * @property {Record<string, string[]>} [global_hints]
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

/**
 * @param {string} filePath
 * @param {DomainsDB} db
 * @returns {string[]}
 */
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
  // PowerShell 등 일부 환경이 UTF-8 BOM 을 붙임 — JSON.parse 깨짐 방지.
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
  } catch (e) {
    console.error(`[pre-edit] domains.json 읽기 실패 (skip): ${e}`)
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
      lines.push(`\n[domain] ${domainId} (manifest 미작성, PR-C 대상)`)
      lines.push(`  AGENT-BUILDER-VISION 의 manifest 패턴으로 harness/domains/${domainId}.yaml 작성 검토`)
    }
  }

  if (globalHints.length > 0) {
    lines.push('\n[hints]')
    for (const h of globalHints) lines.push(`  - ${h}`)
  }

  if (lines.length > 0) {
    console.error(lines.join('\n'))
  }
  process.exit(0)
}

main()
