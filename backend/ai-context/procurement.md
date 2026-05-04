# P/O 발주·L/C 개설 화면

ERP 의 *발주 측* 흐름. 해외 공급사와 계약(P/O) → 신용장 개설(L/C) → T/T 송금(계약금·중도금·잔금) → 선적(BL 로 인계) 순서. 한 P/O 가 여러 라인(혼합 규격) + 여러 LC(분할 개설) + 여러 T/T(분할 송금) 로 가지를 칠 수 있음.

## 공통 규칙

- **P/O 라인은 규격별**. 한 PO 에 "320W 100 장 + 350W 50 장" 처럼 혼합 가능. 단가 단위는 ¢/Wp(센트 와트당) 또는 USD/장 중 PO 마다 선택.
- **LC 는 PO 단위 또는 분할 개설**. 한 PO 를 LC1(부분 50%) + LC2(나머지 50%) 로 나누는 패턴이 흔함 — 한도·만기·은행 분산용.
- **T/T 는 단계별**: 계약금(20~30%) → 선적전 잔금. LC 개설 안 하고 T/T 만으로 결제하는 PO 도 있음 (소액·신뢰 거래).
- **단가 인상 추적**: 같은 제조사·같은 규격이 시즌별로 단가가 변함. price_history 에서 분기별 추세 확인.

## 화면별

- **P/O 목록 (`/procurement`, `/po`)**: 제조사별·상태별. status=draft/contracted/shipping/completed.
- **P/O 상세 (`/procurement/{id}`)**: 라인 편집, T/T 송금 이력, 연결된 LC·BL 한눈에.
- **L/C 개설 (`/lc`)**: 은행 선택, Usance(L/C 유효기간) 설정, 만기일 자동 계산.
- **L/C 목록**: 만기 임박 알림 자동. 만기 7 일 내는 🔴 표시.
- **단가 이력 (`/price-history`)**: 제조사 × 규격 × 시점 단가 변동 차트.

## 권한 주의

- **viewer**: 단가, LC 수수료, T/T 송금액 모두 차단. "이 PO 단가?" 류 답변 금지.
- **staff**: PO 조회만, 신규 입력은 manager 승인 필요.
- **manager+**: LC 개설, Usance 수정, 단가 입력 권한.

## 자주 묻는 질문 패턴

- "이번 달 새 PO 몇 건?" → purchase_orders.created_at 기준. 금액 노출은 권한 확인.
- "LC 만기 7 일 이내?" → lc_records.maturity_date BETWEEN today AND today+7.
- "미입고 PO (shipping 상태) 선적 예정일?" → PO 입고현황 뷰의 진행률 바.
- "X 제조사 단가 인상폭?" → price_history 분기별 변화율.
- "이 PO 의 결제 진행 상황?" → PO 상세에서 T/T 송금 이력 + 연결 LC 의 settled 여부.

## 연결

- **inbound**: PO 선적 → BL 자동 생성/연결. PO.lines 의 contracted_qty 와 BL.lines 의 actual_qty 차이 = 미착품.
- **banking**: LC 개설 시 은행 한도 차감 → BL 결제 후 만기일에 한도 복원.
- **margin**: PO 매입단가가 outbound 마진 계산의 베이스. 단가 변동이 마진을 즉시 흔들 수 있음.
