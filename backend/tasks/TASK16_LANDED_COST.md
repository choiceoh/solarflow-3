# 작업: Step 14 — Landed Cost 계산 + 환율 환산 API
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.
감리 3건 지적사항 반영 완료.

## API 1: Landed Cost 계산

POST /api/calc/landed-cost

### 요청 (감리 지적 1번 반영: 우선순위 명시)
{
  "declaration_id": "uuid" (선택 — 있으면 단건 우선),
  "company_id": "uuid" (declaration_id 없으면 필수 — 일괄),
  "bl_id": "uuid" (선택 — company_id 사용 시 특정 B/L만),
  "save": false (기본값 false — 감리 지적 2번 반영)
}

우선순위:
1. declaration_id 있으면 → 해당 면장 1건만 계산 (company_id 무시)
2. declaration_id 없으면 → company_id 필수 (+ bl_id 선택 필터)
3. 둘 다 없으면 → 400 에러

save 옵션 (감리 지적 2번 반영):
- false (기본값): 계산 결과만 반환 (미리보기). DB 변경 없음.
- true: 계산 후 cost_details 테이블에 저장 (landed_total_krw, landed_wp_krw, incidental_cost 업데이트).
이유: Rust의 직접 WRITE는 Go CRUD 통제권과 충돌. 실무에서도 계산 확인 후 저장이 자연스러움.

### 응답 (감리 지적 3번 반영: allocated_expenses는 동적 맵)
{
  "items": [
    {
      "cost_id": "uuid",
      "declaration_id": "uuid",
      "declaration_number": "면장번호",
      "product_id": "uuid",
      "product_code": "M-JK0635-01",
      "product_name": "JKM635N-78HL4-BDV-S",
      "manufacturer_name": "진코솔라",
      "quantity": 9485,
      "capacity_kw": 6023.0,
      "exchange_rate": 1468.30,
      "fob_unit_usd": 0.087,
      "fob_wp_krw": 127.66,
      "cif_wp_krw": 131.50,
      "tariff_rate": 0.0,
      "tariff_amount": 0,
      "vat_amount": 92414933,
      "allocated_expenses": {
        "dock_charge": 365000,
        "transport": 1465000,
        "lc_acceptance": 693112
      },
      "total_expense_krw": 3809112,
      "expense_per_wp_krw": 0.63,
      "landed_total_krw": 795432000,
      "landed_wp_krw": 132.13,
      "margin_vs_cif_krw": 0.63
    }
  ],
  "saved": false,
  "calculated_at": "2026-03-29T12:00:00Z"
}

allocated_expenses는 HashMap<String, f64> (Rust) / map[string]float64 (Go).
expense_type 키를 하드코딩하지 않음. 새 expense_type 추가 시 코드 변경 불필요.

## Landed Cost 계산 로직 (Rust)

### 계산 공식
Landed Cost = CIF 금액(cif_total_krw) + 관세(tariff_amount) + 부대비용 배분액
Landed Wp단가 = Landed Cost / (quantity x spec_wp)
VAT는 원가 불포함 (매입세액공제 대상)

### 부대비용 배분
배분 기준: capacity_kw 비율
라인아이템 배분액 = 부대비용 총액 x (해당 라인 capacity_kw / B/L 전체 capacity_kw)

부대비용 소스 우선순위:
1. B/L에 직접 연결된 부대비용 (bl_id로 연결)
2. B/L 연결 없으면 해당 월의 부대비용 (month + company_id)

### SQL 순서

1단계: 면장 + 원가 데이터 조회
SELECT cd.*, id.declaration_number, id.bl_id, id.declaration_date,
       p.product_code, p.product_name, p.spec_wp, p.wattage_kw,
       m.name_kr as manufacturer_name
FROM cost_details cd
JOIN import_declarations id ON cd.declaration_id = id.declaration_id
JOIN products p ON cd.product_id = p.product_id
JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
WHERE (
  ($1::uuid IS NOT NULL AND cd.declaration_id = $1)
  OR ($1::uuid IS NULL AND id.company_id = $2 AND ($3::uuid IS NULL OR id.bl_id = $3))
)

2단계: B/L 연결 부대비용 조회
SELECT ie.expense_type, COALESCE(SUM(ie.amount), 0) as total_amount
FROM incidental_expenses ie
WHERE ie.bl_id = $1
GROUP BY ie.expense_type

3단계: 월별 부대비용 조회 (B/L 연결 없는 경우)
SELECT ie.expense_type, COALESCE(SUM(ie.amount), 0) as total_amount
FROM incidental_expenses ie
WHERE ie.bl_id IS NULL
  AND ie.month = $1
  AND ie.company_id = $2
GROUP BY ie.expense_type

4단계: B/L 전체 capacity_kw (배분 비율 계산용)
SELECT COALESCE(SUM(bli.capacity_kw), 0) as total_capacity_kw
FROM bl_line_items bli
WHERE bli.bl_id = $1

5단계: Rust에서 계산
- 배분 비율 = 라인 capacity_kw / B/L 전체 capacity_kw
- 각 expense_type별 배분액 = 해당 type 총액 x 배분 비율
- allocated_expenses: HashMap<String, f64> (동적)
- total_expense = allocated_expenses 값 합계
- landed_total = cif_total_krw + tariff_amount + total_expense
- landed_wp = landed_total / (quantity x spec_wp)

6단계: save=true이면 DB 업데이트
UPDATE cost_details SET
  incidental_cost = $1,
  landed_total_krw = $2,
  landed_wp_krw = $3
WHERE cost_id = $4

## API 2: 환율 환산 비교

POST /api/calc/exchange-compare
요청:
{
  "company_id": "uuid" (필수),
  "product_id": "uuid" (선택),
  "manufacturer_id": "uuid" (선택)
}

응답:
{
  "items": [
    {
      "declaration_number": "면장번호",
      "declaration_date": "2026-01-30",
      "product_name": "JKM635N-78HL4-BDV-S",
      "manufacturer_name": "진코솔라",
      "contract_rate": 1468.30,
      "fob_unit_usd": 0.087,
      "cif_unit_usd": 0.092,
      "cif_wp_at_contract": 131.50,
      "cif_wp_at_latest": 135.08,
      "rate_impact_krw": 3.58
    }
  ],
  "latest_rate": 1508.00,
  "latest_rate_source": "가장 최근 면장 환율",
  "calculated_at": "2026-03-29T12:00:00Z"
}

SQL:
SELECT cd.fob_unit_usd, cd.cif_unit_usd, cd.exchange_rate, cd.cif_wp_krw,
       id.declaration_date, id.declaration_number,
       p.product_name, m.name_kr as manufacturer_name
FROM cost_details cd
JOIN import_declarations id ON cd.declaration_id = id.declaration_id
JOIN products p ON cd.product_id = p.product_id
JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
WHERE id.company_id = $1
  AND ($2::uuid IS NULL OR cd.product_id = $2)
  AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
ORDER BY id.declaration_date DESC

Rust에서:
- 가장 최근 면장의 exchange_rate를 latest_rate로 사용
- 각 면장의 USD 단가에 latest_rate 적용하여 비교
- rate_impact = (latest_rate - contract_rate) x cif_unit_usd x spec_wp

## Rust 파일

### engine/src/calc/landed_cost.rs (신규)
- LandedCostRequest: declaration_id(Option), company_id(Option), bl_id(Option), save(bool, default false)
- LandedCostItem: 위 응답 구조, allocated_expenses는 HashMap<String, f64>
- LandedCostResponse: items + saved(bool) + calculated_at
- calculate_landed_cost(pool, req) -> Result<LandedCostResponse>

- ExchangeCompareRequest: company_id(필수), product_id(Option), manufacturer_id(Option)
- ExchangeCompareItem, ExchangeCompareResponse
- compare_exchange_rates(pool, req) -> Result<ExchangeCompareResponse>

### engine/src/calc/mod.rs 수정
- pub mod landed_cost; 추가

### engine/src/routes/calc.rs 수정
- POST /api/calc/landed-cost 추가
- POST /api/calc/exchange-compare 추가

### engine/src/model/landed_cost.rs (신규)
- 요청/응답 Serialize, Deserialize

### engine/src/model/mod.rs 수정
- pub mod landed_cost; 추가

## Go 연동

### backend/internal/engine/client.go 메서드 추가
- CalcLandedCost(req LandedCostRequest) (LandedCostResponse, error)
- CompareExchangeRates(companyID string, productID, manufacturerID *string) (ExchangeCompareResponse, error)

### backend/internal/model/landed_cost_response.go (신규)
- Go 측 응답 구조체
- AllocatedExpenses는 map[string]float64

## 테스트

### Rust: engine/tests/landed_cost_test.rs
- POST /api/calc/landed-cost: declaration_id도 company_id도 없으면 400
- POST /api/calc/landed-cost: 데이터 없으면 빈 items
- POST /api/calc/exchange-compare: company_id 누락 시 400
- 부대비용 배분 단위 테스트:
  total_capacity=100kw, item_capacity=30kw, expense=100000
  -> 배분액 30000 확인
- save=false일 때 DB 변경 없음 확인

### Go: backend/internal/engine/landed_cost_test.go
- mock 서버로 CalcLandedCost, CompareExchangeRates 호출 테스트
- allocated_expenses가 map[string]float64로 파싱되는지 확인

## DECISIONS.md 추가
- D-023: 부대비용 배분 기준은 capacity_kw 비율
  이유: 물리적 처리 비용(운송, 보관, 하역)은 용량에 비례.
- D-024: 현재 환율은 최근 면장 환율 사용 (실시간 API 미연동)
  이유: 외부 의존성 최소화. 실시간 환율 필요 시 Phase 확장.
- D-025: Landed Cost 계산 결과는 save=true일 때만 DB 저장
  이유: Rust의 직접 WRITE는 Go CRUD 통제권과 충돌.
  미리보기(save=false) 후 확인하고 저장하는 것이 실무에 자연스러움.
- D-026: allocated_expenses를 동적 맵으로 처리
  이유: expense_type이 추가되어도 코드 변경 불필요. 확장성.

## PROGRESS.md 업데이트
- Step 14 Landed Cost + 환율 환산 완료 기록
- 현재 단계: Step 15 대기

## 완료 기준
1. cargo build --release 성공
2. cargo test 성공
3. go build + go test 성공
4. curl 테스트:
   POST /api/calc/landed-cost -> 200
   POST /api/calc/exchange-compare -> 200
5. CHECKLIST_TEMPLATE.md 양식으로 보고
6. 전체 파일 코드(cat) 보여주기
