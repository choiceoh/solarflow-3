# SolarFlow 진행 상황

## 현재 상태 요약 (최종 업데이트: 2026-04-16)

| 항목 | 상태 |
|------|------|
| 현재 Phase | **실데이터 이관 + UI 기능 개선 진행 중** |
| 다음 작업 | 라이젠에너지 T/T 데이터 검증 + PODetailView 서브테이블 개선 |
| 인프라 | Mac mini (Go+Rust+PostgREST+Caddy+PostgreSQL) + Supabase Auth(인증만) + Tailscale(외부접속) |
| 프론트엔드 | Caddy 정적 서빙 (dist/) — localhost:5173, Tailscale 100.123.70.19:5173 |
| DB | 로컬 PostgreSQL + PostgREST (D-075, D-076) |
| Go 테스트 | 116개 PASS |
| Rust 테스트 | 75개 PASS |
| DECISIONS | D-001~D-079 (79개) |
| launchd | 5개 서비스 자동 시작 |

---

## 2026-04-16 세션 완료 작업 (2차 — 가용재고↔수주 연동)

### 가용재고 배정 → 수주 자동 연동 (배정예정 → 수주 pre-fill + alloc 연결)

#### `frontend/src/pages/InventoryPage.tsx`
- `handleConfirmAlloc`: status 변경 제거, URL 파라미터로 수주 폼 pre-fill 데이터 전달
  - `alloc_id`, `product_id`, `quantity`, `customer`, `mgmt_cat`, `site`, `order_no` URL 파라미터 생성
  - notes 필드에서 `[발주번호:X]` 태그 파싱 → `order_no` 파라미터
  - `window.location.href`로 Orders 페이지 이동 (전체 리로드)
- `productMap`에 `manufacturer_name` 추가 → 배정 현황 테이블에 **제조사** 열 표시
- `useLocation` import + `location.key` → fetchAllocations useEffect 의존성 추가 (탭 이동 후 자동 갱신)

#### `frontend/src/components/inventory/AllocationForm.tsx`
- **스크롤 불가 수정**: DialogContent에 `flex flex-col max-h-[90vh] p-0 gap-0` 적용
  - DialogHeader: `shrink-0` (고정 헤더)
  - 폼 영역: `flex-1 overflow-y-auto px-6 py-4` (중간만 스크롤)
  - DialogFooter: `shrink-0 border-t` (고정 푸터)
- **고객 발주번호 입력란 추가** (purpose==='sale' 시만 표시)
  - `customerOrderNo` state
  - 저장 시 notes 앞에 `[발주번호:X]` 태그 prefix
  - 수정(edit) 모드: notes에서 파싱하여 자동 채우기

#### `frontend/src/components/orders/OrderForm.tsx`
- `OrderPrefillData` interface export (product_id, quantity, management_category, fulfillment_source, customer_hint, site_name, order_number)
- `prefillData?: OrderPrefillData | null` prop 추가
- 파란 배너: "📦 가용재고 배정에서 자동 입력" (prefill 시 표시)
- **거래처 자동 매칭 useEffect**: customer_hint(이름) → partners 목록에서 partner_id 역조회 → setValue

#### `frontend/src/pages/OrdersPage.tsx`
- URL 파라미터 읽기 useEffect (`?new=1&alloc_id=...&...`) — 빈 deps `[]`
- `pendingAllocId`, `orderFormPrefill` state 추가
- `handleCreateOrder`: 수주 생성 후 alloc에 `order_id` + `status: 'confirmed'` PUT 자동 연결
- OrderForm에 `prefillData` prop 전달

#### DB 수정 (PostgreSQL)
- `products` 테이블: `wattage_kw > 1.0` 레코드 `spec_wp / 1000`으로 일괄 수정
  - M-RS0635-01: `wattage_kw 635.000 → 0.635` (635Wp × 1000개 = 635kW 정상)

---

## 2026-04-16 세션 완료 작업 (1차)

### Rust 엔진
- **무상스페어 공제 SQL 수정** (`engine/src/calc/inventory.rs`)
  - `fetch_alloc_stock` / `fetch_alloc_incoming` — `status IN ('pending')` 조건에 `notes LIKE '[무상스페어]%'` 조건 추가
  - JKM640N 무상스페어 3200kW 정상 공제 확인

### 프론트엔드 — UI 대규모 개선

#### PO 발주/결제 페이지 (`ProcurementPage.tsx`)
- **우측 슬라이드 패널** 구현 (Sheet 컴포넌트 → 커스텀 드래그 패널로 교체)
  - 왼쪽 드래그 핸들: 패널 폭 520px~화면전체 자유 조절
  - 프리셋 버튼: 600px / 800px / 1000px / 1200px 원클릭
  - 헤더에 현재 폭(px) 실시간 표시
  - 닫기: × 버튼 / ESC 키 / 뒤 오버레이 클릭
  - 기본 폭: 900px (세션 내 유지)

#### POListTable (`components/procurement/POListTable.tsx`) — 전면 재작성
- **메인 행**: 품목/MW / 계약조건 / 계약금액+결제 / **L/C 현황(신규)** 칼럼 분리
  - L/C 칼럼: 개설금액 + 미니바 % + **개설MW** + **미개설MW** 표시
- **펼침 영역** 3개 섹션 추가:
  1. **MW 3단계 진행률 바**: 계약 → L/C 개설 → 입고완료 (가로 막대)
  2. **L/C 현황 미니 테이블**: LC번호/은행/금액/MW/만기일/상태/수정✎/합계행 + `+ L/C 추가` 버튼
  3. **입고 현황 미니 테이블**: B/L번호/ETD/ETA/상태 + 입고완료MW 합계행 + `+ 입고 등록` 버튼
- **Lazy-load**: 행 펼칠 때만 BL API 호출 (초기 로드 속도 유지)
- Props: `onEditLC`, `onNewLC` 추가 → ProcurementPage에서 LCForm 직접 오픈

#### DepositStatusPanel (`components/procurement/DepositStatusPanel.tsx`) — 전면 재작성
- PO 체인 탐색 (`buildChain()`) — parent_po_id 역추적, 사이클 감지
- `supersededIds`: parent로 참조된 PO는 별도 행 표시 안 함
- **행 클릭 동작 분기**:
  - 미납부 행 클릭 → 지급 등록 폼 즉시 오픈 (파란 hover + `+` 아이콘)
  - 납부완료 행 클릭 → T/T 이력 펼침/접힘
- TTSection / TTRow / ProgressBar 내부 컴포넌트화
- `onEditTT` prop으로 T/T 수정 폼 연결

#### TTListTable (`components/procurement/TTListTable.tsx`)
- **PO번호/제조사 미표시 버그 수정** → `useProcurement.ts`에서 `purchase_orders` nested 응답 flatten
- 행 전체 클릭 → 수정 (cursor-pointer + hover 강조)
- 연필 아이콘 hover 시 진해지는 효과

#### TTForm (`components/procurement/TTForm.tsx`)
- **환율 입력 → 원화 자동 계산**: `amount_usd × exchange_rate` = `amount_krw`
- USD 금액 변경 시에도 환율 있으면 자동 재계산
- 환율 필드: 예시 "예: 1,380.50", `(원/USD)` 단위 표기
- "환율 자동 계산" 파란 텍스트 힌트

#### PODetailView (`components/procurement/PODetailView.tsx`)
- **capacity_kw × quantity 이중계산 버그 수정** — `capacity_kw`는 라인 전체 kW이므로 quantity 곱셈 제거

#### 기타 테이블 5컬럼 그룹화 (이전 세션)
- `LCListTable`: 16컬럼 → 5컬럼 그룹화
- `BLListTable`: 13컬럼 → 5컬럼 그룹화
- `OrderListTable`: 14컬럼 → 5컬럼 그룹화

---

## 미완료 / 다음 작업 후보

### 즉시 처리 권장
1. **PODetailView 서브테이블 개선** — LCSubTable, TTSubTable 구형 Table 컴포넌트 → 그룹화 스타일
2. **LCForm defaultPoId 연결** — PO탭 `+ L/C 추가` 클릭 시 해당 PO 자동 선택 안 됨
3. **B/L별 개별 MW 표시** — 입고 현황 미니 테이블에서 BL별 MW가 "—"로 표시됨 (전체 합계만 있음)

### 중기 작업
4. 라이젠에너지 T/T 데이터 사용자 직접 입력 후 DepositStatusPanel 검증
5. 전체 UI 색상/아이콘 개선 (사용자 요청: 단조로운 디자인 개선, 밤/낮 배경색 등)
6. PODetailView 종합정보 LC 개설 38.82 MW 표시 정확성 확인 (실제 데이터 2개 LC 합계)

### Phase 확장 미해결 (장기)
- LC 수수료 수동 보정 (D-030)
- FIFO 원가 매칭 (D-022, D-031)
- 실시간 환율 API (D-024)
- PDF 자동 데이터 입력 (D-064)
- 아마란스 매출마감 내보내기 (D-067)

---

## 서비스 재시작 명령어 (자주 쓰는 것)

```bash
# Go 백엔드 수정 후 (반드시 이 순서)
cd ~/solarflow-3/backend && go build -o solarflow-go .
codesign -f -s - solarflow-go
launchctl bootout gui/501 ~/Library/LaunchAgents/com.solarflow.go.plist 2>/dev/null || true
launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.solarflow.go.plist

# Rust 엔진 수정 후
cd ~/solarflow-3/engine && cargo build --release
codesign -f -s - target/release/solarflow-engine
launchctl stop com.solarflow.engine && launchctl start com.solarflow.engine

# 프론트엔드 빌드 (Caddy 서빙용)
cd ~/solarflow-3/frontend && npm run build
```

### Rust API 엔드포인트 (15개)
- /health, /health/ready
- /api/calc/inventory (재고 집계)
- /api/calc/landed-cost (Landed Cost)
- /api/calc/exchange-compare (환율 비교)
- /api/calc/lc-fee (LC 수수료)
- /api/calc/lc-limit-timeline (한도 복원)
- /api/calc/lc-maturity-alert (만기 알림)
- /api/calc/margin-analysis (마진 분석)
- /api/calc/customer-analysis (거래처 분석)
- /api/calc/price-trend (단가 추이)
- /api/calc/supply-forecast (수급 전망)
- /api/calc/outstanding-list (미수금 목록)
- /api/calc/receipt-match-suggest (수금 매칭 추천)
- /api/calc/search (자연어 검색)

## Phase 완료 이력

### Phase 1: Go 기초 보강 완료
| 작업 | 감리 점수 |
|------|----------|
| DB 14개 테이블 | 합격 |
| 마스터 6개 핸들러 | 8-9/10 |
| 인증 미들웨어 | 9/10 |
| PO/LC/TT/BL 핸들러 | 9/10 |

### Phase 2: 핵심 거래 모듈 완료
| 작업 | 감리 점수 |
|------|----------|
| Step 7: 면장/원가 | 9/10 |
| Step 8: 수주/수금 | 9/10 |
| Step 9: 출고/판매 | 9/10 |
| Step 10: 한도변경 + omitempty | 10/10 |
| Step 11A: 스키마 변경 | 10/10 |

### Phase 3: Rust 계산엔진 완료
| 작업 | 감리 점수 | 테스트 |
|------|----------|--------|
| Step 11B: Rust 초기화 + fly.io | 10/10 | - |
| Step 12: Go-Rust 통신 | 10/10 | 63개 |
| Step 13: 재고 집계 | 10/10 | 69개 |
| Step 14: Landed Cost + 환율 | 10/10 | 74개 |
| Step 15: LC 만기/수수료/한도 | 10/10 | 88개 |
| Step 16: 마진/이익률 + 단가 | 10/10 | 100개 |
| Step 17: 월별 수급 전망 | 10/10 | 110개 |
| Step 18: 수금 매칭 추천 | 10/10 | 127개 |
| Step 19: 자연어 검색 | 10/10 | 153개 |

### Phase 4: 프론트엔드 + 연동 + 배포 (완료)
| 작업 | 감리 점수 | 비고 |
|------|----------|------|
| Step 20: 인증 + CORS + CalcProxy | 감리 대기 | CORS, 프록시 15개, users/me, 로그인 UI |
| Step 21: 레이아웃 + 마스터 CRUD 6개 | 감리 대기 | AppLayout, Sidebar(역할별), DataTable, 6개 마스터 페이지+폼 |
| Step 22: 재고 화면 + 수급 전망 | 감리 대기 | 3탭(재고/미착품/수급전망), 요약카드, 장기재고Badge, insufficient경고 |
| Step 23: 입고 관리 (B/L+라인) | 감리 대기 | 목록/상세/생성/수정, 상태6단계, 입고유형4종, 라인아이템CRUD |
| Step 24: 발주/결제 (PO+LC+TT+단가) | 감리 대기 | 4탭, PO 5서브탭, 입고진행률바, LC만기임박, 단가인상/인하표시 |
| Step 25: 출고/판매 | 감리 대기 | 2탭(출고관리/매출현황), 취소3단계, Wp단가자동계산, 그룹거래Switch, 세금계산서Badge |
| Step 26: 수주/수금+매칭 | 감리 대기 | 3탭(수주/수금/매칭), 충당소스Badge, 매칭3단계(선택→체크→확정), 자동추천, 차액표시 |
| Step 27: 면장/원가 | 감리 대기 | 3탭(수입면장/부대비용/환율비교), 원가3단계(FOB→CIF→Landed), Badge, LandedCost 미리보기/저장, 부대비용11유형, price-histories Go라우트추가 |
| Step 28A: 은행/LC+수요예측 | 감리 대기 | 4탭(한도현황/만기알림/한도변경/LC수요예측), 요약카드4+3개, 사용률bar, Recharts AreaChart, D-Day Badge, 수수료펼침, PO별미개설, 3개월예측+대응방안(D-062) |
| Step 28B: 대시보드 | 감리 대기 | 역할별분기(admin=Manager/executive=Executive), 카드6개, BarChart+LineChart, 알림9가지, 미착품/수주잔량/미수금프리뷰, Promise.allSettled 섹션별 독립로딩, 장기재고경고 |
| Step 29A: 엑셀 양식 다운로드+업로드 미리보기 | 감리 대기 | 양식7종(입고/출고/매출/면장/부대비용/수주/수금), ExcelJS dynamic import(별도chunk 930KB), 드롭다운+코드표, 업로드파싱→검증→미리보기, 면장2시트탭, 에러행다운로드, 확정등록비활성(29B), D-063/D-064 |
| Step 29B: 엑셀 확정 등록 + Import API 7개 | 감리 대기 | 29A즉시수정(통화하드코딩), 지적1(매출outbound_id), 지적2(면장+원가한번에전송), 지적3(B/L기본정보불일치경고), Go Import핸들러7개(inbound/outbound/sales/declarations/expenses/orders/receipts), FK해소+자동계산, ImportResultDialog, ConfirmDialog, 테스트13개PASS |
| Step 29C: 아마란스10 내보내기 | 감리 대기 | 입고34컬럼+출고35컬럼 excelize, GET /export/amaranth/inbound·outbound, 거래구분/과세구분 매핑, 외화단가/원화단가 자동계산, 기간선택 AmaranthExportDialog, D-067/D-068 |
| Step 30: 결재안 자동 생성 6유형 | 감리 대기 | 6유형카드선택, LC/BL/PO/거래처 기반 데이터조회, 수입통관부가세(CIF×0.1), approvalTemplates 텍스트생성, 미리보기Textarea수정, 클립보드복사, 수동입력(노란배경), Go변경없음 |
| Step 31: 메모+검색+알림 | 감리 대기 | Go Note CRUD(소유권검사), 포스트잇 MemoPage+LinkedMemoWidget, Ctrl+K GlobalSearchBar(500ms디바운스), Rust search API연동, SearchPage(이력+예시), useAlerts 분리(useDashboard에서 추출), AlertBell+AlertDropdown, 5분자동갱신, 테스트8개 |
| Step 32: 배포+검증 | ✅ 완료 | ES256 JWKS인증(D-069), RLS비활성화(D-070), 전체법인합산(D-071), user_profiles 컬럼명 정렬, 구형파일삭제, 프론트Cloudflare+Go/Rust fly.io 3레이어 배포완료 |
| Step 33: Lightsail 서울 이전 | ✅ 완료 | Fly.io 도쿄→AWS Lightsail 서울(D-072), solarflow3.com 도메인(D-073), Caddy 리버스프록시+자동SSL(D-074), 직접바이너리+systemd, Docker미사용, 대시보드6초→2초 |
| Step 34: Mac mini 로컬 이전 | ✅ 완료 | PostgREST 로컬(D-075), Caddy 경로변환(D-076), auto-provision(D-077), Tailscale 외부접속(D-078), 프론트 정적서빙(D-079), launchd 5개 서비스, 재부팅테스트 성공 |
