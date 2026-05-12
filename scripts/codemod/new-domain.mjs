#!/usr/bin/env node
// new-domain.mjs — 새 도메인 scaffold CLI.
//
// AGENT-BUILDER-VISION PR-D3. NEW-TENANT-GUIDE.md 의 7단계 (산문) 를 1 명령으로 압축.
//
// 생성:
//  - backend/internal/domains/<id>/{model,handler,dashboard,handler_test}.go (skeleton)
//  - harness/domains/<id>.yaml (manifest 템플릿)
//  - harness/registry.yaml: domains 섹션에 entry 추가
//  - backend/main.go: blank import 추가 (self-mounting init() 트리거)
//
// 수동 후속 (도메인별 다름):
//  - backend/internal/feature/catalog.go 에 IDTx<Id> entry 추가 + r.Use(g.Feature(...)) 호출
//  - DB 마이그레이션 작성
//  - manifest paths/tables/blast_radius 채우기
//  - 실제 비즈니스 로직 + API 라우트 작성
//
// 사용:
//   node scripts/codemod/new-domain.mjs --id=warehouse --display-name="창고 관리" \\
//     --pack=erp-core --feature-id=tx.warehouse --visible-to=all
//
// 예시 (BARO 인보이스 도메인):
//   node ... --id=baro_invoice --display-name="바로 인보이스" \\
//     --pack=baro-domain --feature-id=baro.invoice --visible-to=baro

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

// === args ===

const args = process.argv.slice(2)

/** @type {Record<string, string>} */
const opts = {}
for (const a of args) {
  const m = a.match(/^--([\w-]+)=(.+)$/)
  if (m) opts[m[1]] = m[2]
}

const id = opts.id
if (!id || !/^[a-z][a-z0-9_]*$/.test(id)) {
  console.error('usage: node new-domain.mjs --id=<id> --display-name="..." --pack=<pack> --feature-id=<feature.id> --visible-to=<group|tenant_csv>')
  console.error('  --id     : 소문자 snake_case (예: warehouse, baro_invoice)')
  console.error('  required : --display-name, --pack, --feature-id, --visible-to')
  process.exit(1)
}

const required = ['display-name', 'pack', 'feature-id', 'visible-to']
for (const r of required) {
  if (!opts[r]) {
    console.error(`missing --${r}`)
    process.exit(1)
  }
}

const displayName = opts['display-name']
const pack = opts.pack
const featureID = opts['feature-id']
const visibleTo = opts['visible-to']

// === paths ===

const targetDir = join(ROOT, 'backend', 'internal', 'domains', id)
const manifestPath = join(ROOT, 'harness', 'domains', `${id}.yaml`)
const registryPath = join(ROOT, 'harness', 'registry.yaml')
const mainPath = join(ROOT, 'backend', 'main.go')

if (existsSync(targetDir)) {
  console.error(`new-domain: ${targetDir} already exists. abort.`)
  process.exit(1)
}
if (existsSync(manifestPath)) {
  console.error(`new-domain: ${manifestPath} already exists. abort.`)
  process.exit(1)
}

// === naming helpers ===

/** @param {string} s */
function toPascalCase(s) {
  return s
    .split(/[_-]/)
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('')
}

const Id = toPascalCase(id) // BaroInvoice
const plural = `${id}s` // 단순 — 사용자가 필요 시 수정 (예: bls → bills 어색하면)
const featureConst = `IDTx${Id}` // catalog.go 에 추가될 ID 상수

// === templates ===

const modelTemplate = `package ${id}

// ${Id}Record — ${id} 도메인의 핵심 entity.
// TODO: 필드 정의 + DB 컬럼 매핑.
type ${Id}Record struct {
	ID string \`json:"id"\`
}

// Create${Id}Request — ${id} 등록 요청.
type Create${Id}Request struct {
	// TODO: 필드
}

// Update${Id}Request — ${id} 수정 요청.
type Update${Id}Request struct {
	// TODO: 필드
}

// Validate — Create 요청 검증.
func (r *Create${Id}Request) Validate() string {
	// TODO: 필수 필드 검증
	return ""
}

// Validate — Update 요청 검증.
func (r *Update${Id}Request) Validate() string {
	// TODO
	return ""
}
`

const handlerTemplate = `package ${id}

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
)

// ${Id}Handler — ${id} 도메인 API.
type ${Id}Handler struct {
	DB *supa.Client
}

// New${Id}Handler — 생성자.
func New${Id}Handler(db *supa.Client) *${Id}Handler {
	return &${Id}Handler{DB: db}
}

// init — feature self-mounting.
// catalog.go 에 ${featureConst} 추가 후 빌드 통과.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.${featureConst},
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := New${Id}Handler(d.DB)
			r.Route("/${plural}", func(r chi.Router) {
				r.Get("/", h.List)
				// TODO: 추가 라우트 (POST, PUT, DELETE, /:id)
			})
		},
	})
}

// List — GET /api/v1/${plural}.
// TODO: 실제 구현.
func (h *${Id}Handler) List(w http.ResponseWriter, r *http.Request) {
	response.RespondJSON(w, http.StatusOK, []${Id}Record{})
}
`

const dashboardTemplate = `package ${id}

// dashboard.go — ${id} 도메인 집계 함수.
// TODO: KPI, breakdown, trend 등이 필요하면 추가.
//
// 패턴 (po/dashboard.go 참고):
//  - PODashboard struct (Totals + Trend24 + Breakdown)
//  - func computePODashboard(rows []PurchaseOrder, scope string) *PODashboard
//  - handler.go 의 init() 에 라우트 추가: r.Get("/dashboard", h.Dashboard)
`

const handlerTestTemplate = `package ${id}

import "testing"

// TestPlaceholder — scaffold 가 만든 placeholder. 실제 테스트로 교체.
func TestPlaceholder(t *testing.T) {
	t.Skip("TODO: ${id} 도메인 첫 테스트 작성")
}
`

const manifestTemplate = `# ${id} (${displayName}) — 도메인 manifest
# new-domain.mjs scaffold. 실제 코드 작성 후 paths/tables/blast_radius/verify_scripts 채우기.
# 형식 명세: harness/domains/README.md

schema_version: 1

id: ${id}
display_name: "${displayName}"

# === Pack / Feature / Tenant 배선 ===
pack: ${pack}
feature_id: ${featureID}
visible_to: ${visibleTo}

# === 코드 위치 ===
paths:
  backend:
    - backend/internal/domains/${id}/
  frontend: []
  migrations:
    - backend/migrations/0[0-9]?_*${id}*.sql
  tests:
    - backend/internal/domains/${id}/handler_test.go

# === DB ===
tables: []
# views: []

# === 의존 도메인 ===
depends_on: []

# === 외부 사용자 ===
external_users: []

# === Blast Radius ===
blast_radius:
  - description: "${id} model 필드 추가/삭제"
    must_check:
      - "backend/internal/domains/${id}/handler.go (Validation 흐름)"
      - "backend/migrations/ + check_schema.sh"
      - "PostgREST 스키마 캐시 갱신"

# === 자동 검증 ===
verify_scripts:
  - command: scripts/verify_changed.sh
    when: always
  - command: backend/scripts/check_schema.sh
    when: model_or_migration_changed
  - command: "cd backend && go test ./internal/domains/${id}/..."
    when: handler_changed

# === API 라우트 ===
api_routes:
  - GET    /api/v1/${plural}

# === Backfill / Maintenance ===
maintenance_scripts: []

# === Owners / 의사결정 기록 ===
owners: []
decisions: []
`

const registryEntryTemplate = `
  - id: ${id}
    display_name: "${displayName}"
    visible_to: ${visibleTo}
    feature_id: ${featureID}
    pack: ${pack}
    manifest: harness/domains/${id}.yaml
`

const mainImportLine = `	_ "solarflow-backend/internal/domains/${id}" // self-mounting init()
`

// === actions ===

console.log(`new-domain: scaffold ${id} (${displayName})`)

// 1. backend/internal/domains/<id>/ 디렉토리 + 4 skeleton
mkdirSync(targetDir, { recursive: true })
writeFileSync(join(targetDir, 'model.go'), modelTemplate)
writeFileSync(join(targetDir, 'handler.go'), handlerTemplate)
writeFileSync(join(targetDir, 'dashboard.go'), dashboardTemplate)
writeFileSync(join(targetDir, 'handler_test.go'), handlerTestTemplate)
console.log(`  + ${targetDir}/{model,handler,dashboard,handler_test}.go`)

// 2. harness/domains/<id>.yaml manifest
writeFileSync(manifestPath, manifestTemplate)
console.log(`  + ${manifestPath}`)

// 3. harness/registry.yaml: domains 섹션 끝에 entry 추가
//    "# PR-D 대상" 또는 마지막 도메인 entry 후 삽입
const registry = readFileSync(registryPath, 'utf8')
const insertMarker = /(\n  # PR-D[^\n]*\n  # - id: |\n# === Pack 정의 ===)/
const m = registry.match(insertMarker)
if (m) {
  const idx = registry.indexOf(m[0])
  const updated = registry.slice(0, idx) + registryEntryTemplate + registry.slice(idx)
  writeFileSync(registryPath, updated)
  console.log(`  + ${registryPath} (domains entry)`)
} else {
  console.warn(`  ! ${registryPath} 의 domains 섹션 끝 marker 못 찾음 — 손으로 추가:`)
  console.warn(registryEntryTemplate)
}

// 4. backend/main.go: blank import (알파벳 순 위치)
const mainSrc = readFileSync(mainPath, 'utf8')
// 기존 _ "solarflow-backend/internal/domains/<other>" line 들 사이 알파벳 위치
const importLines = mainSrc.match(/\t_ "solarflow-backend\/internal\/domains\/[^"]+"[^\n]*\n/g) ?? []
if (importLines.length === 0) {
  // 첫 도메인 — handler import 위에 추가 (PR-B 패턴)
  const updated = mainSrc.replace(
    /(\t"solarflow-backend\/internal\/handler"\n)/,
    `${mainImportLine}$1`,
  )
  if (updated === mainSrc) {
    console.warn(`  ! ${mainPath} blank import 자동 삽입 실패 — 손으로 추가: ${mainImportLine.trim()}`)
  } else {
    writeFileSync(mainPath, updated)
    console.log(`  + ${mainPath} (blank import)`)
  }
} else {
  // 알파벳 순으로 위치 결정
  const others = importLines.map((l) => {
    const mm = l.match(/domains\/([^"]+)"/)
    return mm ? mm[1] : ''
  })
  let insertBefore = importLines.length
  for (let i = 0; i < others.length; i++) {
    if (id < others[i]) {
      insertBefore = i
      break
    }
  }
  let updated
  if (insertBefore === importLines.length) {
    // 끝에 추가 — 마지막 import line 후
    const lastLine = importLines[importLines.length - 1]
    updated = mainSrc.replace(lastLine, lastLine + mainImportLine)
  } else {
    const target = importLines[insertBefore]
    updated = mainSrc.replace(target, mainImportLine + target)
  }
  writeFileSync(mainPath, updated)
  console.log(`  + ${mainPath} (blank import, alphabetical)`)
}

// === next steps ===

console.log(`\nnew-domain ${id}: scaffold 완료.\n`)
console.log(`다음 단계:`)
console.log(`  1. backend/internal/feature/catalog.go 에 ${featureConst} 상수 + Feature entry 추가`)
console.log(`     - DefaultTenants: TenantSet${visibleTo === 'all' ? 'All' : visibleTo === 'module' ? 'Module' : '...'}`)
console.log(`     - Paths: ${id} 라우트들의 chi 패턴`)
console.log(`  2. ${targetDir}/ 안 TODO 채우기 (model 필드, handler 라우트, validation)`)
console.log(`  3. backend/migrations/NNN_create_${id}.sql 작성 (테이블 생성)`)
console.log(`  4. ${manifestPath} 의 paths/tables/blast_radius/api_routes 갱신`)
console.log(`  5. cd scripts/codemod && node build-hook-index.mjs  → .claude/hooks/domains.json 자동 갱신`)
console.log(`  6. cd backend && go build ./... && go test ./internal/domains/${id}/...`)
