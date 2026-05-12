-- 110: outbounds_sale_unregistered view — work_queue=sale_unregistered 의
--      "수천 UUID NOT IN" URL 폭주 근본 해법. 094(sales_with_meta) 와 동일 패턴.
--
-- 배경:
--   /api/v1/outbounds?work_queue=sale_unregistered 가
--   1) sales 전수에서 outbound_id 를 끌어와 NOT IN(uuid1,uuid2,...) URL 로 합치고
--   2) Cloudflare/PostgREST URL 한도(~8KB)를 넘겨 빈 응답 → "unexpected end of JSON input" → 500.
--   3,000건만 모여도 URL 약 115KB → 100% 실패. /outbounds/dashboard 도 같은 경로.
--
-- 해법:
--   "매출 미등록 상품판매 출고" 를 DB-side view 로 영구 자료구조화한다.
--   Go 핸들러는 work_queue=sale_unregistered 일 때 outbounds 대신 이 view 를
--   PostgREST 테이블로 동일하게 쿼리한다. 모든 추가 필터(status/company_id/q/
--   manufacturer_id/sort/range) 가 그대로 합쳐진다 — 별도 RPC 시그니처 없음.
--
-- 정합성:
--   - usage_category IN ('sale','sale_spare')   — work_queue 의 의미적 기본
--   - NOT EXISTS (sales s WHERE ... AND s.status<>'cancelled')
--     ↑ activeSaleOutboundIDs() 의 "cancelled 제외" 와 일치
--   - status 기본('active') 은 view 가 강제하지 않는다 — 핸들러가 빈 status 일 때
--     적용해 사용자 status override 를 보존.
--
-- 인덱스: idx_sales_outbound_id (094 에서 생성됨) 가 NOT EXISTS 조회를 지원.
--   추가로 outbounds 의 usage_category 부분 인덱스를 새로 만들어 view 의 첫
--   필터 단계를 빠르게 한다 (전체 행 ~수만 → 상품판매 행 ~수천).

CREATE OR REPLACE VIEW outbounds_sale_unregistered AS
SELECT o.*
FROM outbounds o
WHERE o.usage_category IN ('sale', 'sale_spare')
  AND NOT EXISTS (
    SELECT 1
    FROM sales s
    WHERE s.outbound_id = o.outbound_id
      AND s.status <> 'cancelled'
  );

GRANT SELECT ON outbounds_sale_unregistered TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_outbounds_sale_usage
  ON outbounds(usage_category)
  WHERE usage_category IN ('sale', 'sale_spare');

NOTIFY pgrst, 'reload schema';
