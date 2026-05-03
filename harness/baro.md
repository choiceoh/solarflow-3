# 바로(주) — `baro.topworks.ltd`

> 이 문서는 **바로(주) 도메인에서만 의미 있는 것**을 모아둔 인덱스다.
> 결정 본문은 [DECISIONS.md](DECISIONS.md)가 정본이고 여기는 그 도메인 관점의 색인 + 운영 메모만 담는다.
> 양 테넌트 공통 사항(인증, 마스터, 가용재고, 수주·출고·수금 등)은 [SolarFlow_설계문서_통합판.md](SolarFlow_설계문서_통합판.md)와 DECISIONS.md를 그대로 참조한다.

## 운영 컨텍스트

| 항목 | 값 |
|---|---|
| URL | `baro.topworks.ltd` |
| 사용자 | 영업 6명 |
| 거래처 | 약 200곳 (국내) |
| 비즈니스 | 국내 도매, **인바운드(고객 선연락) 위주** |
| 테넌트 식별 | `user_profiles.tenant_scope = 'baro'` (D-108) |
| 호스트 검출 | 프론트의 `detectTenantScope()`가 `^baro\.` 패턴으로 BARO 모드 결정 |

탑솔라 SolarFlow와 **단일 코드/단일 DB**를 공유하며 URL과 미들웨어로만 격리한다(D-108). 인프라(Linux 서버, cloudflared 터널, Cloudflare Pages)는 [PRODUCTION.md](PRODUCTION.md) 참조.

## 활성 메뉴 (사이드바에 노출되는 것)

탑솔라와 **공유**:
- 가용재고 (`/inventory`)
- 수주 관리 (`/orders`)
- 출고/판매 (`/orders?tab=outbound`)
- 수금 관리 (`/orders?tab=receipts`)
- 마스터 (`/data`), AI 도우미 (`/assistant`), 설정 (`/settings`)

**BARO 전용**:
- 그룹내 매입 (`/baro/group-purchase`) — Phase 2
- 거래처 단가표 (`/baro/price-book`) — Phase 1
- 배차/일정 (`/baro/dispatch`) — Phase 4
- 미수금/한도 (`/baro/credit-board`) — Phase 3
- 내 미처리 문의 (`/crm/inbox`) — CRM 1차

**노출되지 않는 것** (탑솔라 전용 — D-108로 차단):
- P/O 발주, L/C 개설, B/L 입고, 면장/원가
- L/C 한도, 매출 분석
- 결재안 (D-173 PR #173로 BARO에서 제거)
- 바로 매입요청 inbox (이건 탑솔라 측에서 바로 요청을 받는 화면)

## 관련 결정 (DECISIONS.md 색인)

- **[D-108](DECISIONS.md#d-108)** — 바로(주) 분리 정의: 단일 DB + URL 분기 + 코드 레벨 마스킹. **이 도메인의 헌법**.
- **[D-109](DECISIONS.md#d-109)** — CRM(거래처 활동 로그·미처리 문의함)은 바로(주) 전용
- **[D-039](DECISIONS.md#d-039)** — 그룹내거래(탑솔라↔바로) 양방향. 탑솔라 출고 = 바로 입고 자동 생성, 입고단가는 탑솔라 판매단가로 잠금.

## BARO 전용 백엔드 엔드포인트 (`baroOnly` 미들웨어)

`internal/middleware/tenant_scope.go`의 `RequireTenantScope("baro")`가 적용된 라우트. 탑솔라 토큰으로 호출하면 403:

| 경로 | 용도 | 도입 |
|---|---|---|
| `/api/v1/baro/price-book/*` | 거래처별 단가 이력 | Phase 1 |
| `/api/v1/intercompany-requests/*` (mine/create/cancel/receive) | 그룹내 매입 요청 | Phase 2 |
| `/api/v1/baro/credit-board` | 거래처 미수금/한도 보드 | Phase 3 |
| `/api/v1/baro/dispatch/*` | 배차/일정 | Phase 4 |
| `/api/v1/partners/{id}/activities` | 거래처 활동 로그 조회 | CRM 1차 (D-109) |
| `/api/v1/partner-activities/*` | 활동 등록·후속 토글 | CRM 1차 (D-109) |
| `/api/v1/me/open-followups` | 내 미처리 문의함 | CRM 1차 (D-109) |

## 운영 메모

- **사이드바 「판매」 그룹 비중**: BARO 영업이 주력 메뉴라 「판매」가 가장 무거움. 「구매」는 그룹내 매입 1개뿐.
- **인바운드 위주 → CRM 도입 배경**: 영업 6명이 200곳을 분담, 고객이 먼저 전화하는 경우가 많아 "통화 내용·후속 답변 추적"이 일상. 이게 CRM 1차의 사용 시나리오 (D-109).
- **결재안 제거**: BARO는 결재 흐름이 별도 시스템에 있어 SolarFlow 결재안을 안 씀(D-173 PR #173).

## 변경 시 체크리스트

새 BARO 전용 기능을 추가할 때:
1. 백엔드 라우트에 `baroOnly` 미들웨어 적용 (D-108 패턴)
2. 사이드바(`CommandShell.tsx`) 메뉴에 `tenants: ['baro']` 명시
3. 거래처 상세 등 공유 화면에서 BARO 전용 UI는 `isBaroMode()`로 가드
4. **DECISIONS.md에 D-NNN 추가** + 본 문서 「관련 결정」 섹션에 링크 1줄 추가
5. 파일/엔드포인트가 추가됐으면 「BARO 전용 백엔드 엔드포인트」 표 갱신
6. **D-112 사이드바 탭 분류** — admin이 「전체」 탭만 두지 않은 경우, 신규 메뉴는 사이트 설정 > 사이드바 탭에서 어느 탭에 노출할지 분류 (안 하면 「전체」 탭에서만 노출)
