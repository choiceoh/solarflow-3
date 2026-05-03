# 탑솔라(주) — `module.topworks.ltd`

> 이 문서는 **탑솔라 도메인에서만 의미 있는 것**을 모아둔 인덱스다.
> 결정 본문은 [DECISIONS.md](DECISIONS.md)가 정본이고 여기는 그 도메인 관점의 색인 + 운영 메모만 담는다.
> 양 테넌트 공통 사항(인증, 마스터, 가용재고, 수주·출고·수금 등)은 [SolarFlow_설계문서_통합판.md](SolarFlow_설계문서_통합판.md)와 DECISIONS.md를 그대로 참조한다.

## 운영 컨텍스트

| 항목 | 값 |
|---|---|
| URL | `module.topworks.ltd` |
| 비즈니스 | 해외 태양광 모듈 **수입·도매** (탑솔라(주) + 디원 + 화신이엔지) |
| 테넌트 식별 | `user_profiles.tenant_scope = 'topsolar'` (D-108, 기본값) |
| 호스트 검출 | 프론트의 `detectTenantScope()`가 `^baro\.` 패턴 외엔 모두 `topsolar`로 결정 |

SolarFlow의 **원본 도메인** — D-108로 BARO가 분리되기 전까지는 이 한 사이트가 전부였다. 인프라(Linux 서버, cloudflared 터널, Cloudflare Pages)는 [PRODUCTION.md](PRODUCTION.md), 운영 자동화(webhook, cron-deploy)도 동일 문서 참조.

## 활성 메뉴 (사이드바에 노출되는 것)

BARO와 **공유**:
- 가용재고 (`/inventory`)
- 수주 관리 (`/orders`), 출고/판매 (`/orders?tab=outbound`), 수금 관리 (`/orders?tab=receipts`)
- 마스터 (`/data`), AI 도우미 (`/assistant`), 설정 (`/settings`)

**탑솔라 전용** (BARO에는 미노출):
- P/O 발주 (`/procurement`) — 해외 공급사 발주
- L/C 개설 (`/procurement?tab=lc`) — 신용장 발행/추적
- B/L 입고 (`/procurement?tab=bl`) — 선적·입고
- 면장/원가 (`/customs`) — 수입면장 + Landed Cost
- 바로 매입요청 inbox (`/group-trade/baro-inbox`) — BARO가 보낸 그룹내 매입 요청 처리
- L/C 한도 (`/banking`) — 은행별 한도/만기
- 매출 분석 (`/sales-analysis`) — 마진·이익률 (원가 기반)
- 결재안 (`/approval`) — D-173 PR #173로 BARO에서는 제거되어 탑솔라 전용

**노출되지 않는 것** (BARO 전용 — D-108로 차단):
- 그룹내 매입(BARO 측 입력 화면), 입고예정(ETA read-only), 구매이력(BR 법인 원가), 거래처 단가표, 배차/일정, 미수금/한도 보드, 내 미처리 문의

## 관련 결정 (DECISIONS.md 색인)

수입/통관/금융 흐름이 탑솔라 고유 영역이라 다수가 이 도메인에 묶인다.

**수입 PO·L/C·B/L·면장**
- [D-061](DECISIONS.md#d-061) — PO 입고현황은 프론트에서 B/L 수량 합산
- [D-082](DECISIONS.md#d-082) — 결제조건 정본은 PO, B/L은 보조
- [D-083](DECISIONS.md#d-083) — 입고완료 표시는 유형별로 분기
- [D-085](DECISIONS.md#d-085) — PO → 입고 → 면장 데이터 연결 + 독립 입력 경로 병존
- [D-086](DECISIONS.md#d-086) — PO 필수 연결 + 분할선적 + 환율 3단계 비교
- [D-090](DECISIONS.md#d-090) — LC도 PO 라인아이템 단위로 추적
- [D-098](DECISIONS.md#d-098) — 면장 PDF OCR 자동채움은 B/L 폼 후보 반영

**Landed Cost · 마진**
- [D-022](DECISIONS.md#d-022) — 장기재고 판별은 최초 입고일 기준
- [D-023](DECISIONS.md#d-023) — 부대비용 배분 기준은 capacity_kw 비율
- [D-024](DECISIONS.md#d-024) — 현재 환율은 최근 면장 환율 사용
- [D-025](DECISIONS.md#d-025) — Landed Cost는 save=true일 때만 DB 저장
- [D-026](DECISIONS.md#d-026) — allocated_expenses를 동적 맵으로 처리
- [D-027](DECISIONS.md#d-027) — LC 수수료 환율은 B/L 환율 우선
- [D-031](DECISIONS.md#d-031) — 마진 원가는 품번별 가중평균
- [D-032](DECISIONS.md#d-032) — cost_basis 선택 (cif/landed)

**LC 한도·만기**
- [D-028](DECISIONS.md#d-028) — 한도 복원 타임라인은 maturity_date 기준
- [D-029](DECISIONS.md#d-029) — 만기 알림 severity (0~3일 critical, 4~7일 warning)
- [D-030](DECISIONS.md#d-030) — LC 수수료 자동 계산 (수동 입력은 Phase 확장)
- [D-062](DECISIONS.md#d-062) — LC 한도 수요 예측

**아마란스 매출 RPA** (탑솔라 측 외부 시스템 연동)
- [D-066](DECISIONS.md#d-066) — 매출 Import는 outbound_id 직접 매칭
- [D-067](DECISIONS.md#d-067) — 매출마감 내보내기 Step 32로 연기
- [D-068](DECISIONS.md#d-068) — 관리구분(MGMT_CD) 빈값 내보내기
- [D-097](DECISIONS.md#d-097) — 아마란스 웹 출고 업로드 양식 + RPA 큐
- [D-100](DECISIONS.md#d-100) — Playwright 워커 + 수동확인 안전장치

**테넌트 분리 자체**
- [D-108](DECISIONS.md#d-108) — 바로(주) 분리 정의. 탑솔라 입장에선 "원가/금융 정보가 BARO 토큰으로 새지 않게 막는 가드 목록"이 핵심.

## 탑솔라 전용 백엔드 엔드포인트 (`topsolarOnly` 미들웨어)

`internal/middleware/tenant_scope.go`의 `RequireTenantScope("topsolar")`가 적용된 라우트. BARO 토큰으로 호출하면 403. **D-108이 이 목록을 격리 범위의 전부로 못박았다 — 별도 결정 없이 추가 확장 금지**:

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

- **자동 배포**: main에 push되면 webhook(`api.topworks.ltd/__webhook/deploy`) → cron-deploy.sh가 Go/Rust 재빌드 + Cloudflare Pages가 프론트 자동 배포. 마이그레이션은 별도 수동 적용 (PRODUCTION.md).
- **사이드바 「구매」 그룹 비중**: 수입 흐름(PO→LC→BL→면장)이 핵심 메뉴라 「구매」가 가장 무거움.
- **외부 RPA 의존**: 아마란스 매출 업로드 등 일부 흐름은 외부 시스템(아마란스) 양식과 동기화돼 있어 변경 시 RPA 워커도 같이 검토 필요.

## 변경 시 체크리스트

새 탑솔라 전용 기능을 추가할 때:
1. 백엔드 라우트에 `topsolarOnly` 미들웨어 적용 (D-108 패턴)
2. 사이드바(`CommandShell.tsx`) 메뉴에 `tenants: ['topsolar']` 명시
3. 공유 화면에서 탑솔라 전용 UI는 `!isBaroMode()` 또는 tenant 체크로 가드
4. **DECISIONS.md에 D-NNN 추가** + 본 문서 「관련 결정」 섹션에 링크 1줄 추가
5. **D-108 격리 목록을 늘리는 변경이라면 D-108을 갱신할지 별도 D-NNN을 둘지 명시** — D-108은 "이 목록이 격리 범위의 전부"라고 못박았으므로 추가 확장은 결정 기록 필수
6. **D-112 사이드바 탭 분류** — admin이 「전체」 탭만 두지 않은 경우, 신규 메뉴는 사이트 설정 > 사이드바 탭에서 어느 탭에 노출할지 분류 (안 하면 「전체」 탭에서만 노출)
