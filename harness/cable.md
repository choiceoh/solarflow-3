# 케이블 — `cable.topworks.ltd`

> 이 문서는 **cable 도메인에서만 의미 있는 것**을 모아둔 인덱스다.
> 결정 본문은 [DECISIONS.md](DECISIONS.md)가 정본이고 여기는 그 도메인 관점의 색인 + 운영 메모만 담는다.
> `cable`은 `module.topworks.ltd`의 기능 표면을 포크한 별도 테넌트다(D-119).

## 운영 컨텍스트

| 항목 | 값 |
|---|---|
| URL | `cable.topworks.ltd` |
| 비즈니스 | module 계열 기능 표면을 공유하는 케이블 분기 |
| 테넌트 식별 | `user_profiles.tenant_scope = 'cable'` (D-119) |
| 호스트 검출 | 프론트의 `detectTenantScope()`가 `^cable\.` 또는 `^cable-` 패턴으로 `cable` 모드 결정 |
| 사이드바 탭 설정 | `system_settings.key = 'sidebar_tabs.cable'` |

인프라(Linux 서버, cloudflared 터널, Cloudflare Pages)는 [PRODUCTION.md](PRODUCTION.md)를 따른다. 운영 적용은 BARO 때와 같은 방식으로 Cloudflare Pages 커스텀 도메인/DNS/CORS를 추가한다.

## 활성 메뉴 (초기 포크 상태)

module과 **동일하게 노출**:
- 가용재고 (`/inventory`)
- P/O 발주 (`/procurement`)
- L/C 개설 (`/procurement?tab=lc`)
- B/L 입고 (`/procurement?tab=bl`)
- 면장/원가 (`/customs`)
- 바로 매입요청 inbox (`/group-trade/baro-inbox`)
- 수주 관리 (`/orders`), 출고/판매 (`/orders?tab=outbound`), 수금 관리 (`/orders?tab=receipts`)
- L/C 한도 (`/banking`)
- 매출 분석 (`/sales-analysis`)
- 구매 이력 (`/purchase-history`)
- 엑셀 입력 (`/import`), 마스터 (`/data`), AI 도우미 (`/assistant`), 설정 (`/settings`), 결재안 (`/approval`)

**노출되지 않는 것** (BARO 전용):
- 그룹내 매입(BARO 측 입력 화면), 입고예정(ETA read-only), 구매이력(BR 법인 원가), 거래처 단가표, 배차/일정, 미수금/한도 보드, 내 미처리 문의

## 관련 결정 (DECISIONS.md 색인)

- **[D-119](DECISIONS.md#d-119)** — `cable.topworks.ltd`는 module의 단순 별칭이 아니라 독립 `cable` 테넌트다. 초기 메뉴와 수입/금융/원가 API 접근은 module 계열과 동일하게 허용한다.
- **[D-108](DECISIONS.md#d-108)** — BARO가 module 계열의 수입원가/금융 정보를 보지 못하게 막는 1단계 격리 원칙.
- **[D-112](DECISIONS.md#d-112)** — 사이드바 탭은 테넌트별 `sidebar_tabs.{tenant}` 데이터로 독립 편집한다.

## module 계열 백엔드 엔드포인트 (`topsolarOnly` legacy 미들웨어)

`internal/middleware/gates.go`의 `TopsolarOnly`가 적용된 라우트. D-119 이후 legacy 이름은 유지하지만 실제 허용 스코프는 `RequireTenantScope("topsolar", "cable")`이다. BARO 토큰으로 호출하면 403:

| 경로 | 영역 |
|---|---|
| `/api/v1/cost-details/*` | 수입 원가 |
| `/api/v1/declarations/*` | 수입면장 |
| `/api/v1/lcs/*`, `/api/v1/tts/*` | L/C, T/T 계약금 |
| `/api/v1/expenses/*` | 부대비용 |
| `/api/v1/price-histories/*` | 단가 이력 |
| `/api/v1/limit-changes/*` | LC 한도 변동 |
| `/api/v1/export/amaranth/*` | 아마란스 RPA 연동 |
| Rust calc 프록시 | landed-cost, exchange-compare, lc-fee, lc-limit-timeline, lc-maturity-alert, margin-analysis, price-trend |

## 운영 메모

- **운영 적용**: Cloudflare DNS에서 `cable` CNAME을 `topworks-module-git.pages.dev`로 추가하고, Pages 프로젝트에 `cable.topworks.ltd` 커스텀 도메인을 연결한다.
- **API CORS**: 운영 `backend/.env`의 `CORS_ORIGINS`에 `https://cable.topworks.ltd`를 추가하고 Go 서비스를 재시작한다.
- **사용자 등록**: cable 사용자는 `user_profiles.tenant_scope='cable'`로 지정한다. 신규 자동 프로비저닝은 기존 호환을 위해 계속 `topsolar`로 시작한다.
- **데이터 격리**: 이번 분기는 URL/메뉴/권한/설정 스코프의 분리다. 거래·재고 행 단위 테넌트 격리는 추가하지 않는다. 필요하면 별도 결정으로 테이블별 tenant/company 필터를 설계한다.

## 변경 시 체크리스트

새 cable 전용 기능을 추가할 때:
1. **D-120 의무**: `backend/internal/feature/catalog.go` entry + `harness/FEATURE-WIRING-MATRIX.md` 행 + 라우트 `r.Use(g.Feature(feature.IDXxx))` (셋 다 같은 PR).
2. module 과 같은 표면이면 카탈로그 entry 의 `DefaultTenants: feature.TenantSetModule` 사용. cable 만 독립이면 새 사전 정의 집합(예: `TenantSetCableOnly`)을 catalog.go 에 추가하거나 인라인 `[]string{"cable"}`.
3. 사이드바 메뉴 `tenants` 도 카탈로그 default 와 일치시킨다.
4. DECISIONS.md에 D-NNN 추가 + 본 문서 「관련 결정」 섹션에 링크 1줄 추가
5. 사이드바 탭을 쓰는 운영 환경이면 사이트 설정의 `sidebar_tabs.cable` 분류도 확인
