# 기능·데이터 배선 매트릭스 (D-120)

> 이 문서는 SolarFlow 의 **테넌트 격리 정본 인덱스**다.
> 실제 enforcement 는 `backend/internal/feature/catalog.go` 가 정본이고, 이 markdown 은 사람이 한 번에 보기 위한 표다.
> **두 파일은 PR 단위로 동시 갱신되어야 하며**, `matrix_consistency_test.go` 가 일치를 강제한다.
>
> 결정 본문: [DECISIONS.md#d-120](DECISIONS.md#d-120)

## 두 축

| 축 | 의미 | 강제 지점 | 위반 시 |
|---|---|---|---|
| **기능 배선** (capability) | 어느 테넌트가 어느 feature 를 호출할 수 있는가 | `middleware.RequireFeature(id)` (`g.Feature(...)`) | HTTP 403 |
| **데이터 배선** (scope) | 같은 feature 안에서 어느 행/컬럼을 보는가 | 쿼리 레이어 + 응답 변환 (후속 작업) | 0행 / 컬럼 가림 |

> 두 축은 절대 같은 코드 경로에서 합치지 않는다. 하나가 뚫려도 다른 하나가 fail-closed 로 막혀야 한다.

## 변경 절차 (의무)

신규 라우트 추가 또는 기존 라우트의 테넌트/스코프 변경 시:

1. **카탈로그 갱신** — `backend/internal/feature/catalog.go` 에 entry 추가/수정
   - feature_id 는 `domain.action[.qualifier]` 도트 표기
   - 가능한 사전 정의 테넌트 집합(`TenantSetAll`/`TenantSetModule`/`TenantSetBaroOnly` 등) 재사용
   - `Paths` 에 chi 라우트 패턴 정확히 기재(coverage_test 가 검증)
2. **본 매트릭스 갱신** — 아래 표에 같은 행 추가/수정
3. **라우트 적용** — `r.Use(g.Feature(feature.IDXxx))`
4. **DECISIONS 결정 추가** — 새 테넌트 분리이거나 기존 격리 범위가 바뀌면 D-NNN 추가
5. **검증 통과** — `go test ./internal/feature ./internal/middleware ./internal/router/...`

(1)~(3) 중 하나라도 빠지면 `feature_coverage_test.go` 또는 `matrix_consistency_test.go` 가 잡는다.

## 테넌트 약식 표기

| 표기 | 의미 |
|---|---|
| `M` | module 계열 = `topsolar` + `cable` (D-119) |
| `T` | topsolar 단독 |
| `C` | cable 단독 |
| `B` | baro 단독 |
| `★` | 모든 테넌트 |

---

## 매트릭스 본표

각 행은 카탈로그 entry 1개 = feature 1개. `Default` 칼럼이 카탈로그 코드의 `DefaultTenants`, 그 외는 `tenant_features` DB override.

### master.* (마스터 CRUD — 모든 테넌트 공유)

| feature_id | 이름 | Default | 데이터 스코프 |
|---|---|---|---|
| `master.bank` | 은행 마스터 | ★ | global |
| `master.company` | 법인 마스터 | ★ | global |
| `master.company_alias` | 법인 별칭 | ★ | global |
| `master.manufacturer` | 제조사 마스터 | ★ | global |
| `master.partner` | 거래처 마스터 | ★ | global |
| `master.partner_alias` | 거래처 별칭 | ★ | global |
| `master.product` | 품번 마스터 | ★ | global |
| `master.product_alias` | 품번 별칭 | ★ | global |
| `master.warehouse` | 창고 마스터 | ★ | global |
| `master.construction_site` | 공사현장 마스터 | ★ | global |

### tx.* (거래 — all tenants)

| feature_id | 이름 | Default | 데이터 스코프 |
|---|---|---|---|
| `tx.order` | 수주 | ★ | global |
| `tx.outbound` | 출고 | ★ | global |
| `tx.sale` | 매출 | ★ | global |
| `tx.receipt` | 수금 | ★ | global |
| `tx.receipt_match` | 수금/매출 매칭 | ★ | global |
| `tx.po` | PO 발주 (+ lines) | ★ | global |
| `tx.bl` | B/L 입고 (+ lines) | ★ | global |
| `tx.inventory_allocation` | 가용재고 배정 | ★ | global |
| `tx.module_demand_forecast` | 수요 forecast | ★ | global |

### tx.* (거래 — module 계열, D-108/D-119)

| feature_id | 이름 | Default | 데이터 스코프 |
|---|---|---|---|
| `tx.cost_detail` | 수입 원가 | M | global |
| `tx.declaration` | 수입 면장 | M | global |
| `tx.expense` | 부대비용 | M | global |
| `tx.lc` | L/C 신용장 (+ lines) | M | global |
| `tx.lc_limit` | LC 한도 변경 이력 | M | global |
| `tx.price_history` | 수입 단가 이력 | M | global |
| `tx.tt` | T/T 계약금 | M | global |

### intercompany.* (그룹내 매입 — 양방향)

| feature_id | 이름 | Default | 데이터 스코프 |
|---|---|---|---|
| `intercompany.request.baro` | 그룹내 매입 요청 (BARO 측) | B | tenant_owned |
| `intercompany.request.inbox` | 그룹내 매입 요청 (module 측 inbox) | M | global |

### crm.* (D-109 BARO 전용)

| feature_id | 이름 | Default | 데이터 스코프 |
|---|---|---|---|
| `crm.partner_activity` | CRM 거래처 활동 + 미처리 문의함 | B | tenant_owned |

### baro.* (BARO 전용)

| feature_id | 이름 | Default | 데이터 스코프 | 비고 |
|---|---|---|---|---|
| `baro.incoming` | BARO 입고예정 | B | column_masked | D-116 sanitized |
| `baro.purchase_history` | BARO 자체 매입원가 (BR 법인) | B | tenant_company | D-117 |
| `baro.credit_board` | BARO 미수금/한도 보드 | B | tenant_company | Phase 3 |
| `baro.dispatch` | BARO 배차/일정 | B | tenant_owned | Phase 4 |
| `baro.orders` | BARO 빠른 재발주 | B | tenant_company | |
| `baro.price_book` | BARO 거래처별 단가표 | B | tenant_owned | Phase 1 |

### calc.* (Rust 계산엔진 프록시)

| feature_id | 이름 | Default | 데이터 스코프 |
|---|---|---|---|
| `calc.inventory` | 재고 집계 계산 | ★ | global |
| `calc.landed_cost` | Landed Cost | M | global |
| `calc.exchange_compare` | 환율 비교 | M | global |
| `calc.lc_fee` | LC 수수료 계산 | M | global |
| `calc.lc_limit_timeline` | LC 한도 타임라인 | M | global |
| `calc.lc_maturity_alert` | LC 만기 알림 | M | global |
| `calc.margin_analysis` | 마진 분석 | M | global |
| `calc.customer_analysis` | 거래처 분석 | ★ | global |
| `calc.price_trend` | 단가 추이 | M | global |
| `calc.supply_forecast` | 수급 전망 | ★ | global |
| `calc.outstanding_list` | 미수금 리스트 | ★ | global |
| `calc.receipt_match_suggest` | 수금 매칭 추천 | ★ | global |
| `calc.search` | 전역 검색 | ★ | global |
| `calc.inventory_turnover` | 재고 회전율 | ★ | global |

### io.* (일괄 import/export)

| feature_id | 이름 | Default | 데이터 스코프 |
|---|---|---|---|
| `io.import` | 엑셀 일괄 등록 9종 | ★ | global |
| `io.export.amaranth` | 아마란스 RPA 연동 | M | global |
| `io.export.all` | 통합 데이터 덤프 (admin) | ★ | tenant_company |

### ai.* / sys.* / engine.*

| feature_id | 이름 | Default | 데이터 스코프 |
|---|---|---|---|
| `ai.assistant` | AI 도우미 | ★ | tenant_owned |
| `ai.ocr` | AI OCR | ★ | global |
| `sys.attachment` | 첨부파일 | ★ | global |
| `sys.audit_log` | 감사 로그 | ★ | global |
| `sys.library_post` | 자료실 | ★ | global |
| `sys.note` | 포스트잇 메모 | ★ | tenant_owned |
| `sys.system_settings` | 사이트 전역 설정 | ★ | global |
| `sys.ui_config` | GUI 메타 편집기 | ★ | global |
| `sys.user` | 사용자 (/me + admin 관리) | ★ | global |
| `sys.external_sync` | 외부 동기화 소스 (D-059) | ★ | global |
| `engine.health` | Rust 엔진 헬스 | ★ | global |

---

## 이 매트릭스에 잡히지 않는 것 (의도적 제외)

다음 라우트는 feature 게이트 대신 다른 축으로 보호되며, 카탈로그에 등록하지 않는다:

- `/api/v1/public/*` — 인증 outside (FX, 메탈가, 폴리실리콘, SCFI, login-stats). `/api/v1/public` 자체가 인증 미적용 그룹.
- `/api/v1/auth/*` — 로그인/JWKS 콜백 등 인증 자체 흐름.
- `/api/v1/attachments/{id}/file` — 짧은 만료 토큰 PDF 열람(별도 토큰 가드).
- `/health`, `/health/ready` — 인증 없는 인프라 헬스(D-019).

이 외에 본 매트릭스에 안 잡힌 라우트가 있다면 `feature_coverage_test.go` 가 즉시 잡는다.

## 변경 안 되는 것

- 카탈로그 entry 의 `Paths` 는 chi 라우트 패턴 그대로 — 핸들러가 정의한 path 를 단순 옮긴 것이다. 임의 단축/그루핑 금지.
- feature_id 한 번 발급되면 **이름만 절대 바꾸지 않는다**. tenant_features DB 행이 ID 로 참조하기 때문에 rename 은 마이그레이션을 동반한다. 의미가 바뀌면 새 ID 를 발급하고 기존 ID 는 점진 deprecate.
