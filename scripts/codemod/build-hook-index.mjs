#!/usr/bin/env node
// build-hook-index.mjs — harness/registry.yaml + harness/domains/*.yaml → .claude/hooks/domains.json
//
// 동작:
//  - registry.yaml 의 domains 섹션 순회 → manifest 있으면 그 데이터로 domain entry 생성
//  - manifest 없는 도메인은 path_to_domain_fallback (본 codemod 안 데이터) 에 의존
//  - special_paths (tenant registry 등) 와 global_hints 도 본 codemod 안 데이터
//  - domains.json 은 100% generated artifact. 사람이 직접 편집 시 다음 codemod 실행에서 덮어씀.
//
// 행동 변경 (byte-equal X):
//  - 이전 domains.json 의 짧은 blast_radius 문자열 → manifest 의 더 자세한 표현으로 교체.
//  - manifest 가 정본이 되면서 정보 추가, 의미 변화 없음.
//
// 사용: `node build-hook-index.mjs` (cwd 무관).

import { join } from 'node:path'
import {
  ROOT,
  loadRegistry,
  loadAllDomainManifests,
  tenantsInGroup,
} from './lib/registry.mjs'
import { writeIfChanged } from './lib/util.mjs'

const TARGET = join(ROOT, '.claude', 'hooks', 'domains.json')

// =============================================================================
// 도메인 entry 생성 (manifest 가 있는 도메인)
// =============================================================================

/**
 * @param {import('./lib/registry.mjs').Registry} reg
 * @param {import('./lib/registry.mjs').DomainManifest} m
 */
function genDomainEntry(reg, m) {
  const tenants = Array.isArray(m.visible_to)
    ? [...m.visible_to].sort()
    : tenantsInGroup(reg, m.visible_to)

  const paths = [
    ...(m.paths?.backend ?? []),
    ...(m.paths?.frontend ?? []),
    ...(m.paths?.tests ?? []),
  ]

  const blastRadius = (m.blast_radius ?? []).map(
    (e) => `${e.description} — ${e.must_check.join(' / ')}`,
  )

  const verifyScripts = (m.verify_scripts ?? []).map((v) => v.command)

  return {
    display_name: m.display_name,
    feature_id: m.feature_id,
    pack: m.pack,
    tenants,
    tables: m.tables ?? [],
    depends_on: m.depends_on ?? [],
    paths,
    blast_radius: blastRadius,
    verify_scripts: verifyScripts,
    decisions: m.decisions ?? [],
  }
}

// =============================================================================
// 하드코딩 데이터 — manifest 미작성 도메인용 임시 fallback (PR-C 후 줄어듦)
// =============================================================================

const PATH_TO_DOMAIN_FALLBACK = [
  { glob: 'backend/internal/model/bl*.go', domain_id: 'bl' },
  { glob: 'backend/internal/handler/tx_bl*.go', domain_id: 'bl' },
  { glob: 'backend/internal/model/lc*.go', domain_id: 'lc' },
  { glob: 'backend/internal/handler/tx_lc*.go', domain_id: 'lc' },
  { glob: 'backend/internal/model/tt*.go', domain_id: 'tt' },
  { glob: 'backend/internal/handler/tx_tt*.go', domain_id: 'tt' },
  { glob: 'backend/internal/model/product*.go', domain_id: 'products' },
  { glob: 'backend/internal/model/inventory_*.go', domain_id: 'inventory' },
  { glob: 'backend/internal/model/price_*.go', domain_id: 'price_benchmark' },
  { glob: 'backend/internal/model/declaration*.go', domain_id: 'declaration' },
  { glob: 'backend/internal/handler/tx_declaration*.go', domain_id: 'declaration' },
  { glob: 'backend/internal/model/order*.go', domain_id: 'order' },
  { glob: 'backend/internal/handler/tx_order*.go', domain_id: 'order' },
  { glob: 'backend/internal/model/sale*.go', domain_id: 'sale' },
  { glob: 'backend/internal/handler/tx_sale*.go', domain_id: 'sale' },
  { glob: 'backend/internal/model/receipt*.go', domain_id: 'receipt' },
  { glob: 'backend/internal/handler/tx_receipt*.go', domain_id: 'receipt' },
  { glob: 'backend/internal/model/outbound*.go', domain_id: 'outbound' },
  { glob: 'backend/internal/model/picking_*.go', domain_id: 'outbound' },
  { glob: 'backend/internal/handler/tx_outbound*.go', domain_id: 'outbound' },
  { glob: 'backend/internal/model/baro_*.go', domain_id: 'baro' },
  { glob: 'backend/internal/handler/baro_*.go', domain_id: 'baro' },
  { glob: 'backend/internal/model/intercompany_*.go', domain_id: 'intercompany' },
  { glob: 'backend/internal/handler/tx_intercompany_*.go', domain_id: 'intercompany' },
  { glob: 'backend/internal/model/cost_*.go', domain_id: 'cost_detail' },
  { glob: 'backend/internal/handler/tx_cost_*.go', domain_id: 'cost_detail' },
  { glob: 'backend/internal/tenant/*.go', domain_id: '_tenant_registry' },
  { glob: 'backend/internal/feature/catalog.go', domain_id: '_feature_catalog' },
  { glob: 'frontend/src/packs/**/nav.ts', domain_id: '_pack_assembly' },
  { glob: 'harness/registry.yaml', domain_id: '_registry' },
  { glob: 'harness/domains/*.yaml', domain_id: '_domain_manifest' },
]

const SPECIAL_PATHS = {
  _tenant_registry: {
    display_name: '테넌트 정본 (D-145)',
    blast_radius: [
      'registry.go 변경 → DB CHECK 제약 마이그 필수 (user_profiles.tenant_scope, tenant_features.tenant, tenant_data_scopes.tenant)',
      '새 테넌트 추가 → harness/NEW-TENANT-GUIDE.md 의 7단계 전체. registry.yaml 정본 갱신 + gen-registry codemod 실행',
      'TenantSet* 가 catalog.go 에서 init 시 파생되므로 *컴파일 시점* 평가에 주의',
    ],
  },
  _feature_catalog: {
    display_name: 'Feature 카탈로그 (D-120)',
    blast_radius: [
      'Feature 추가/Path 변경 → coverage_test 와 matrix_consistency_test 가 chi 트리 ↔ catalog 일치 검증',
      'harness/FEATURE-WIRING-MATRIX.md 표 동시 갱신 필수',
    ],
  },
  _pack_assembly: {
    display_name: 'Pack 어셈블리 (nav.ts)',
    blast_radius: [
      'nav item 추가 → feature 가 backend catalog 에 등록돼 있어야 함 (또는 FrontendOnly: true)',
      'tenants 필드 직접 array 리터럴 금지 — MODULE_TENANTS / ALL_TENANTS / BARO_TENANTS 같은 헬퍼 사용',
      'key 충돌 시 buildNavGroups 가 첫 등록 우선 (테스트가 잡음)',
    ],
  },
  _registry: {
    display_name: 'harness/registry.yaml (단일 정본)',
    blast_radius: [
      'tenants 변경 → cd scripts/codemod && node gen-registry.mjs 실행 (registry.go 자동 동기화)',
      'domains 추가 → harness/domains/<id>.yaml manifest 신설 + build-hook-index 자동 재생성',
    ],
  },
  _domain_manifest: {
    display_name: '도메인 manifest (harness/domains/*.yaml)',
    blast_radius: [
      'manifest 변경 → cd scripts/codemod && node build-hook-index.mjs (.claude/hooks/domains.json 재생성)',
      'paths/tables/blast_radius 가 실 코드와 어긋나면 hooks 가 잘못 안내 — schema_version 호환 유지',
    ],
  },
}

const GLOBAL_HINTS = {
  '*.sql': [
    "마이그 추가 시: psql 적용 + PostgREST 스키마 캐시 갱신 + check_schema.sh 통과 (CLAUDE.md '필수 절차' 4단계)",
  ],
  'backend/migrations/*.sql': ['@auto-apply 헤더 + tenant CHECK 제약 영향 검토'],
  'harness/registry.yaml': [
    'registry.yaml → registry.go 동기화는 scripts/codemod/gen-registry.mjs 가 처리. 손으로 두 곳 편집 X',
  ],
  'harness/domains/*.yaml': [
    'manifest 갱신 후 scripts/codemod/build-hook-index.mjs 실행해 .claude/hooks/domains.json 재생성',
  ],
}

// =============================================================================
// main
// =============================================================================

function main() {
  const reg = loadRegistry()
  const manifests = loadAllDomainManifests()

  /** @type {Record<string, ReturnType<typeof genDomainEntry>>} */
  const domains = {}
  for (const ref of reg.domains) {
    const m = manifests.get(ref.id)
    if (m) {
      domains[ref.id] = genDomainEntry(reg, m)
    }
    // manifest 없는 도메인은 출력 안 함 — fallback 만 적용
  }

  // manifest 만 있고 registry.yaml domains 에 안 등록된 경우 경고
  for (const id of manifests.keys()) {
    const inRegistry = reg.domains.some((d) => d.id === id)
    if (!inRegistry) {
      console.error(
        `build-hook-index: 경고 — manifest ${id}.yaml 가 registry.yaml domains 에 등록 안 됨`,
      )
    }
  }

  const out = {
    _generated_by:
      'scripts/codemod/build-hook-index.mjs from harness/registry.yaml + harness/domains/*.yaml. DO NOT EDIT — re-run codemod after editing source.',
    _comment_for_special_paths:
      'special_paths 와 path_to_domain_fallback 은 codemod 안 데이터 (PR-C 후 줄어듦). manifest 작성된 도메인은 위 domains 섹션에서 자동.',
    schema_version: 1,
    domains,
    path_to_domain_fallback: PATH_TO_DOMAIN_FALLBACK,
    special_paths: SPECIAL_PATHS,
    global_hints: GLOBAL_HINTS,
  }

  const json = JSON.stringify(out, null, 2) + '\n'
  const changed = writeIfChanged(TARGET, json)
  console.log(`build-hook-index: ${TARGET} ${changed ? '갱신' : '변동 없음'}`)
}

main()
