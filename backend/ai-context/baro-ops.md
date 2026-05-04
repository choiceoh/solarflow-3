# 바로(주) — 배차·채권 운영

baro 의 *일상 처리 운영* 화면 두 개. 배차(`/baro/dispatch`) 는 출고 직전 단계, 채권(`/baro/credit-board`) 은 매출 후 회수 단계. 둘은 서로 직접 연결 안 되지만 baro 일과의 양 끝점을 차지함.

## 배차 보드 (`/baro/dispatch`)

- **일자 × 차량** 단위 배차 슬롯. 한 슬롯에 여러 출고 라인을 묶어 한 차량에 적재.
- **엔티티**: `dispatch_routes` (route_date, vehicle_type, vehicle_plate, driver_name, status)
- **상태 흐름**: planned (계획) → dispatched (출하) → completed (완료/수령 확인). cancelled 도 가능.
- **권한**: admin / operator. executive 조회만.

### 운영 패턴

- **배차 계획 → 출고 등록 순서**: 차량 슬롯 만들고, 거기에 수주를 끌어다 붙임. 적재량 초과 시 추가 슬롯 자동 제안.
- **배차 후 수정**: 차량 변경(고장 등)은 admin 이 수동. 운전자만 바꾸는 거면 operator 도 가능.
- **인커밍 → 배차** 의 시간차: 그룹사에서 받은 입고가 arrived 되면 배차 슬롯에 끌어넣을 수 있음. 통관 안 끝난 customs 상태는 적재 불가.

### 자주 묻는 질문 패턴

- "내일 배차 현황은?" → route_date=tomorrow, status=planned.
- "X차 아직 미출고?" → vehicle_plate=X, status=planned (출발 시각 지났으면 운전자에게 확인).
- "이번 주 완료된 배송 건수?" → status=completed, route_date 기준 주간.
- "배차 안 된 인커밍?" → /baro/incoming arrived 분 ↔ /baro/dispatch 의 미배정 출고 매칭.

## 채권 보드 (`/baro/credit-board`)

- 거래처별 외상 관리 대시보드. 한 행에 누적매출 / 누적입금 / 미수잔액 / 한도(credit_limit_krw) / 한도사용률(%) / 최장미수일(payment_days) 표시.
- **데이터 소스**: `baro_credit_board` RPC — DB 안에서 집계 수행 (성능). active 한 customer/both 거래처만.
- **편집 가능 컬럼**: credit_limit_krw, credit_payment_days (한도와 결제 기일). 운영자가 직접 편집해 거래처 신용 정책 반영.
- **권한**: admin / operator. executive 차단 (영업 협상 정보).

### 운영 패턴

- **한도 사용률 80% 초과 거래처**: 🔴 표시. 추가 출고 전에 입금 받아야 함.
- **payment_days 초과 (예: 60 일 초과 미수)**: 영업이 직접 연락. 90 일 초과는 한도 일시 정지 검토.
- **한도 변경 이력**: 화면 자체에는 변경 시점만 보이고, 협상 사유는 별도 메모(D-109 후속).
- **입금 등록은 별도 화면** (`/receipts` 또는 baro 수금 화면). 채권 보드에는 결과만 반영.

### 자주 묻는 질문 패턴

- "한도 초과 거래처는?" → 한도사용률 ≥ 100%.
- "30 일 이상 미수금 고객?" → payment_days ≥ 30 정렬.
- "X 거래처 한도 변경하고 싶다" → 채권 보드 인라인 편집 (operator+).
- "이번 달 신규 외상 발생액?" → 누적매출 - 누적입금 의 월간 증분 (별도 분석 화면 권장).
- "그룹내 거래는 왜 외상에 안 잡혀?" → 의도적. 그룹내 정산은 채권에서 제외. 그룹 거래만 보려면 /baro/group-purchase 의 received 행.

## 권한 매트릭스

| 역할 | dispatch | credit-board |
|---|---|---|
| admin | 전체 | 전체 + 인라인 편집 |
| operator | 생성·조회·수정 | 조회 + 인라인 편집 |
| executive | 조회 | 차단 |
| manager / staff | 차단 | 차단 |
| viewer | 차단 | 차단 |

## 연결

- **수주 → 배차**: 수주 등록 후 배차 슬롯에 할당. 배차 미할당 수주는 출고 못 함.
- **출고 → 채권**: 출고 후 매출 인식 → 채권 보드 누적매출 자동 증가. 입금 매칭 → 누적입금 증가, 미수잔액 감소.
- **인커밍 → 배차**: 그룹내 입고가 arrived 되면 배차 가능. 통관(customs) 진행중은 미가용.
- **단가표 → 채권**: 단가표 오류로 매출이 비정상이면 채권 잔액도 비정상 — 단가표 점검부터.
