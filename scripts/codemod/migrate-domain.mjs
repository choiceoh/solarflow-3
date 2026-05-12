#!/usr/bin/env node
// migrate-domain.mjs — 한 도메인을 backend/internal/domains/<id>/ 로 이주.
//
// AGENT-BUILDER-VISION PR-C 의 핵심 codemod. PR-B 의 PO 이주 패턴을 자동화.
//
// 자동:
//  - source 파일 발견 (backend/internal/{model/<id>*.go, handler/tx_<id>*.go})
//  - git mv to backend/internal/domains/<id>/ (파일명 정규화: bl.go→model.go, tx_bl.go→handler.go, ...)
//  - package 선언 변경 (model/handler → <id>)
//  - 자기 도메인 type prefix 일괄 제거 (file 안 정의된 type/func/var/const 자동 식별)
//
// 수동 후처리 (cycle/dep 가 도메인마다 다름):
//  - cross-package model (CompanySummary 등) prefix 추가 + import
//  - utility dup (handler 패키지 만 정의된 함수들 — parseLimitOffset, writeAuditLog 등)
//  - cross-domain import (외부 사용자: io_import, wms_automation, 등)
//  - main.go blank import 추가
//  - manifest harness/domains/<id>.yaml 작성
//  - go build/test 검증
//
// 사용:
//   cd scripts/codemod
//   node migrate-domain.mjs --id=bl

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from 'node:fs'
import { execSync } from 'node:child_process'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

// --- args ---
const args = process.argv.slice(2)
const idArg = args.find((a) => a.startsWith('--id='))
if (!idArg) {
  console.error('usage: node migrate-domain.mjs --id=<domain-id>')
  process.exit(1)
}
const id = idArg.split('=')[1]
if (!/^[a-z][a-z0-9_]*$/.test(id)) {
  console.error(`invalid domain id: ${id} (must be lowercase snake_case)`)
  process.exit(1)
}

const modelDir = join(ROOT, 'backend', 'internal', 'model')
const handlerDir = join(ROOT, 'backend', 'internal', 'handler')
const targetDir = join(ROOT, 'backend', 'internal', 'domains', id)

// --- source 발견 ---

/**
 * @returns {{ source: string, origin: 'model'|'handler', file: string }[]}
 */
function findSources() {
  const out = []
  for (const f of readdirSync(modelDir)) {
    if (f === `${id}.go` || f.startsWith(`${id}_`)) {
      out.push({ source: join(modelDir, f), origin: 'model', file: f })
    }
  }
  for (const f of readdirSync(handlerDir)) {
    if (f === `tx_${id}.go` || f.startsWith(`tx_${id}_`)) {
      out.push({ source: join(handlerDir, f), origin: 'handler', file: f })
    }
  }
  return out
}

// --- target name 결정 (파일명 정규화) ---

/**
 * @param {'model'|'handler'} origin
 * @param {string} file
 */
function targetName(origin, file) {
  if (origin === 'model') {
    // bl.go → model.go ; bl_line.go → model_line.go
    if (file === `${id}.go`) return 'model.go'
    return file.replace(new RegExp(`^${id}_`), 'model_')
  }
  // tx_bl.go → handler.go ; tx_bl_line.go → handler_line.go ;
  // tx_bl_dashboard.go → dashboard.go ; tx_bl_list_test.go → handler_test.go
  const stripped = file.replace(new RegExp(`^tx_${id}_?`), '').replace(/^tx_${id}/, '')
  if (stripped === '.go' || stripped === '') return 'handler.go'
  if (stripped === 'dashboard.go') return 'dashboard.go'
  if (stripped.endsWith('_test.go') || stripped === 'test.go') return 'handler_test.go'
  if (stripped === 'line.go') return 'handler_line.go'
  return `handler_${stripped}`
}

// --- 도메인 내 정의된 type/func/var/const 추출 ---

/**
 * @param {string} filePath
 * @returns {Set<string>}
 */
function extractDefinitions(filePath) {
  const c = readFileSync(filePath, 'utf8')
  const ids = new Set()
  // top-level type/func/var/const 정의
  for (const m of c.matchAll(/^type\s+(\w+)\s/gm)) ids.add(m[1])
  for (const m of c.matchAll(/^func\s+(\w+)\s*\(/gm)) ids.add(m[1])
  // method receiver — Name 부분
  for (const m of c.matchAll(/^func\s+\([^)]+\)\s+(\w+)\s*\(/gm)) ids.add(m[1])
  for (const m of c.matchAll(/^var\s+(\w+)\s/gm)) ids.add(m[1])
  for (const m of c.matchAll(/^const\s+(\w+)\s/gm)) ids.add(m[1])
  return ids
}

// --- main ---

function main() {
  const sources = findSources()
  if (sources.length === 0) {
    console.error(`migrate-domain: no source files found for id=${id}`)
    console.error(`  looked in: ${modelDir} for ${id}*.go`)
    console.error(`            ${handlerDir} for tx_${id}*.go`)
    process.exit(1)
  }

  console.log(`migrate-domain: ${id} — ${sources.length} files`)
  for (const s of sources) {
    console.log(`  source: ${s.origin}/${s.file}`)
  }

  // target dir
  if (existsSync(targetDir)) {
    console.error(`migrate-domain: ${targetDir} already exists. abort.`)
    process.exit(1)
  }
  mkdirSync(targetDir, { recursive: true })

  // git mv
  const moved = []
  for (const s of sources) {
    const tName = targetName(s.origin, s.file)
    const target = join(targetDir, tName)
    console.log(`  mv ${s.origin}/${s.file} → domains/${id}/${tName}`)
    execSync(`git mv "${s.source}" "${target}"`, { cwd: ROOT, stdio: 'pipe' })
    moved.push({ ...s, target })
  }

  // 전체 도메인 type/func/var set 수집 (모든 새 위치 파일에서)
  const allDefs = new Set()
  for (const m of moved) {
    for (const d of extractDefinitions(m.target)) allDefs.add(d)
  }
  console.log(`\n도메인 내 정의 ${allDefs.size} 항목 식별:`)
  console.log(`  ${[...allDefs].slice(0, 10).join(', ')}${allDefs.size > 10 ? ', ...' : ''}`)

  // 각 file: package 변경 + prefix 제거
  for (const m of moved) {
    let content = readFileSync(m.target, 'utf8')
    const orig = content

    // package 변경
    content = content.replace(/^package\s+(model|handler)\b/m, `package ${id}`)

    // model.X prefix 제거 (X 가 도메인 type 일 때만)
    for (const defName of allDefs) {
      const re = new RegExp(`\\bmodel\\.${escapeRegExp(defName)}\\b`, 'g')
      content = content.replace(re, defName)
    }

    if (content !== orig) {
      writeFileSync(m.target, content)
    }
  }

  console.log(`\nmigrate-domain ${id}: ${moved.length} files moved + rewritten.\n`)
  console.log(`다음 단계 (manual — domain 별 다름):`)
  console.log(`  1. cd backend && go build ./...  → cross-package / utility / cycle 에러 list`)
  console.log(`  2. 에러 list 따라:`)
  console.log(`     - cross-package model (CompanySummary 등) → model. prefix 추가 + import "internal/model"`)
  console.log(`     - handler util (parseLimitOffset, monthOf, writeAuditLog, callRPC, ...) → po/util.go 패턴으로 domain/<id>/util.go 에 dup`)
  console.log(`     - cycle 시 — handler 가 도메인 type 사용하는 곳 (io_import 등) cross-domain import`)
  console.log(`  3. main.go 에 _ "solarflow-backend/internal/domains/${id}" blank import`)
  console.log(`  4. harness/domains/${id}.yaml manifest 작성 (po.yaml 을 템플릿)`)
  console.log(`  5. node build-hook-index.mjs  → .claude/hooks/domains.json 자동 갱신`)
  console.log(`  6. go test ./...  → 회귀 확인`)
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

main()
