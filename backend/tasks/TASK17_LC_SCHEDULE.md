# 작업: Step 15 — LC 만기/수수료 + 한도 복원 타임라인
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.
감리 3건 지적사항 반영 완료.

## API 1: LC 수수료 계산

POST /api/calc/lc-fee
요청:
{
  "lc_id": "uuid" (선택 — 단건),
  "company_id": "uuid" (lc_id 없으면 필수),
  "status_filter": ["opened", "docs_received"] (선택)
}
우선순위: lc_id 있으면 단건, 없으면 company_id 필수, 둘 다 없으면 400.

응답:
{
  "items": [
    {
      "lc_id": "uuid",
      "lc_number": "M0215602NU00096",
      "po_number": "MCKRJH25Q301",
      "bank_name": "산업은행",
      "company_name": "탑솔라",
      "amount_usd": 629400.89,
      "open_date": "2026-01-30",
      "usance_days": 90,
      "maturity_date": "2026-05-26",
      "days_to_maturity": 58,
      "status": "opened",
      "exchange_rate": 1468.30,
      "opening_fee": {
        "rate": 0.0036,
        "amount_krw": 3325042
      },
      "acceptance_fee": {
        "rate": 0.004,
        "days": 90,
        "amount_krw": 924149,
        "formula": "629400.89 x 0.004 x 90/360 x 1468.30"
      },
      "total_fee_krw": 4249191
    }
  ],
  "summary": {
    "total_lc_amount_usd": 15234567.89,
    "total_opening_fee_krw": 2845000,
    "total_acceptance_fee_krw": 5632000,
    "total_fee_krw": 8477000
  },
  "fee_note": "요율 기반 자동 계산 예상 금액. 실제 은행 청구 금액과 차이 가능.",
  "calculated_at": "2026-03-29T12:00:00Z"
}

### 수수료 계산 공식 (감리 지적 2번 반영: 단일 방식 통일)

fee_calc_method 필드는 무시하고 아래 공식만 적용:

개설수수료:
opening_fee_krw = amount_usd x opening_fee_rate x exchange_rate

인수수수료:
acceptance_fee_krw = amount_usd x acceptance_fee_rate x usance_days/360 x exchange_rate

exchange_rate 소스:
1순위: LC에 연결된 B/L의 환율
2순위: 없으면 가장 최근 면장 환율

### SQL

LC + 은행 데이터:
SELECT lc.*, b.bank_name, b.opening_fee_rate, b.acceptance_fee_rate,
       po.po_number, c.company_name
FROM lc_records lc
JOIN banks b ON lc.bank_id = b.bank_id
JOIN companies c ON lc.company_id = c.company_id
LEFT JOIN purchase_orders po ON lc.po_id = po.po_id
WHERE (
  ($1::uuid IS NOT NULL AND lc.lc_id = $1)
  OR ($1::uuid IS NULL AND lc.company_id = $2)
)
AND ($3::text[] IS NULL OR lc.status = ANY($3))
ORDER BY lc.maturity_date ASC

환율 조회 (B/L 우선):
SELECT bl.exchange_rate
FROM bl_shipments bl
WHERE bl.lc_id = $1 AND bl.exchange_rate IS NOT NULL
LIMIT 1

없으면 최근 면장:
SELECT cd.exchange_rate
FROM cost_details cd
JOIN import_declarations id ON cd.declaration_id = id.declaration_id
WHERE id.company_id = $1
ORDER BY id.declaration_date DESC
LIMIT 1

## API 2: 한도 복원 타임라인

POST /api/calc/lc-limit-timeline
요청:
{
  "company_id": "uuid" (선택 — 없으면 전체 법인),
  "months_ahead": 6 (선택 — 기본 6)
}

응답:
{
  "banks": [
    {
      "bank_id": "uuid",
      "bank_name": "하나은행",
      "company_name": "탑솔라",
      "lc_limit_usd": 10000000.00,
      "current_used_usd": 9639656.31,
      "current_available_usd": 360343.69,
      "usage_rate": 96.4,
      "restoration_events": [
        {
          "date": "2026-05-19",
          "lc_number": "LC-HANA-001",
          "amount_usd": 1146657.60,
          "cumulative_available_usd": 1507001.29,
          "po_number": "MCKRJH25Q301"
        }
      ]
    }
  ],
  "total_summary": {
    "total_limit_usd": 29000000.00,
    "total_used_usd": 25516384.58,
    "total_available_usd": 3483615.42,
    "total_usage_rate": 88.0,
    "projected_available": [
      {"month": "2026-04", "available_usd": 3483615.42},
      {"month": "2026-05", "available_usd": 8930000.00},
      {"month": "2026-06", "available_usd": 12050000.00}
    ]
  },
  "calculated_at": "2026-03-29T12:00:00Z"
}

### SQL

은행별 한도 + 사용액:
SELECT b.bank_id, b.bank_name, b.lc_limit_usd,
       c.company_name, c.company_id,
       COALESCE(SUM(CASE WHEN lc.status IN ('opened', 'docs_received')
                    THEN lc.amount_usd ELSE 0 END), 0) as used_usd
FROM banks b
JOIN companies c ON b.company_id = c.company_id
LEFT JOIN lc_records lc ON lc.bank_id = b.bank_id
WHERE b.is_active = true
  AND ($1::uuid IS NULL OR b.company_id = $1)
GROUP BY b.bank_id, b.bank_name, b.lc_limit_usd, c.company_name, c.company_id

복원 예정 이벤트:
SELECT lc.lc_id, lc.lc_number, lc.amount_usd, lc.maturity_date,
       lc.bank_id, po.po_number
FROM lc_records lc
LEFT JOIN purchase_orders po ON lc.po_id = po.po_id
WHERE lc.status IN ('opened', 'docs_received')
  AND lc.maturity_date > CURRENT_DATE
  AND lc.maturity_date <= CURRENT_DATE + INTERVAL '1 month' * $1
  AND ($2::uuid IS NULL OR lc.company_id = $2)
ORDER BY lc.maturity_date ASC

Rust에서:
- 은행별 current_available = limit - used
- usage_rate = used / limit x 100
- restoration_events를 날짜순 정렬, cumulative_available 누적
- projected_available: 월별 해당 월 복원 합산

## API 3: LC 만기 알림 (대시보드용)

POST /api/calc/lc-maturity-alert
요청:
{
  "company_id": "uuid" (선택),
  "days_ahead": 7 (선택 — 기본 7)
}

응답:
{
  "alerts": [
    {
      "lc_id": "uuid",
      "lc_number": "M0215602NU00096",
      "bank_name": "산업은행",
      "company_name": "탑솔라",
      "amount_usd": 629400.89,
      "maturity_date": "2026-04-02",
      "days_remaining": 4,
      "po_number": "MCKRJH25Q301",
      "severity": "critical"
    }
  ],
  "count": 3,
  "calculated_at": "2026-03-29T12:00:00Z"
}

severity: 0~3일 "critical", 4~7일 "warning"

SQL:
SELECT lc.lc_id, lc.lc_number, lc.amount_usd, lc.maturity_date,
       b.bank_name, c.company_name, po.po_number
FROM lc_records lc
JOIN banks b ON lc.bank_id = b.bank_id
JOIN companies c ON lc.company_id = c.company_id
LEFT JOIN purchase_orders po ON lc.po_id = po.po_id
WHERE lc.status IN ('opened', 'docs_received')
  AND lc.maturity_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1 * INTERVAL '1 day'
  AND ($2::uuid IS NULL OR lc.company_id = $2)
ORDER BY lc.maturity_date ASC

## Rust 파일

### engine/src/calc/lc_schedule.rs (신규)
- LcFeeRequest, LcFeeItem (opening_fee/acceptance_fee 내부 구조체 포함), LcFeeSummary, LcFeeResponse
- calculate_lc_fees(pool, req) -> Result<LcFeeResponse>
- LcLimitTimelineRequest, BankTimeline, RestorationEvent, TimelineSummary, ProjectedAvailable, LcLimitTimelineResponse
- calculate_limit_timeline(pool, req) -> Result<LcLimitTimelineResponse>
- LcMaturityAlertRequest, MaturityAlert, LcMaturityAlertResponse
- get_maturity_alerts(pool, req) -> Result<LcMaturityAlertResponse>

### engine/src/calc/mod.rs 수정
- pub mod lc_schedule; 추가

### engine/src/routes/calc.rs 수정
- POST /api/calc/lc-fee 추가
- POST /api/calc/lc-limit-timeline 추가
- POST /api/calc/lc-maturity-alert 추가

### engine/src/model/lc_schedule.rs (신규)
- 요청/응답 Serialize, Deserialize

### engine/src/model/mod.rs 수정
- pub mod lc_schedule; 추가

## Go 연동

### backend/internal/engine/client.go 메서드 추가
- CalcLcFees(req LcFeeRequest) (LcFeeResponse, error)
- GetLcLimitTimeline(companyID *string, monthsAhead int) (LcLimitTimelineResponse, error)
- GetLcMaturityAlerts(companyID *string, daysAhead int) (LcMaturityAlertResponse, error)

### backend/internal/model/lc_schedule_response.go (신규)
- Go 측 응답 구조체

## 테스트

### Rust: engine/tests/lc_schedule_test.rs
- POST /api/calc/lc-fee: lc_id도 company_id도 없으면 400
- POST /api/calc/lc-fee: 데이터 없으면 빈 items + 0 summary
- POST /api/calc/lc-limit-timeline: 데이터 없으면 빈 banks
- POST /api/calc/lc-maturity-alert: days_ahead 기본값 7 확인
- 개설수수료 단위 테스트:
  amount_usd=1000000, opening_rate=0.002, exchange_rate=1500
  -> opening_fee = 1000000 x 0.002 x 1500 = 3000000 확인
- 인수수수료 단위 테스트:
  amount_usd=1000000, acceptance_rate=0.004, days=90, exchange_rate=1500
  -> acceptance_fee = 1000000 x 0.004 x 90/360 x 1500 = 1500000 확인
- 한도 복원 단위 테스트:
  limit=10000000, used=8000000, restoration=[{amount: 2000000}]
  -> current_available=2000000, after=4000000 확인
- severity 단위 테스트: 3일 이내 critical, 4~7일 warning

### Go: backend/internal/engine/lc_schedule_test.go
- mock 서버로 3개 메서드 호출 테스트

## DECISIONS.md 추가
- D-027: LC 수수료 환율은 B/L 환율 우선, 없으면 최근 면장 환율
- D-028: 한도 복원 타임라인은 maturity_date 기준 (settlement_date 아님)
- D-029: 만기 알림 severity (0~3일 critical, 4~7일 warning)
- D-030: LC 수수료는 자동 계산(예상). 수동 입력(실제 청구 금액)은 Phase 4.
  1원 단위 차이는 마진에 영향 없으나 정확성 위해 수동 보정 기능 예정.

## PROGRESS.md 업데이트
- Rust 테스트 수 9개로 수정 (감리 지적)
- Step 15 완료 기록
- 다음: Step 16 마진/이익률 분석

## 완료 기준
1. cargo build --release 성공
2. cargo test 성공
3. go build + go test 성공
4. curl 테스트:
   POST /api/calc/lc-fee -> 200 + fee_note 포함 확인
   POST /api/calc/lc-limit-timeline -> 200
   POST /api/calc/lc-maturity-alert -> 200
5. CHECKLIST_TEMPLATE.md 양식으로 보고
6. 전체 파일 코드(cat) 보여주기
