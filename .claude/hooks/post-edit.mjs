#!/usr/bin/env node
// post-edit.mjs — Edit/Write/MultiEdit 직후 hook (Node 18+ ESM)
//
// 역할 (advisory 모드, 기본):
//   변경 path 의 도메인 식별 후 verify_scripts 권장 명령을 stdout JSON
//   {hookSpecificOutput.additionalContext} 로 출력. Claude 가 system context 로 인지.
//
// 역할 (STRICT 모드, STRICT_RULES=1):
//   verify_scripts 의 각 command 를 실 실행 (child_process.execSync). 실패 시
//   stdout JSON {decision: "block", reason: "..."} 로 *후속 도구 실행 차단*.
//   CI 환경 (env STRICT_RULES=1) 에서 자동 enforcement.
//
// spec: https://code.claude.com/docs/en/hooks
// 자매: pre-edit.mjs, .claude/hooks/domains.json

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STRICT = process.env.STRICT_RULES === '1'

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

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  let s = Buffer.concat(chunks).toString('utf8')
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1)
  return s
}

/**
 * STRICT 모드: verify_scripts 실 실행. 첫 실패 시 block.
 * @param {string[]} scripts
 * @returns {{ok: true} | {ok: false, failed: string, output: string}}
 */
function runVerifyScripts(scripts) {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  for (const s of scripts) {
    try {
      execSync(s, {
        cwd: projectDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000, // 2분 timeout per script
      })
    } catch (e) {
      const err = /** @type {any} */ (e)
      const output = (err.stdout || '') + (err.stderr || '') + ' ' + err.message
      return { ok: false, failed: s, output: output.slice(0, 2000) }
    }
  }
  return { ok: true }
}

async function main() {
  let raw = ''
  try {
    raw = await readStdin()
  } catch {
    process.exit(0)
  }
  /** @type {any} */
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    process.exit(0)
  }
  const filePath = input.tool_input?.file_path
  if (!filePath) process.exit(0)

  const dbPath = join(__dirname, 'domains.json')
  /** @type {any} */
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

  if (STRICT) {
    // STRICT 모드: 실 실행. 실패 시 block.
    const result = runVerifyScripts(scripts)
    if (!result.ok) {
      process.stdout.write(
        JSON.stringify({
          decision: 'block',
          reason: `[post-edit STRICT] ${domainId} 도메인 verify_scripts 실패\n  failed: ${result.failed}\n  output:\n${result.output}`,
        }),
      )
      process.exit(0)
    }
    // 모든 verify 통과 — silent (또는 짧은 context)
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `[post-edit STRICT] ${domainId} 도메인 verify_scripts ${scripts.length}개 모두 통과`,
        },
      }),
    )
    process.exit(0)
  }

  // Advisory 모드 (기본): 권장 명령만 출력
  const lines = [`\n[post-edit] ${domainId} 도메인 변경 — 권장 검증 명령:`]
  for (const s of scripts) {
    lines.push(`  $ ${s}`)
  }
  lines.push('  (advisory — STRICT_RULES=1 env 시 실 실행 + 실패 시 차단)')
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

void main()
