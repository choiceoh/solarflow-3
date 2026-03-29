# 작업: Step 19 — 자연어 검색 엔진 (Phase 3 마지막)
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.
감리 2건 수정 반영: 별칭 확정 + spec_wp 범위 확대.

## API 엔드포인트

POST /api/calc/search
요청:
{
  "company_id": "uuid" (필수),
  "query": "진코 640 재고" (필수, 빈 문자열이면 400)
}

응답:
{
  "query": "진코 640 재고",
  "intent": "inventory",
  "parsed": {
    "manufacturer": "진코솔라",
    "spec_wp": 640,
    "keywords": ["재고"]
  },
  "results": [...],
  "warnings": [],
  "calculated_at": "2026-03-29T12:00:00Z"
}

## 검색 의도 6가지 + fallback

| 의도 | 키워드 | 예시 |
|------|--------|------|
| inventory | 재고, 수량, 몇개, 얼마나 | "진코 640 재고" |
| compare | 동일규격, 비교, 같은, 대체 | "진코 640 동일규격" |
| outbound | 출고, 출하, 납품, 배송 | "바로 3월 출고" |
| lc_maturity | LC, 만기, 엘씨, 개설 | "LC 만기 이번달" |
| po_payment | 계약금, TT, 송금, 잔금 | "라이젠 계약금" |
| outstanding | 미수금, 미수, 미입금, 연체 | "미수금 60일" |
| fallback | 위 패턴 해당 없음 | "KGC원주공장" |

## 별칭 매핑 (감리 확정)

### 제조사 별칭:
("진코", "진코솔라"), ("jinko", "진코솔라"),
("트리나", "트리나솔라"), ("trina", "트리나솔라"),
("통웨이", "통웨이솔라"), ("tongwei", "통웨이솔라"), ("통웨이솔라", "통웨이솔라"),
("롱기", "LONGi"), ("론지", "LONGi"), ("longi", "LONGi"),
("에스디엔", "에스디엔"), ("sdn", "에스디엔"),
("아이코", "AIKO"), ("aiko", "AIKO"),
("한화", "한화솔라"), ("한화솔라", "한화솔라"),
("라이젠", "라이젠솔라"), ("라이젠솔라", "라이젠솔라"), ("risen", "라이젠솔라"),
("tcl", "TCL"), ("티씨엘", "TCL"),
("한솔", "한솔테크닉스"),
("현대", "현대에너지솔루션"),
("캐나디안", "캐나디안솔라"), ("canadian", "캐나디안솔라"),
("ja", "JA솔라")
참고: AIKO와 에스디엔은 별도 제조사.

### 거래처 별칭 (그룹 개념):
("바로", "바로"), ("신명", "신명"), ("미래", "신명"), ("에스엠", "신명")
참고: 신명엔지니어링 + 미래에스엠 + 에스엠전기 = 실무에서 통칭 "신명"
구현: "미래" 검색 시 → ILIKE '%미래%' OR ILIKE '%신명%' (원래 키워드 + 별칭 둘 다 검색)

### spec_wp 인식 범위 (감리 수정):
600~800 → 400~900으로 확대

## 엔티티 인식

### 제조사 인식
1. 별칭 HashMap에서 매칭 (소문자 변환 후)
2. 별칭에 없으면 DB manufacturers 테이블에서 name_kr, name_en ILIKE 검색
3. 매칭 결과: Option<(Uuid, String)>

### 거래처 인식
1. 별칭 HashMap에서 매칭
2. 별칭이 있으면: 원래 키워드 + 별칭 값 두 키워드로 DB partners 검색
   WHERE partner_name ILIKE '%원래키워드%' OR partner_name ILIKE '%별칭값%'
3. 별칭 없으면: DB partners에서 partner_name ILIKE 검색
4. 매칭 결과: Vec<(Uuid, String)> (그룹이므로 복수 반환 가능)

### 규격 인식
- 3자리 숫자 패턴, 400~900 범위 → spec_wp

### 기간 인식
- "이번달", "이번 달", "이달" → 현재 월 (YYYY-MM)
- "다음달", "다음 달" → 다음 월
- "3월", "03월" → 올해 해당 월 (2026-03)
- "60일", "30일" → 정수 추출

## 의도별 처리 로직

### 1. inventory
파싱: 제조사 + 규격 추출
처리: Step 13 재고 집계 로직 재사용
추가 SQL (최근 판매가):
SELECT s.unit_price_wp
FROM sales s
JOIN outbounds o ON s.outbound_id = o.outbound_id
WHERE o.product_id = $1 AND o.company_id = $2 AND o.status = 'active'
ORDER BY o.outbound_date DESC
LIMIT 1
응답: product_name, physical_kw, available_kw, avg_cost_cif_wp, avg_cost_landed_wp, latest_sale_price_wp
link: inventory 모듈 (product_id, manufacturer_id)

### 2. compare
파싱: 제조사 + 규격 추출
SQL:
SELECT p.product_id, p.product_name, p.spec_wp,
       p.module_width_mm, p.module_height_mm,
       m.name_kr as manufacturer_name
FROM products p
JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
WHERE p.spec_wp = $1 AND p.is_active = true
ORDER BY m.name_kr
크기(mm) 비교: 기준 제조사와 다르면 warnings에 추가
  "⚠ {A} {w}x{h}mm vs {B} {w}x{h}mm — 모듈 크기가 다릅니다. 구조물 호환 확인 필요."
link: inventory 모듈 (product_id)

### 3. outbound
파싱: 거래처(복수 가능) + 기간 추출
SQL:
SELECT o.outbound_id, o.outbound_date, o.quantity, o.capacity_kw,
       p.product_name, p.spec_wp, o.site_name, o.usage_category,
       s.unit_price_wp, s.total_amount, ptr.partner_name
FROM outbounds o
JOIN products p ON o.product_id = p.product_id
LEFT JOIN sales s ON s.outbound_id = o.outbound_id
LEFT JOIN partners ptr ON s.customer_id = ptr.partner_id
WHERE o.company_id = $1 AND o.status = 'active'
  AND ($2::uuid[] IS NULL OR s.customer_id = ANY($2))
  AND ($3::text IS NULL OR TO_CHAR(o.outbound_date, 'YYYY-MM') = $3)
ORDER BY o.outbound_date DESC
LIMIT 50
참고: 거래처가 복수(신명 그룹)이면 customer_id 배열로 필터
link: outbound 모듈 (outbound_id)

### 4. lc_maturity
파싱: 기간(월) 추출
SQL:
SELECT lc.lc_id, lc.lc_number, lc.amount_usd, lc.maturity_date,
       b.bank_name, c.company_name, po.po_number,
       lc.maturity_date - CURRENT_DATE as days_remaining
FROM lc_records lc
JOIN banks b ON lc.bank_id = b.bank_id
JOIN companies c ON lc.company_id = c.company_id
LEFT JOIN purchase_orders po ON lc.po_id = po.po_id
WHERE lc.status IN ('opened', 'docs_received')
  AND ($1::uuid IS NULL OR lc.company_id = $1)
  AND TO_CHAR(lc.maturity_date, 'YYYY-MM') = $2
ORDER BY lc.maturity_date ASC
link: lc 모듈 (lc_id)

### 5. po_payment
파싱: 제조사 추출
SQL (PO):
SELECT po.po_id, po.po_number, po.status, po.total_mw,
       m.name_kr as manufacturer_name
FROM purchase_orders po
JOIN manufacturers m ON po.manufacturer_id = m.manufacturer_id
WHERE po.company_id = $1 AND po.manufacturer_id = $2
  AND po.status IN ('draft', 'contracted', 'shipping')
ORDER BY po.contract_date DESC
SQL (T/T):
SELECT tt.tt_id, tt.remit_date, tt.amount_usd, tt.amount_krw,
       tt.exchange_rate, tt.purpose, tt.status
FROM tt_remittances tt
WHERE tt.po_id = $1
ORDER BY tt.remit_date ASC
응답: PO 목록 + T/T 이력 + 송금 합계 + 비율
link: po 모듈 (po_id)

### 6. outstanding
파싱: 일수 추출 (기본 0 = 전체)
SQL:
SELECT ptr.partner_id, ptr.partner_name,
       SUM(s.total_amount - COALESCE(matched.total_matched, 0)) as outstanding_total,
       COUNT(*) as outstanding_count,
       MAX(CURRENT_DATE - o.outbound_date) as max_days
FROM sales s
JOIN outbounds o ON s.outbound_id = o.outbound_id
JOIN partners ptr ON s.customer_id = ptr.partner_id
LEFT JOIN (
    SELECT rm.outbound_id, SUM(rm.matched_amount) as total_matched
    FROM receipt_matches rm GROUP BY rm.outbound_id
) matched ON matched.outbound_id = o.outbound_id
WHERE o.company_id = $1 AND o.status = 'active'
  AND s.total_amount > COALESCE(matched.total_matched, 0)
  AND (CURRENT_DATE - o.outbound_date) >= $2
GROUP BY ptr.partner_id, ptr.partner_name
HAVING SUM(s.total_amount - COALESCE(matched.total_matched, 0)) > 0
ORDER BY outstanding_total DESC
link: customer-analysis 모듈

### 7. fallback
SQL (UNION):
SELECT 'product' as source, p.product_id::text as id,
       p.product_name as title, m.name_kr as subtitle
FROM products p
JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
WHERE p.product_name ILIKE $1 OR p.product_code ILIKE $1
LIMIT 10
UNION ALL
SELECT 'partner', ptr.partner_id::text, ptr.partner_name, ptr.partner_type
FROM partners ptr WHERE ptr.partner_name ILIKE $1
LIMIT 10
UNION ALL
SELECT 'site', o.outbound_id::text, o.site_name, TO_CHAR(o.outbound_date, 'YYYY-MM-DD')
FROM outbounds o WHERE o.site_name ILIKE $1 AND o.company_id = $2
LIMIT 10
검색어에 % 와일드카드: "KGC" → "%KGC%"
link: 소스에 따라 product/partner/outbound 모듈

## 파싱 흐름 (Rust)

parse_query(query, pool) -> ParsedQuery:
1. 토큰화: 공백 분리 + 소문자 변환
2. 제조사 인식: 별칭 HashMap + DB 조회
3. 거래처 인식: 별칭 HashMap + DB 조회 (그룹 처리, 복수 반환)
4. 규격 인식: 3자리 숫자 400~900 범위
5. 기간 인식: "이번달"→현재월, "3월"→"2026-03", "60일"→60
6. 의도 키워드 매칭
7. 의도 결정 (우선순위: inventory > compare > outbound > lc_maturity > po_payment > outstanding)

ParsedQuery:
- manufacturer: Option<(Uuid, String)>
- partners: Vec<(Uuid, String)> (그룹이므로 복수)
- spec_wp: Option<i32>
- month: Option<String>
- days: Option<i32>
- intent: SearchIntent
- raw_tokens: Vec<String>

## Rust 파일

### engine/src/calc/search.rs (신규)
타입:
- SearchRequest, SearchIntent(enum), ParsedQuery
- SearchResult: result_type, title, data(serde_json::Value), link(SearchLink)
- SearchLink: module, params(HashMap<String, String>)
- SearchResponse: query, intent, parsed, results, warnings, calculated_at

함수:
- search(pool, req) -> Result<SearchResponse>
- parse_query(query, pool) -> Result<ParsedQuery>
- execute_intent(pool, company_id, parsed) -> Result<(Vec<SearchResult>, Vec<String>)>
  의도별 분기: search_inventory, search_compare, search_outbound,
  search_lc_maturity, search_po_payment, search_outstanding, search_fallback

별칭:
- get_manufacturer_aliases() -> HashMap<String, String>
- get_partner_aliases() -> HashMap<String, String>
- resolve_manufacturer(token, aliases, pool) -> Option<(Uuid, String)>
- resolve_partners(token, aliases, pool) -> Vec<(Uuid, String)>

### engine/src/calc/mod.rs 수정
- pub mod search; 추가

### engine/src/routes/calc.rs 수정
- POST /api/calc/search 추가

### engine/src/model/search.rs (신규)
### engine/src/model/mod.rs 수정

## Go 연동

### backend/internal/engine/client.go 메서드 추가
- Search(companyID, query string) (SearchResponse, error)

### backend/internal/model/search_response.go (신규)
- Data는 map[string]interface{} (의도별로 다른 구조)

## 테스트

### Rust: engine/tests/search_test.rs

API 테스트:
- company_id 누락 400
- query 빈 문자열 400
- 데이터 없으면 빈 results

파싱 단위 테스트:
- "진코 640 재고" → manufacturer="진코솔라", spec_wp=640, intent=Inventory
- "진코 640 동일규격" → manufacturer="진코솔라", spec_wp=640, intent=Compare
- "바로 3월 출고" → partners=["바로..."], month="2026-03", intent=Outbound
- "LC 만기 이번달" → month=현재월, intent=LcMaturity
- "라이젠 계약금" → manufacturer="라이젠솔라", intent=PoPayment
- "미수금 60일" → days=60, intent=Outstanding
- "KGC원주공장" → intent=Fallback
- "jinko 640" → manufacturer="진코솔라" (영문 별칭)
- "640 재고" → spec_wp=640, intent=Inventory (제조사 없이)
- "재고" → intent=Inventory (규격 없이)
- "450" → spec_wp=450 (400~900 범위 내)
- "350" → spec_wp 인식 안 됨 (범위 밖)

별칭 테스트:
- "진코" → "진코솔라"
- "trina" → "트리나솔라"
- "통웨이" → "통웨이솔라"
- "아이코" → "AIKO" (에스디엔과 별도)
- "에스디엔" → "에스디엔" (AIKO와 별도)
- "미래" → 거래처 별칭 "신명" → 원래 "미래" + 별칭 "신명" 둘 다 검색
- "알수없는제조사" → None

의도 분류 테스트:
- "재고" → Inventory, "동일규격" → Compare, "비교" → Compare
- "출고" → Outbound, "납품" → Outbound
- "LC" → LcMaturity, "만기" → LcMaturity
- "계약금" → PoPayment, "송금" → PoPayment
- "미수금" → Outstanding, "연체" → Outstanding
- "아무말" → Fallback

### Go: backend/internal/engine/search_test.go
- mock 서버로 Search 호출 테스트

## DECISIONS.md 추가
- D-043: 제조사 별칭은 HashMap 하드코딩. Phase 확장 시 DB 테이블로.
  거래처 별칭은 "그룹" 개념 (신명=신명엔지니어링+미래에스엠+에스엠전기).
  검색 시 원래 키워드 + 별칭 값 둘 다 ILIKE 검색하여 그룹 커버.
  한계: partner_name에 별칭 값이 포함되지 않으면 누락 가능.
  Phase 확장 시 partners에 group_name 필드 추가 검토.
- D-044: 키워드 패턴 매칭 (LLM 미사용). 실무 패턴 제한적. Phase 확장 시 LLM.
- D-045: fallback은 ILIKE 전체 텍스트. 한국어 tsvector 제한. 데이터 증가 시 pg_trgm.
- D-046: 검색 결과에 link 포함. Phase 4 프론트에서 "결과 클릭 → 상세 이동" 직접 사용.
- D-047: AIKO와 에스디엔은 별도 제조사로 관리 (감리 확정).

## PROGRESS.md 업데이트
- Step 19 자연어 검색 엔진 완료 기록
- Phase 3 Rust 계산엔진 전체 완료 기록
- 현재 단계: Phase 4 (프론트엔드 + 연동) 대기

## 완료 기준
1. cargo build --release 성공
2. cargo test 성공 (파싱+별칭+의도분류 단위 테스트 전부)
3. go build + go test 성공
4. curl 테스트:
   POST /api/calc/search {"query":"진코 640 재고"} → intent="inventory"
   POST /api/calc/search {"query":"LC 만기 이번달"} → intent="lc_maturity"
   POST /api/calc/search {"query":"미수금 60일"} → intent="outstanding"
5. CHECKLIST_TEMPLATE.md 양식으로 보고
6. 전체 파일 코드(cat) 보여주기
