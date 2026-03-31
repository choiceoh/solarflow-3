# 작업: Step 26 — 수주/수금 + 매칭 UI
harness/RULES.md를 반드시 따를 것. harness/CHECKLIST_TEMPLATE.md 양식으로 보고할 것.
감리 즉시 승인. 지적 0건.

## OrdersPage (/orders) — 3개 탭

탭 1: 수주 관리
탭 2: 수금 관리
탭 3: 수금 매칭 (핵심 인터랙션)

## 탭 1: 수주 관리

### 수주 목록
필터: [상태 ▼] [거래처 ▼] [관리구분 ▼]  [새로 등록]
컬럼: 발주번호(NULL이면"-"), 거래처, 수주일, 관리구분, 충당소스, 품명, 규격, 수량, 잔량, 용량(kW), Wp단가, 납기일, 현장명, 상태

상태 Badge: received=파란"접수", partial=노란"분할출고중", completed=초록"완료", cancelled=빨간"취소"

관리구분 6개: sale=상품판매, construction=공사사용, spare=스페어, repowering=리파워링, maintenance=유지관리, other=기타

충당소스 (D-015): stock=Badge초록"현재재고", incoming=Badge노란"미착품"

잔량 = quantity - shipped_qty

### 수주 상세 (행 클릭)
상단: 수주 정보 카드 + [수정]
하단: 연결된 출고 목록 (GET /api/v1/outbounds?order_id=X)
총 출고 수량 / 잔량 표시

### OrderForm.tsx (Dialog)
필드:
- order_number Input (선택, NULL 가능)
- company_id appStore 자동
- customer_id (필수) 거래처 Select (customer/both)
- order_date (필수) Input date
- receipt_method (필수) Select: purchase_order=발주서, phone=유선, email=이메일, other=기타
- management_category (필수) Select 6개
- fulfillment_source (필수) Select: stock=현재재고, incoming=미착품
  stock 선택 시: POST /api/v1/calc/inventory 호출 -> "현재 가용재고: {kW}" 표시
  incoming 선택 시: 같은 API -> "가용 미착품: {kW}" 표시
- product_id (필수) 품번 Select. 선택 시 product_name, spec_wp 표시
- quantity (필수, 양수) Input number
- capacity_kw 자동: quantity x wattage_kw (읽기전용)
- unit_price_wp (필수, 양수) Input number (원/Wp)
- site_name, site_address, site_contact, site_phone Input
- payment_terms Input (자유기재)
- deposit_rate Input number (%)
- delivery_due Input date
- spare_qty Input number
- memo Textarea

## 탭 2: 수금 관리

### 수금 목록
필터: [거래처 ▼] [월 ▼]  [새로 등록]
컬럼: 입금일, 거래처, 입금액, 입금계좌, 매칭상태, 메모

매칭상태 Badge:
- 전액 매칭: 초록 "매칭완료"
- 일부 매칭: 노란 "부분매칭 (매칭액/입금액)"
- 미매칭: 회색 "미매칭"

### ReceiptForm.tsx (Dialog)
- customer_id (필수) 거래처 Select
- receipt_date (필수) Input date
- amount (필수, 양수) Input number
- bank_account Input
- memo Textarea

## 탭 3: 수금 매칭 (핵심!)

### 매칭 3단계 UI

Step 1: 수금 선택
- 미매칭/부분매칭 수금 목록을 Select으로 표시
- 선택 시 해당 거래처의 미수금 자동 조회

Step 2: 미수금 목록 표시
- POST /api/v1/calc/outstanding-list 호출
  Body: { company_id, customer_id }
- 체크박스로 개별 선택
- 체크/해제 시 "선택 합계" 실시간 변동
- 차액 = 입금액 - 선택 합계
  양수: 초록 "선수금"
  음수: 빨간 "부족" (매칭 확정 불가)
  0: 파란 "정확 일치"

[자동 추천] 버튼:
- POST /api/v1/calc/receipt-match-suggest 호출
  Body: { company_id, customer_id, receipt_amount }
- 응답 match_type: exact/closest/single
- exact: 해당 출고 자동 체크 + "정확히 일치하는 미수금을 찾았습니다"
- closest: 가장 가까운 조합 체크 + "가장 가까운 조합입니다 (차액: N원)"
- single: 단건 체크 + "단건 매칭합니다"

[매칭 확정] 버튼:
- 차액 음수면 비활성
- 선택된 각 미수금에 대해:
  POST /api/v1/receipt-matches { receipt_id, outbound_id, matched_amount }
- 차액 0 초과 시 Dialog: "선수금 처리" 또는 "다음 정산 이월" (UI만)
- 성공 시 수금 목록 새로고침 + 성공 토스트

### 매칭 이력
수금 상세에서 이미 매칭된 내역 테이블:
출고일, 현장명, 모듈, 매칭금액
매칭 총액 / 입금액 / 남은 금액

## API

수주: GET/POST/PUT /api/v1/orders
수금: GET/POST/PUT /api/v1/receipts
수금 매칭: GET /api/v1/receipt-matches?receipt_id=X, POST /api/v1/receipt-matches
미수금 (Rust): POST /api/v1/calc/outstanding-list
매칭 추천 (Rust): POST /api/v1/calc/receipt-match-suggest
재고 (Rust): POST /api/v1/calc/inventory (수주 충당소스 표시용)

## 파일 구조

frontend/src/
├── pages/OrdersPage.tsx
├── components/orders/
│   ├── OrderListTable.tsx
│   ├── OrderDetailView.tsx (수주 상세 + 연결 출고)
│   ├── OrderForm.tsx
│   ├── ReceiptListTable.tsx
│   ├── ReceiptForm.tsx
│   ├── ReceiptMatchingPanel.tsx (매칭 메인 3 Step)
│   ├── OutstandingTable.tsx (미수금 + 체크박스)
│   ├── MatchSuggestionBanner.tsx (자동 추천 결과)
│   ├── MatchDifferenceDisplay.tsx (차액: 선수금/부족/정확)
│   ├── MatchHistoryTable.tsx (매칭 이력)
│   └── FulfillmentSourceBadge.tsx (stock/incoming)
├── hooks/
│   ├── useOrders.ts
│   ├── useReceipts.ts
│   └── useMatching.ts (outstanding + suggest + matches)
└── types/orders.ts

## types/orders.ts

Order: order_id, order_number?, company_id, company_name?, customer_id, customer_name?, order_date, receipt_method("purchase_order"|"phone"|"email"|"other"), management_category("sale"|"construction"|"spare"|"repowering"|"maintenance"|"other"), fulfillment_source("stock"|"incoming"), product_id, product_name?, product_code?, spec_wp?, wattage_kw?, quantity, capacity_kw?, unit_price_wp, site_name?, site_address?, site_contact?, site_phone?, payment_terms?, deposit_rate?, delivery_due?, shipped_qty?, remaining_qty?, spare_qty?, status("received"|"partial"|"completed"|"cancelled"), memo?

Receipt: receipt_id, customer_id, customer_name?, receipt_date, amount, bank_account?, memo?, matched_total?, remaining?

ReceiptMatch: match_id, receipt_id, outbound_id, matched_amount

OutstandingItem: outbound_id, outbound_date, customer_name?, site_name?, product_name?, spec_wp?, quantity?, total_amount, matched_amount, outstanding_amount

MatchSuggestion: match_type("exact"|"closest"|"single"), suggestions({outbound_id, amount}[]), total_suggested, difference

## PROGRESS.md 업데이트
- Step 26 완료 기록
- 프론트엔드: "Step 26 완료 (재고+입고+발주+출고+수주수금)"

## 완료 기준
1. npm run build 성공
2. 로컬 테스트:
   - /orders -> 3개 탭
   - 수주: 목록, 생성(6개 관리구분, fulfillment_source+재고표시), 수정, 상세(연결출고+잔량)
   - 수금: 목록, 등록, 매칭상태 Badge 3종
   - 매칭: 수금 선택->미수금 표시->체크박스->실시간 합계->자동추천->매칭확정->차액처리
   - 법인 변경 -> 재조회
3. harness/CHECKLIST_TEMPLATE.md 양식으로 보고
4. 전체 파일 코드 보여주기
