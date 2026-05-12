# AI 에이전트 친화 ERP 빌더 — 비전

> **결정 한 줄**: "메타-편집기" (D-120 거부) 가 아니라 **Colocated Domain + Manifest + Codemod**.
>
> **관계**: [D-145](DECISIONS.md#d-145) 가 *horizontal* (테넌트 pack) 을 깔았다. 이 비전은 *vertical* (도메인 colocation) 을 추가해 매트릭스를 완성한다. 둘은 직교한다.
>
> **자매 문서**: [NEW-TENANT-GUIDE.md](NEW-TENANT-GUIDE.md) (테넌트 추가) ↔ NEW-DOMAIN-GUIDE.md (도메인 추가, 본 비전 합의 후 작성)

---

## 0. 왜 이 비전인가

### 사용자 호소 → 시스템 진단

| 호소 | 진단 (정찰 결과) |
|---|---|
| "하나 고치면 하나 틀어진다" | 도메인 1개가 model + handler + dashboard + test + migration 으로 평균 **3–5 디렉토리** 흩어짐. blast radius 가 코드에 박혀 있지 않아 빠뜨림 |
| "어디서 바꿀지 모르겠다" | 도메인 진입점이 흩어져 *시작 위치* 가 모호. handler 위치/validation 위치/migration 번호 정책이 도메인마다 다름 (일관성 3.5/5) |
| "기존 개선이 자동 적용 안 된다" | `verify_changed.sh`/`check_schema.sh`/`lint_rules.sh` 가 advisory. `.claude/settings.json` 부재 → 에이전트 자동 트리거 0개. 대량 일관 변경 도구 (codemod) 0개 |

### 사람용 빌더 vs AI 용 빌더

| | 사람용 (D-120 거부) | AI 용 (본 비전) |
|---|---|---|
| 가치 | 시각화, 코드 줄이기 | 예측 가능성, codemod 친화성 |
| 도메인 정의 | GUI 메타 / YAML 스키마 | **그냥 코드, 단 모두 같은 모양** |
| 신규 도메인 | 메타 작성 | 1 명령 → 스켈레톤 생성 → 직접 코드 |
| 예외 처리 | 메타가 결국 코드보다 복잡해짐 | 도메인마다 자기 예외를 자기 디렉토리에 가둠 |

**핵심 통찰**: 에이전트는 *코드 양* 에 강하고 *불일관성* 에 약하다. "추상화로 코드 줄이기" 가 아니라 "**일관성으로 코드 늘리기**" 가 답.

---

## 1. 디렉토리 구조 (T+6m 목표)

Go module 과 TypeScript build 가 분리돼 있으니 **각 빌드 단위 안에 `domains/`** 컨벤션을 둔다. manifest 만 `harness/` 의 단일 정본.

```
backend/internal/domains/
  po/
    model.go             # struct + Validate() + JSON/DB 직렬화
    handler.go           # HTTP handlers (CRUD + 거래 stage)
    handler_test.go
    dashboard.go         # aggregation queries
    migrations/          # 도메인 소유 마이그만 (테넌트 마이그은 별도)
      001_init.sql
      002_add_item_type.sql
  bl/  lc/  tt/  products/  inventory/  price_benchmark/
  declaration/  order/  sale/  receipt/  outbound/
  baro_incoming/  baro_quote/  intercompany/  ...

frontend/src/domains/
  po/
    page.tsx             # route entry (list/detail)
    form.tsx             # 편집/생성 form
    api.ts               # /api/v1/po/* 클라이언트 (typed)
    page.test.tsx
  bl/  lc/  ...

frontend/src/packs/        # ← 기존 horizontal pack 그대로 유지
  erp-core/nav.ts          # ← domain page 들을 import 만 (어셈블리)
  module-finance/nav.ts
  baro-domain/nav.ts

harness/domains/
  po.yaml                # manifest — 본 도메인의 모든 진입점/의존
  bl.yaml
  ...

harness/registry.yaml    # 도메인×테넌트 매트릭스 (단일 정본)
```

**핵심**:
- 한 도메인 작업 = 위 3 디렉토리만 본다 (`backend/internal/domains/<id>/`, `frontend/src/domains/<id>/`, `harness/domains/<id>.yaml`)
- pack 은 **어셈블리** (nav 만), domain 은 **부품** (실제 코드). pack 은 domain page 를 import 만.
- 도메인 디렉토리는 *자기완결*. cross-domain import 는 manifest 의 `depends_on` 에 명시.

---

## 2. Registry & Manifest — 단일 정본

### `harness/registry.yaml` (도메인 × 테넌트 매트릭스)

```yaml
tenants:
  - { id: topsolar, groups: [all, module] }
  - { id: cable,    groups: [all, module] }
  - { id: baro,     groups: [all] }
  - { id: study,    groups: [study] }

domains:
  - id: po
    visible_to: module       # 그룹 또는 [tenant_id, ...]
    feature_id: tx.po
    pack: module-finance
  - id: bl
    visible_to: module
    feature_id: tx.bl
    pack: module-finance
  - id: products
    visible_to: all
    feature_id: master.products
    pack: erp-core
  # ...
```

- `tenant.Registry` (Go) + `frontend/src/packs/index.ts` (TS) 가 이 YAML에서 **파생**된다. 직접 편집 안 함.
- `bun run gen:registry` 가 양쪽 코드 정본 재생성 (codemod 의 첫 사용처).

### `harness/domains/<id>.yaml` (도메인 manifest)

```yaml
id: po
display_name: 발주 (Purchase Order)
visible_to: module
feature_id: tx.po
pack: module-finance

paths:
  backend: backend/internal/domains/po/
  frontend: frontend/src/domains/po/
  migrations: backend/internal/domains/po/migrations/

depends_on: [products, inventory]   # cross-domain import 명시
api_routes:
  - GET    /api/v1/po
  - POST   /api/v1/po
  - PUT    /api/v1/po/:id
  - GET    /api/v1/po/:id/lines
tables: [purchase_orders, po_line_items]

verify_scripts:
  - scripts/verify_residual_4.py
  - scripts/backfill_order_prices.py

blast_radius:
  - "model.go 변경 시: handler.go validation + frontend api.ts 타입 + migration 검토"
  - "PO 라인 단가 컬럼 추가 시: check_schema.sh + backfill_order_prices.py + 영업 페이지 form"

owners: [choiceoh]
```

**가드레일 훅의 lookup 키**가 이 manifest. PreToolUse 가 path → 도메인 매핑 후 `blast_radius` 메시지 주입, PostToolUse 가 `verify_scripts` 자동 실행.

---

## 3. Codemod 인프라

### 도구
- **TypeScript**: `ts-morph` (frontend 의 모든 .ts/.tsx 구조 변환)
- **Go**: 표준 `go/ast` + `golang.org/x/tools/go/packages`
- 위치: `scripts/codemod/<name>.ts` (TS) + `scripts/codemod/<name>/main.go` (Go)
- 실행: `bun run codemod <name>` — registry.yaml 순회하며 도메인마다 적용

### 시범 codemod (PR-A 와 함께)
- `gen-registry` — `registry.yaml` → `backend/internal/tenant/registry.go` + `frontend/src/packs/index.ts` 재생성
- `add-audit-columns` — 모든 도메인 model.go 에 `created_by`, `updated_by` 필드 일괄 추가 + 대응 마이그 생성
- `rename-handler-prefix` — `tx_po.go` → `domains/po/handler.go` (이주 도구 자체)

**왜 ts-morph**: jscodeshift 보다 타입 인식 잘 됨. comby 보다 TS 친화. 도입 비용 ≈ 1 PR.

---

## 4. Scaffold CLI

```bash
bun run new-domain --id=warehouse --tenants=topsolar,cable --pack=module-finance
```

생성물:
- `backend/internal/domains/warehouse/{model,handler,handler_test,dashboard}.go` 스켈레톤
- `backend/internal/domains/warehouse/migrations/001_create_warehouse.sql`
- `frontend/src/domains/warehouse/{page,form,api}.tsx` 스켈레톤
- `harness/domains/warehouse.yaml` (manifest 템플릿)
- `harness/registry.yaml` 에 도메인 row 추가
- `packs/module-finance/nav.ts` 에 nav item 추가
- admin feature-wiring 매트릭스에 row 자동 추가 (마이그 생성)

[NEW-TENANT-GUIDE.md](NEW-TENANT-GUIDE.md) 7 단계 → **1 명령 + 1 마이그 검토 + 직접 비즈니스 로직 작성**.

CLI 자체도 ts-morph codemod 위에 얹는다 (메타 정의가 아니라 *스켈레톤 생성*).

---

## 5. 가드레일 통합 (`.claude/settings.json`)

manifest 기반이라 path glob 보다 정확:

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "bun run hooks/pre-edit.ts"
        // pre-edit.ts: tool_input.file_path → domain manifest lookup
        //              → blast_radius 메시지를 system context 로 주입
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "bun run hooks/post-edit.ts"
        // post-edit.ts: 변경 path 의 도메인 식별
        //              → manifest.verify_scripts + 표준 검증 (tsc/check_schema) blocking 실행
      }
    ]
  }
}
```

부수효과: CI 의 `STRICT_RULES=1` 승격이 자연스럽게 가능 (manifest 가 도메인별 검증 정책 명시 → 도메인 단위 점진 적용).

---

## 6. 점진 이주 (PR 단위, 각 PR 되돌릴 수 있는 크기)

| PR | 범위 | 가드 |
|---|---|---|
| **이 PR** | 본 비전 + `.claude/settings.json` 훅 v1 (path glob 기반, manifest 없을 때 fallback) | 코드 본체 무관, 머지 안전 |
| **PR-A** | ts-morph 설치 + `scripts/codemod/gen-registry.ts` + `harness/registry.yaml` 첫 안 (현재 코드에서 *역생성*) | 행동 보존 — 생성된 registry.go 가 현재와 동일 |
| **PR-B** | `domains/po/` 시범 마이그 + `harness/domains/po.yaml` manifest + 훅 v2 (manifest lookup) | PO 회귀 테스트 + 운영 1주 관찰 |
| **PR-C** | PR-B 평가 후 BL, LC, TT codemod 일괄 이주 | 도메인별 PR 쪼개기 가능 |
| **PR-D** | 나머지 도메인 + `new-domain` CLI 정식화 + NEW-DOMAIN-GUIDE.md 작성 | |
| **PR-E** | NEW-TENANT-GUIDE.md 갱신 (registry.yaml 기반으로) + D-120 잔존물 (`templates/registry.tsx`) 정리 | |

각 PR 의 머지 게이트:
- 행동 보존 (snapshot 테스트 통과)
- manifest ↔ 코드 ↔ 마이그 ↔ registry 동기화 검증 (`check_schema.sh` 확장판)

---

## 7. 안티-패턴 (절대 안 함)

- ❌ **Generic CRUD handler** — D-120 함정의 다른 얼굴. 도메인 예외가 들어오는 순간 깨짐.
- ❌ **YAML/JSON 으로 페이지·핸들러 정의** — D-120.
- ❌ **메타 + 자동 페이지 생성** — D-120.
- ❌ **"모든 도메인 동시 이동"** — PR #360 패턴 (큰 단독 변경 → 다음날 반려). 도메인 1개 시범 → 평가 → 확장.
- ❌ **추상화로 코드 줄이기** — 일관성으로 늘린다.
- ❌ **manifest 를 자동 페이지 generator 입력으로** — manifest 는 *인덱스/메타데이터* 일 뿐, 코드 정본은 항상 코드.

---

## 8. 성공 지표

| 지표 | 현재 | 목표 (T+6m) |
|---|---|---|
| 새 도메인 추가 단계 | 산문 7단계 (NEW-TENANT-GUIDE 수준의 명확성 없음) | 1 명령 + 1 마이그 검토 |
| 도메인 작업 시 read 디렉토리 수 | 3–5 | 3 (backend/frontend/manifest) |
| 도메인 일관성 점수 | 3.5 / 5 | 4.5 / 5 |
| 가드레일 자동 실행률 (verify\_changed 트리거) | ~0% | ~95% |
| codemod 인프라 | 없음 (grep+sed) | ts-morph + go/ast |
| "한 곳 고치면 다른 곳 틀어짐" 사고/월 | 측정 안 됨 | manifest blast_radius lookup 으로 0 목표 |

---

## 9. 미해결 — 사용자 확인 필요

1. **registry.yaml 위치**: `harness/` (문서/메타) vs `config/` (코드 가까이). 추천: `harness/` (현 NEW-TENANT-GUIDE 와 같은 격, 사람이 직접 편집할 정본).
2. **codemod 언어 선택**: ts-morph (TS 단일) vs Go/TS 이중 (각 빌드에 native). 추천: 이중. 같은 paradigm 으로 두 빌드 모두 변환 가능해야 함.
3. **도메인 디렉토리 vs 기존 internal/api/, internal/model/** 공존 기간: 시범 도메인만 새 위치, 나머지는 기존 위치 유지 → codemod 로 일괄 이주. 평행 1~2주 OK.
4. **packs/ vs domains/ 의 역할 충돌**: 본 비전은 "pack=어셈블리, domain=부품" 으로 정리. 기존 `packs/<id>/pages/` 의 페이지 코드를 `domains/<id>/page.tsx` 로 끌어내고 pack 은 import 만. 동의 필요.
5. **D-120 잔존물 (`frontend/src/templates/MetaDetail.tsx` + `registry.tsx`)**: PR-E 에서 제거 (BLDetailView 한 곳만 사용 — 직접 React 페이지로 대체).

---

## 부록: 이 비전이 D-120 과 다른 정확한 이유

| 차원 | D-120 (메타-편집기) | 본 비전 (colocation) |
|---|---|---|
| 도메인 정의 매체 | YAML/JSON 스키마 | 그냥 코드 (.go/.tsx) |
| 페이지 생성 | 런타임 메타 → 동적 렌더 | 빌드타임 코드 — 직접 작성 |
| 신규 도메인 비용 | 메타 작성 (생각만큼 안 줄어듦) | 1 명령 + 직접 코드 |
| 예외 처리 | 메타에 escape hatch 누적 → 결국 코드보다 복잡 | 도메인 디렉토리에 직접 — 다른 도메인 영향 없음 |
| 에이전트 마찰 | 메타 문법 학습 필요 | 다른 도메인을 그대로 모방 |
| 변경 영향 범위 | 런타임 메타 모두에 영향 | 도메인 디렉토리 안에 격리 |

요컨대 D-120 은 *덜 쓰려는 추상화*, 본 비전은 *같은 모양으로 더 쓰는 컨벤션*. 정반대 철학.
