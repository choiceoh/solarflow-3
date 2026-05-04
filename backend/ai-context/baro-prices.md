# 바로(주) — 단가표·매입이력

baro 의 *단가 결정·검증* 흐름. 거래처별 판매 단가 마스터(`/baro/price-book`)와 자체 매입 단가 이력(`/baro/purchase-history`)이 한 쌍 — 매입 단가가 흔들리면 판매 단가도 곧 따라가는 게 일반적.

## 단가표 (`/baro/price-book`)

- **거래처 × 품번 × 시간대** 의 3 차원 마스터. effective_from / effective_to 로 시간대 구분 — 같은 거래처·품번의 가격은 시점별로 여러 행이 공존.
- **수주 입력 시 자동 prefill**. 수주 화면에서 거래처·품번 선택 → 오늘 날짜 기준 lookup 으로 현행 단가가 자동 입력됨. 단가표가 비면 수주 단가가 0 으로 채워져 나중에 매출 집계 오류.
- **할인율(discount_pct)** 은 단가에 곱해지는 별도 컬럼. 거래처 등급별 정책을 prefix 형태로 박을 때 사용.
- **권한**: admin / operator 만 조회·편집. 일반 영업(staff/viewer)은 단가표 화면 자체가 안 보임.

### 운영 패턴

- **3 월 단가 인상 일괄 적용**: 거래처별로 새 effective_from=2026-03-01 행을 다중 추가 (Excel import 활용). 기존 행은 effective_to 자동 갱신.
- **거래처 신규 등록 직후**: 단가표가 비어 있으면 수주 prefill 이 0 으로 들어옴. 등록과 단가표 입력은 한 세트로 진행.
- **할인율 적용 vs 단가 직접 인하**: 단기 프로모션은 discount_pct, 항구적 인하는 unit_price_wp 자체 변경 — 이력 추적 차이.

## 매입 이력 (`/baro/purchase-history`)

- **BR 법인의 자체 매입 (국내 타사·그룹내 입고) 집계**. inbound_type 별로 필터.
- **표시 단위**: unit_price_krw_wp(원/Wp), unit_price_usd_wp(USD/Wp), invoice_amount_usd. 환율 변동 추세 함께 표시.
- **권한**: admin / operator / executive. 단순 viewer 차단.
- **D-117 정책**: topsolar 측 면장·LC·원가 데이터는 노출 안 됨 (sanitized) — baro 가 알 필요 있는 자체 매입원가만.

### 운영 패턴

- "지난 분기 평균 단가는?" → 매입 이력 화면 분기 필터 → 평균값. 같은 품목의 편차가 크면 공급사 협상의 근거.
- "환율 급등 후 매입원가 변화?" → unit_price_krw_wp vs unit_price_usd_wp 비교. USD 기준 평탄해도 KRW 기준은 환율로 흔들림.
- 매입원가 < 판매단가 - 마진 임계값 인 경우 단가표 인상 트리거.

## 권한 매트릭스

| 역할 | price-book | purchase-history |
|---|---|---|
| admin | 조회·편집 | 조회 |
| operator | 조회·편집 | 조회 |
| executive | 차단 | 조회 |
| manager / staff / viewer | 차단 | 차단 |

## 자주 묻는 질문 패턴

- "A 거래처 B 패널 현재 단가?" → price-book lookup (오늘 기준).
- "3 월부터 인상 기록은 어디에?" → price-book 에서 effective_from=2026-03-01 행.
- "매입 단가 평균이 판매 단가보다 높지 않나?" → purchase-history 평균 vs price-book 현행 비교.
- "X 품목 같은 거래처 단가 편차가 왜 크지?" → effective 시간대별로 행이 여러 개일 때 정상 — 인상 이력.
- "단가표가 비어 있는데 수주가 안 됨" → 거래처·품번 단가표 행 추가 후 재시도.

## 연결

- **수주(`/orders` baro 인스턴스)**: price-book lookup 으로 단가 prefill. 단가표 변경은 *미래* 수주에만 영향 — 기존 수주는 그 시점 단가로 동결.
- **매출·채권**: 잘못된 단가가 한 번 들어가면 매출 합계·외상 잔액까지 영향. 채권 보드에서 비정상 잔액이 보이면 단가표부터 점검.
- **그룹 매입요청(`/baro/group-purchase`)**: 매입원가가 너무 비싸지면 직거래 대신 그룹사에 매입요청을 보내는 판단의 근거.
