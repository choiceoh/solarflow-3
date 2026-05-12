-- @auto-apply: yes
-- 103_fifo_normalize_customer_match.sql
--
-- 102 가 5건 잔존: customer 이름 변형 (바로 주식회사 ↔ 바로(주), 송천 ↔ 보인전력 등)
-- 때문에 LIKE 매칭 실패. 회사명을 정규화 (주식회사/(주)/유한회사/공백 제거)
-- 한 키로 매칭.
--
-- 추가로 1건 (IS2503000200) 은 outbound 의 customer 가 (주)송천 인데 fifo
-- customer 는 유한회사보인전력 — 임포터가 ERP no 를 잘못 라우팅. 날짜가
-- ±3일 다르긴 하지만 가까운 보인전력 outbound (fifo=0) 가 있어 수동 매칭.

BEGIN;

-- 회사명 정규화 함수: '주식회사', '유한회사', '(주)', '㈜', 공백 제거 후 소문자
CREATE OR REPLACE FUNCTION norm_company(name text) RETURNS text AS $$
  SELECT lower(regexp_replace(
    regexp_replace(
      COALESCE(name, ''),
      '(주식회사|유한회사|\(주\)|\(유\)|㈜|㈠|주식)', '', 'g'
    ),
    '\s+', '', 'g'
  ))
$$ LANGUAGE sql IMMUTABLE;

-- ───────── Strategy: 같은 날짜 + product + qty + 정규화 customer 매칭 + fifo=0 sibling ─────────
WITH bad AS (
  SELECT o.outbound_id, o.outbound_date, o.product_id, o.company_id, o.quantity AS ob_qty
  FROM outbounds o JOIN fifo_matches fm ON fm.outbound_id=o.outbound_id
  WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
  GROUP BY o.outbound_id, o.quantity, o.outbound_date, o.product_id, o.company_id
  HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
),
orphans AS (
  SELECT fm.match_id, fm.outbound_id AS bad_ob, fm.allocated_qty,
         norm_company(fm.customer_name) AS norm_cust,
         b.outbound_date, b.product_id, b.company_id
  FROM bad b JOIN fifo_matches fm ON fm.outbound_id=b.outbound_id
  WHERE fm.allocated_qty <> b.ob_qty
),
strategy AS (
  SELECT o.match_id, o.bad_ob, cand.outbound_id AS new_ob, o.allocated_qty,
         ROW_NUMBER() OVER (PARTITION BY o.match_id ORDER BY cand.outbound_id) AS rn
  FROM orphans o
  JOIN outbounds cand
    ON cand.product_id     = o.product_id
   AND cand.outbound_date  = o.outbound_date
   AND cand.quantity       = o.allocated_qty
   AND cand.company_id     = o.company_id
   AND cand.outbound_id   <> o.bad_ob
   AND cand.status         = 'active'
   AND cand.usage_category IN ('sale','sale_spare')
   AND (SELECT COALESCE(SUM(allocated_qty),0) FROM fifo_matches WHERE outbound_id=cand.outbound_id) = 0
   AND EXISTS (
     SELECT 1 FROM sales s JOIN partners p ON p.partner_id=s.customer_id
     WHERE s.outbound_id=cand.outbound_id AND s.status='active'
       AND norm_company(p.partner_name) = o.norm_cust
   )
),
audit AS (
  INSERT INTO _fifo_empty_sibling_audit_20260512
    (match_id, old_outbound_id, new_outbound_id, strategy, allocated_qty)
  SELECT match_id, bad_ob, new_ob, '1:1 qty + norm_customer', allocated_qty
  FROM strategy WHERE rn = 1
  ON CONFLICT (match_id) DO NOTHING
  RETURNING match_id, new_outbound_id
)
UPDATE fifo_matches fm
SET outbound_id = a.new_outbound_id
FROM audit a
WHERE fm.match_id = a.match_id;

-- ───────── IS2503000200 수동 정정 (송천 outbound 에 잘못 들어간 보인전력 fifo 2행) ─────────
-- main qty=2 sale → 보인전력 sale 2025-03-31 qty=2
-- spare qty=1 sale_spare → 보인전력 sale_spare 2025-03-31 qty=1
-- 날짜가 ±3 일 차이라 정규 strategy 로는 안 잡힘 — 운영 데이터 검토로 확정한 1건.
WITH manual_fix AS (
  SELECT '511bdf89-9e1f-4338-8d45-196db24266dd'::uuid AS match_id,
         '435d37fb-a82b-49c3-befa-b570bd8b0b64'::uuid AS old_ob,
         '7113c3e7-8fb0-47af-add9-5b73cd54ec96'::uuid AS new_ob,
         2 AS qty
  UNION ALL
  SELECT 'cecea8b9-3128-41d6-b5a8-4384c65d0ebc'::uuid,
         '435d37fb-a82b-49c3-befa-b570bd8b0b64'::uuid,
         '6d37051c-89b3-40fa-b678-aa1871d075c1'::uuid,
         1
),
manual_audit AS (
  INSERT INTO _fifo_empty_sibling_audit_20260512
    (match_id, old_outbound_id, new_outbound_id, strategy, allocated_qty)
  SELECT match_id, old_ob, new_ob, 'manual IS2503000200 (송천→보인전력 cross-customer)', qty
  FROM manual_fix
  -- 1) 두 outbound 가 둘 다 존재해야 함 (cron-deploy 재실행 안전성)
  WHERE EXISTS (SELECT 1 FROM outbounds WHERE outbound_id=manual_fix.new_ob)
    AND EXISTS (SELECT 1 FROM fifo_matches WHERE match_id=manual_fix.match_id AND outbound_id=manual_fix.old_ob)
  ON CONFLICT (match_id) DO NOTHING
  RETURNING match_id, new_outbound_id
)
UPDATE fifo_matches fm
SET outbound_id = a.new_outbound_id
FROM manual_audit a
WHERE fm.match_id = a.match_id;

DO $$
DECLARE
  v_audited int;
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_audited FROM _fifo_empty_sibling_audit_20260512
    WHERE strategy IN ('1:1 qty + norm_customer', 'manual IS2503000200 (송천→보인전력 cross-customer)');
  SELECT COUNT(*) INTO v_remaining FROM (
    SELECT o.outbound_id FROM outbounds o JOIN fifo_matches fm ON fm.outbound_id=o.outbound_id
    WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
    GROUP BY o.outbound_id, o.quantity HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
  ) t;
  RAISE NOTICE '[103] norm customer 매칭 + 수동 1건: %, 잔존 over-allocated: %', v_audited, v_remaining;
END $$;

COMMIT;
