# 작업: Step 28B — 대시보드 (역할별 + 알림 9가지 + 차트 3개)
harness/RULES.md를 반드시 따를 것. harness/CHECKLIST_TEMPLATE.md 양식으로 보고할 것.
감리 승인. 1건 반영: Promise.allSettled + 섹션별 개별 loading.

## DashboardPage (/) — 역할별 분기

- admin, manager: ManagerDashboard (상세 + 알림)
- executive: ExecutiveDashboard (큰 그림)
- staff, viewer: ExecutiveDashboard 간소화

## 경영진 대시보드 (ExecutiveDashboard)

요약 카드 6개:
총재고(MW)=파란, 가용(MW)=초록, 미착품(MW)=노란, 총확보(MW)=보라, 미수금(원)=빨간, LC가용(USD)=하늘
데이터: inventory summary(kw/1000→MW), customer-analysis(outstanding), lc-limit-timeline(가용합계)

차트 2개:
1. MonthlyRevenueChart (BarChart): Rust margin-analysis
   X축: 월(6개월), 바: 매출(파란)+마진(초록), 라인: 마진율(%)
2. PriceTrendChart (LineChart): Rust price-trend
   X축: 분기, 라인: 제조사별(상위5) — 진코=파란,트리나=빨간,라이젠=초록,LONGi=주황,기타=회색
   제조사 필터 체크박스

법인별 요약 (CompanySummaryTable): "전체" 선택 시만 표시
| 법인 | 재고(MW) | 가용(MW) | 월매출 | 미수금 | LC가용 |
3개 법인 각각 API 호출

장기재고 경고: inventory items의 long_term_status 카운트
warning=노란"장기(6M+) N건", critical=빨간"초장기(12M+) N건", 0=초록"없음"
클릭 -> /inventory

## 관리자 대시보드 (ManagerDashboard)

경영진 전체 + 추가 4섹션:

1. 알림 패널 (AlertPanel) — 9가지
2. 미착품 프리뷰 (IncomingPreview) — 최근 10건
3. 수주 잔량 (OrderBacklog) — 잔량>0, 최근 10건
4. 미수금 거래처별 (OutstandingByCustomer) — Rust customer-analysis

## 알림 9가지

| # | 알림 | 트리거 | 아이콘(Lucide) | 색상 | 소스 | 클릭 이동 |
|---|------|--------|--------------|------|------|---------|
| 1 | LC 만기 임박 | 7일 이내 | Clock | 빨간 | Rust lc-maturity-alert | /banking 탭2 |
| 2 | LC 한도 부족 | 3개월 내 수요>가용 | TrendingDown | 빨간 | useLCDemand(28A) | /banking 탭4 |
| 3 | 미수금 주의 | 30일 초과 | AlertTriangle | 노란 | Rust customer-analysis | /orders 탭3 |
| 4 | 미수금 연체 | 60일 초과 | AlertCircle | 빨간 | Rust customer-analysis | /orders 탭3 |
| 5 | 계산서 미발행 | 출고완료+미등록 | FileText | 회색 | Go outbounds+sales | /outbound 탭2 |
| 6 | 입항 예정 | ETA 7일 이내 | Ship | 파란 | Go bl-shipments | /inbound |
| 7 | 장기재고 주의 | 180일 | Package | 노란 | Rust inventory | /inventory |
| 8 | 장기재고 심각 | 365일 | PackageX | 빨간 | Rust inventory | /inventory |
| 9 | 출고 예정 | 납기 7일 이내 미출고 | Truck | 파란 | Go orders | /orders 탭1 |

severity 순 정렬: critical -> warning -> info
건수 0이면 해당 알림 숨김

알림 데이터 조회:
1: POST /api/v1/calc/lc-maturity-alert { company_id, days_ahead: 7 } -> count
2: useLCDemand hook 재사용 -> monthlyData에서 status="shortage" 있으면
3,4: POST /api/v1/calc/customer-analysis -> days > 30/60 필터
5: GET /api/v1/outbounds?status=active + GET /api/v1/sales -> 매출없거나 tax_invoice_date null
6: GET /api/v1/bl-shipments?status=shipping -> eta 7일 이내 필터
7,8: POST /api/v1/calc/inventory -> long_term_status warning/critical 카운트
9: GET /api/v1/orders?status=received,partial -> delivery_due 7일 이내+remaining_qty>0

## useDashboard.ts (감리 지적 반영!)

useDashboard(companyId, userRole):

핵심: Promise.allSettled 사용. 개별 API 실패 시 해당 섹션만 에러.

상태 구조:
{
  summary: { data, loading, error }
  revenue: { data, loading, error }
  priceTrend: { data, loading, error }
  alerts: { data, loading, error }
  companySummary: { data, loading, error }
  incoming: { data, loading, error }
  orderBacklog: { data, loading, error }
  outstanding: { data, loading, error }
}

각 섹션에 개별 loading 전달 -> 먼저 로드된 섹션부터 표시.
API 호출:
const results = await Promise.allSettled([
  fetchInventory(),
  fetchMarginAnalysis(),
  fetchCustomerAnalysis(),
  fetchPriceTrend(),
  fetchLCTimeline(),
  fetchLCMaturityAlert(),
  fetchBLShipments(),
  fetchOrders(),
  fetchOutboundsAndSales(),
])
각 result.status === "fulfilled" -> 데이터 설정
각 result.status === "rejected" -> 해당 섹션 error 설정

## 관리자 추가 섹션 상세

### IncomingPreview
GET /api/v1/bl-shipments?company_id=X&status=shipping,arrived,customs
최근 10건, 컬럼: B/L, 제조사, 품명, 수량, ETA, 상태Badge
[전체 보기] -> navigate("/inbound")

### OrderBacklog
GET /api/v1/orders?company_id=X&status=received,partial
remaining_qty > 0, 최근 10건
컬럼: 거래처, 품명, 수주량, 출고량, 잔량, 납기
납기 7일 이내: 빨간
[전체 보기] -> navigate("/orders")

### OutstandingByCustomer
POST /api/v1/calc/customer-analysis { company_id }
컬럼: 거래처, 미수금액, 건수, 최장일수
최장일수 60일+: 빨간
[전체 보기] -> navigate("/orders") 탭3

## 파일 구조

frontend/src/
├── pages/DashboardPage.tsx (빈 페이지 교체)
├── components/dashboard/
│   ├── ExecutiveDashboard.tsx
│   ├── ManagerDashboard.tsx
│   ├── SummaryCards.tsx (6개)
│   ├── MonthlyRevenueChart.tsx (BarChart)
│   ├── PriceTrendChart.tsx (LineChart)
│   ├── CompanySummaryTable.tsx
│   ├── LongTermStockWarning.tsx
│   ├── AlertPanel.tsx (9가지)
│   ├── AlertItem.tsx
│   ├── IncomingPreview.tsx
│   ├── OrderBacklog.tsx
│   └── OutstandingByCustomer.tsx
├── hooks/useDashboard.ts (Promise.allSettled + 섹션별 loading)
└── types/dashboard.ts

## types/dashboard.ts

DashboardSectionState<T>: { data: T | null, loading: boolean, error: string | null }

DashboardSummary: physical_mw, available_mw, incoming_mw, secured_mw, outstanding_krw, lc_available_usd

MonthlyRevenue: months({month, revenue_krw, margin_krw, margin_rate}[])

PriceTrend: manufacturers({name, color, data_points({period, price_usd_wp}[])}[])

CompanySummaryRow: company_id, company_name, physical_mw, available_mw, monthly_revenue_krw, outstanding_krw, lc_available_usd

AlertItem: id, type(string), severity("critical"|"warning"|"info"), icon(string), title, description, count, link(string)

## Recharts 패턴

공통: ResponsiveContainer width="100%" height={300}, CartesianGrid, Tooltip 포맷

BarChart: Bar dataKey="revenue_krw" fill 파란 + Bar "margin_krw" fill 초록 + Line "margin_rate" 빨간점선(yAxisId="right")
LineChart: 제조사별 Line 색상 구분, dot={true}
데이터 없으면: 차트 영역에 "데이터가 없습니다" 중앙 표시

## PROGRESS.md 업데이트
- Step 28B 완료 기록

## 완료 기준
1. npm run build 성공
2. 로컬 테스트:
   - / -> 역할별 분기 (admin=Manager)
   - 카드 6개 (데이터 없으면 0)
   - BarChart + LineChart (빈 차트)
   - 법인별 요약 ("전체"시)
   - 장기재고 경고
   - 알림 9가지 (해당 건만)
   - 알림 클릭 -> 페이지 이동
   - 미착품/수주잔량/미수금 프리뷰 (admin만)
   - 개별 API 실패 -> 해당 섹션만 에러 (Promise.allSettled)
   - 먼저 로드된 섹션부터 표시 (섹션별 loading)
   - Rust 미실행 -> 503 섹션별 처리
   - 법인 변경 -> 재조회
3. harness/CHECKLIST_TEMPLATE.md 양식으로 보고
4. 전체 파일 코드 보여주기
