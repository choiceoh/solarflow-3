# 작업: Step 18 — 수금 매칭 자동 추천
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.
감리 즉시 승인 — 지적사항 없음.

## Go/Rust 역할 분리
- Go (이미 구현): receipt_matches CRUD + 합계 검증 (한 행 사칙연산)
- Rust (이번 Step): 미수금 목록 조회 + 매칭 조합 추천 (여러 테이블 조합 최적화)

## API 1: 미수금 목록 조회

POST /api/calc/outstanding-list
요청:
{
  "company_id": "uuid" (필수),
  "customer_id": "uuid" (필수)
}

응답:
{
  "customer_id": "uuid",
  "customer_name": "바로(주)",
  "outstanding_items": [
    {
      "outbound_id": "uuid",
      "outbound_date": "2026-02-15",
      "product_name": "JKM635N-78HL4-BDV-S",
      "spec_wp": 635,
      "quantity": 216,
      "site_name": "도개 태양광발전소",
      "total_amount": 21122640,
      "collected_amount": 0,
      "outstanding_amount": 21122640,
      "days_elapsed": 42,
      "tax_invoice_date": "2026-02-28",
      "status": "warning"
    }
  ],
  "total_outstanding": 64562400,
  "outstanding_count": 3,
  "calculated_at": "2026-03-29T12:00:00Z"
}

status: "normal"(30일 이하), "warning"(31~60일), "overdue"(61일+)

### SQL

SELECT o.outbound_id, o.outbound_date, o.quantity, o.capacity_kw,
       p.product_name, p.spec_wp,
       o.site_name,
       s.sale_id, s.total_amount, s.tax_invoice_date,
       s.customer_id,
       ptr.partner_name as customer_name,
       COALESCE(matched.total_matched, 0) as collected_amount,
       s.total_amount - COALESCE(matched.total_matched, 0) as outstanding_amount,
       CURRENT_DATE - o.outbound_date as days_elapsed
FROM sales s
JOIN outbounds o ON s.outbound_id = o.outbound_id
JOIN products p ON o.product_id = p.product_id
JOIN partners ptr ON s.customer_id = ptr.partner_id
LEFT JOIN (
    SELECT rm.outbound_id, SUM(rm.matched_amount) as total_matched
    FROM receipt_matches rm
    GROUP BY rm.outbound_id
) matched ON matched.outbound_id = o.outbound_id
WHERE o.company_id = $1
  AND s.customer_id = $2
  AND o.status = 'active'
  AND s.total_amount > COALESCE(matched.total_matched, 0)
ORDER BY o.outbound_date ASC

## API 2: 수금 매칭 자동 추천

POST /api/calc/receipt-match-suggest
요청:
{
  "company_id": "uuid" (필수),
  "customer_id": "uuid" (필수),
  "receipt_amount": 38976300 (필수, 양수)
}

응답:
{
  "receipt_amount": 38976300,
  "suggestions": [
    {
      "match_type": "exact",
      "description": "정확히 일치하는 조합",
      "items": [
        {
          "outbound_id": "uuid",
          "outbound_date": "2026-01-03",
          "site_name": "감애1호 태양광발전소",
          "product_name": "JKM635N-78HL4-BDV-S",
          "outstanding_amount": 35433000,
          "match_amount": 35433000
        }
      ],
      "total_matched": 38464490,
      "remainder": 511810,
      "match_rate": 98.7
    }
  ],
  "unmatched_amount": 0,
  "calculated_at": "2026-03-29T12:00:00Z"
}

### 매칭 알고리즘 (Rust)

1. 미수금 목록 조회 (위 SQL 재사용)
2. 단일 정확 매칭: 미수금 1건 = 입금액 → match_type="single"
3. 조합 정확 매칭: 여러 건 합 = 입금액 → match_type="exact"
   - N <= 20: 부분집합 완전 탐색 (비트마스크 2^N)
   - N > 20: greedy (날짜 오래된 순 누적)
4. 근사 매칭: 정확 일치 없으면 입금액 이하 최대 조합 → match_type="closest"
   - 합계 > 입금액인 조합은 제외 (과매칭 방지)

최대 추천 수: 3개
차액 안내: remainder > 0이면 "선수금 또는 다음 정산 이월 가능" (실제 처리는 Phase 4)

### 성능 안전장치
- 미수금 최대 50건 (초과 시 날짜순 상위 50건)
- N <= 20 완전 탐색, N > 20 greedy
- 계산 시간 1초 초과 시 현재까지 최선 결과 반환

## Rust 파일

### engine/src/calc/receipt_match.rs (신규)

구조체:
- OutstandingListRequest: company_id(필수), customer_id(필수)
- OutstandingItem: outbound_id, outbound_date, product_name, spec_wp, quantity, site_name, total_amount, collected_amount, outstanding_amount, days_elapsed, tax_invoice_date(Option), status
- OutstandingListResponse: customer_id, customer_name, outstanding_items, total_outstanding, outstanding_count, calculated_at

- ReceiptMatchSuggestRequest: company_id(필수), customer_id(필수), receipt_amount(필수, f64, 양수)
- SuggestionItem: outbound_id, outbound_date, site_name, product_name, outstanding_amount, match_amount
- Suggestion: match_type, description, items Vec, total_matched, remainder, match_rate
- ReceiptMatchSuggestResponse: receipt_amount, suggestions Vec, unmatched_amount, calculated_at

함수:
- get_outstanding_list(pool, req) -> Result<OutstandingListResponse>
- suggest_receipt_match(pool, req) -> Result<ReceiptMatchSuggestResponse>

내부 함수:
- find_exact_matches(items: &[OutstandingItem], target: f64) -> Vec<Suggestion>
  N <= 20: 비트마스크 완전 탐색
  N > 20: 건너뛰고 greedy만
- find_closest_match(items: &[OutstandingItem], target: f64) -> Suggestion
  날짜 오래된 순 누적, target 이하 최대 조합
- 단일 매칭 체크: items 중 outstanding_amount == target인 건

### engine/src/calc/mod.rs 수정
- pub mod receipt_match; 추가

### engine/src/routes/calc.rs 수정
- POST /api/calc/outstanding-list 추가
- POST /api/calc/receipt-match-suggest 추가

### engine/src/model/receipt_match.rs (신규)
- 요청/응답 Serialize, Deserialize

### engine/src/model/mod.rs 수정
- pub mod receipt_match; 추가

## Go 연동

### backend/internal/engine/client.go 메서드 추가
- GetOutstandingList(companyID, customerID string) (OutstandingListResponse, error)
- SuggestReceiptMatch(companyID, customerID string, receiptAmount float64) (ReceiptMatchSuggestResponse, error)

### backend/internal/model/receipt_match_response.go (신규)
- Go 측 응답 구조체

## 테스트

### Rust: engine/tests/receipt_match_test.rs

API 테스트:
- POST /api/calc/outstanding-list: company_id 누락 400
- POST /api/calc/outstanding-list: customer_id 누락 400
- POST /api/calc/outstanding-list: 데이터 없으면 빈 items, total=0
- POST /api/calc/receipt-match-suggest: receipt_amount 누락 400
- POST /api/calc/receipt-match-suggest: receipt_amount <= 0 -> 400
- POST /api/calc/receipt-match-suggest: 데이터 없으면 빈 suggestions

알고리즘 단위 테스트:
- 단일 정확: items=[10000], target=10000 -> single, remainder=0
- 조합 정확: items=[10000, 20000, 30000], target=30000
  -> exact (10000+20000 또는 30000 single)
- 근사 매칭: items=[10000, 25000], target=32000
  -> closest (25000, remainder=7000) 또는 (10000+25000=35000 초과이므로 25000만)
  수정: 10000+25000=35000 > 32000이므로 제외. 25000이 closest, remainder=7000
- 과매칭 방지: items=[15000, 20000], target=10000
  -> 모든 건이 10000 초과 → 빈 suggestions
- 빈 items: target=50000, items=[] -> 빈 suggestions
- match_rate: matched=38000, target=40000 -> rate=95.0%
- 완전 탐색 (N=20): 20개 items에서 정확 매칭 성공 확인
- greedy (N>20): 25개 items, 날짜순 누적, target 이하 최대 조합
- remainder=0이면 match_type="exact" 확인

### Go: backend/internal/engine/receipt_match_test.go
- mock 서버로 2개 메서드 호출 테스트

## DECISIONS.md 추가
- D-039: 수금 매칭 추천은 미수금 합계가 입금액을 초과하지 않는 조합만 제시
  이유: 과매칭은 실무 발생 안 함. 차액은 선수금/이월 (Phase 4).
- D-040: 부분집합 탐색 N<=20 완전 탐색, N>20 greedy
  이유: N=20이면 2^20 약 100만, 1초 이내. 20건 초과는 극히 드묾.
  greedy는 날짜 오래된 순으로 실무 관행과 일치.
- D-041: 미수금 status 기준 Step 16과 동일 (30/60일)
  이유: 거래처 분석과 미수금 목록의 status 일관성 유지.
- D-042: 수금 매칭은 현재 outbound_id 기준. Phase 4에서
  "N출고→1세금계산서" 케이스를 위한 스키마 개선 예정.
  이유: 현재 알고리즘은 기준 단위와 무관하게 동일 동작.
  실데이터 넣으면서 스키마 개선이 현실적.

## PROGRESS.md 업데이트
- Step 18 수금 매칭 자동 추천 완료 기록
- 현재 단계: Step 19 (자연어 검색 엔진) 대기

## 완료 기준
1. cargo build --release 성공
2. cargo test 성공
3. go build + go test 성공
4. curl 테스트:
   POST /api/calc/outstanding-list -> 200
   POST /api/calc/receipt-match-suggest -> 200
5. 알고리즘 단위 테스트 전부 통과
6. CHECKLIST_TEMPLATE.md 양식으로 보고
7. 전체 파일 코드(cat) 보여주기
