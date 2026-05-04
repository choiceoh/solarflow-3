# 바로(주) 화면 — 국내 도매 (단가표·배차·매입요청)

`baro.topworks.ltd` 테넌트 전용 영역. **module/cable 테넌트와는 완전히 격리**되어 있어, 한쪽 사용자는 반대쪽 데이터를 못 봄. 바로(주)는 국내 도매·인바운드가 주력 — L/C·면장 같은 수입 도구는 등장하지 않음. 단가표·배차·매입요청 흐름이 핵심.

## 공통 규칙

- **테넌트 격리가 절대 규칙**. baro 사용자는 topsolar 의 매입원가·이익률을 못 보고, topsolar 사용자는 baro 의 판매가를 못 봄. 이건 권한 문제가 아니라 데이터 silo — 도구 자체가 노출 안 됨.
- **단가표(price book)** 가 거래의 시작. 제조사 × 규격별로 판매단가·최소주문수량·유효기간을 미리 등록.
- **배차는 출하 단위**. 한 주문이 여러 회차로 분할 배차될 수 있음 — 트럭 한 대당 적재량 제약.
- **매입요청은 baro → topsolar 역방향**. baro 가 직수입 안 하는 품목을 topsolar 에게 "사다 달라" 요청.

## 화면별

- **단가표 (`/baro/prices`)**: 제조사·규격별 판매단가 기준. 분기별 시즌 단가 변경.
- **배차 현황 (`/baro/deliveries`)**: 주문 → 출하 → 수령 추적. status=ordered/shipped/received.
- **매입요청 (`/baro/purchase-requests`)**: baro → topsolar 역구매. 승인되면 topsolar 의 PO 로 전환.
- **재고 조회**: topsolar 가 baro 로 출고한 누적 - baro 가 판매한 누적 = 현재 재고.

## 권한 주의

- **baro 내부**: viewer/manager/operator 권한은 동일 패턴. manager 이하는 단가·마진 차단.
- **타테넌트(topsolar/cable) 사용자**: baro 영역에 아예 접근 불가. URL 직접 접근해도 미들웨어가 차단.
- **executive**: 단가·매출 조회 가능, 입력은 불가.

## 자주 묻는 질문 패턴

- "오늘 배차된 물량?" → baro_deliveries.status=shipped, 배차일 = today.
- "이번 달 판매액·마진?" → baro 매출 대시보드. manager 이하면 마진 거절.
- "X 규격 단가표 현행?" → /baro/prices 에서 제조사·규격 필터.
- "topsolar 에 매입요청한 건 진행 상황?" → 매입요청 목록의 status (pending → approved → po_created → received).
- "재고 부족한 규격?" → 재고 조회의 minimum_stock 미달 알림.

## 연결 (테넌트 경계)

- **topsolar inbound** ← baro 매입요청 → topsolar PO/BL → topsolar 출고(target=baro) → baro 재고 +.
- **baro 출고**: baro 의 판매는 topsolar 의 outbound 와 무관 (별도 흐름). 매출 집계도 별도.
- **자금**: baro 는 topsolar 와 그룹 내 정산. 외부 LC·해외 송금 안 함.
