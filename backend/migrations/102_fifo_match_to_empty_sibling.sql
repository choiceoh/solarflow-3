-- @auto-apply: yes
-- 102_fifo_match_to_empty_sibling.sql
--
-- 잔존 over-allocated outbound 8건 (098-101 이후) 의 orphan fifo 행을
-- '매칭이 비어있는 (fifo_qty=0) 형제 outbound' 으로 재할당.
--
-- 패턴: 사용자가 ERP 에서 같은 거래처/날짜/제품의 출고를 여러 라인으로 나눠
-- 입력했지만, fifo 임포터가 각 outbound 행에 매칭하지 않고 한 outbound 에
-- 모두 묶어버린 케이스. 형제 outbound 는 outbound 시스템에서 정상 등록됐지만
-- fifo 쪽에서는 빈 채로 남았다.
--
-- 매칭 키: orphan.allocated_qty = sibling.quantity
--          + 동일 product_id + 동일 outbound_date + 동일 company_id
--          + sibling 의 현재 fifo_qty = 0 (이미 매칭된 outbound 는 건드리지 않음)
--          + customer 일치 (fifo.customer_name LIKE outbound 의 sale.partner_name)
--
-- 추가로 'same erp_no + 다중 orphan 합 = 형제 qty' 케이스 (IS2603000531 등) 도
-- 일괄 처리한다 — 이 경우 형제 outbound 의 quantity 와 같은 IS no 내 orphan
-- 합계가 매칭되면 전부 형제로 이동.

BEGIN;

CREATE TABLE IF NOT EXISTS _fifo_empty_sibling_audit_20260512 (
  audit_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          uuid NOT NULL,
  old_outbound_id   uuid NOT NULL,
  new_outbound_id   uuid NOT NULL,
  strategy          text NOT NULL,
  allocated_qty     integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ───────── Strategy 1: 같은 ERP no + fifo=0 sibling + orphan 합 = sibling.qty ─────────
WITH bad AS (
  SELECT o.outbound_id, o.erp_outbound_no, o.outbound_date, o.product_id,
         o.company_id, o.quantity AS ob_qty
  FROM outbounds o JOIN fifo_matches fm ON fm.outbound_id=o.outbound_id
  WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
  GROUP BY o.outbound_id, o.quantity, o.erp_outbound_no, o.outbound_date, o.product_id, o.company_id
  HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
),
empty_sibling AS (
  SELECT b.outbound_id AS bad_ob, sib.outbound_id AS sib_ob, sib.quantity AS sib_qty
  FROM bad b
  JOIN outbounds sib
    ON sib.erp_outbound_no = b.erp_outbound_no
   AND sib.outbound_date   = b.outbound_date
   AND sib.product_id      = b.product_id
   AND sib.company_id      = b.company_id
   AND sib.outbound_id    <> b.outbound_id
   AND sib.status          = 'active'
   AND sib.usage_category  IN ('sale','sale_spare')
  WHERE (SELECT COALESCE(SUM(allocated_qty),0) FROM fifo_matches WHERE outbound_id=sib.outbound_id) = 0
),
-- orphan = bad 의 fifo 중 allocated_qty <> ob_qty 인 행
orphans AS (
  SELECT fm.match_id, fm.outbound_id AS bad_ob, fm.allocated_qty
  FROM bad b JOIN fifo_matches fm ON fm.outbound_id=b.outbound_id
  WHERE fm.allocated_qty <> b.ob_qty
),
strategy1 AS (
  -- orphan 합 = sib.qty 인 케이스만
  SELECT o.match_id, o.bad_ob, es.sib_ob, o.allocated_qty
  FROM orphans o
  JOIN empty_sibling es ON es.bad_ob = o.bad_ob
  WHERE es.sib_qty = (SELECT SUM(o2.allocated_qty) FROM orphans o2 WHERE o2.bad_ob = o.bad_ob)
),
s1_audit AS (
  INSERT INTO _fifo_empty_sibling_audit_20260512
    (match_id, old_outbound_id, new_outbound_id, strategy, allocated_qty)
  SELECT match_id, bad_ob, sib_ob, 'same_erp_sum_match', allocated_qty
  FROM strategy1
  RETURNING match_id, new_outbound_id
)
UPDATE fifo_matches fm
SET outbound_id = s.new_outbound_id
FROM s1_audit s
WHERE fm.match_id = s.match_id;

-- ───────── Strategy 2: 1:1 매칭 (orphan.qty = sibling.qty + customer 일치 + fifo=0) ─────────
WITH bad AS (
  SELECT o.outbound_id, o.outbound_date, o.product_id, o.company_id,
         o.quantity AS ob_qty
  FROM outbounds o JOIN fifo_matches fm ON fm.outbound_id=o.outbound_id
  WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
  GROUP BY o.outbound_id, o.quantity, o.outbound_date, o.product_id, o.company_id
  HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
),
orphans AS (
  SELECT fm.match_id, fm.outbound_id AS bad_ob, fm.allocated_qty,
         fm.customer_name AS fifo_cust,
         b.outbound_date, b.product_id, b.company_id
  FROM bad b JOIN fifo_matches fm ON fm.outbound_id=b.outbound_id
  WHERE fm.allocated_qty <> b.ob_qty
),
strategy2 AS (
  SELECT o.match_id, o.bad_ob, cand.outbound_id AS new_ob, o.allocated_qty,
         ROW_NUMBER() OVER (PARTITION BY o.match_id ORDER BY cand.outbound_id) AS rn
  FROM orphans o
  JOIN outbounds cand
    ON cand.product_id = o.product_id
   AND cand.outbound_date = o.outbound_date
   AND cand.quantity = o.allocated_qty
   AND cand.company_id = o.company_id
   AND cand.outbound_id <> o.bad_ob
   AND cand.status = 'active' AND cand.usage_category IN ('sale','sale_spare')
   AND (SELECT COALESCE(SUM(allocated_qty),0) FROM fifo_matches WHERE outbound_id=cand.outbound_id) = 0
   -- 같은 거래처 매칭: outbound 의 sale.partner_name LIKE fifo.customer_name (한쪽 prefix)
   AND EXISTS (
     SELECT 1 FROM sales s JOIN partners p ON p.partner_id=s.customer_id
     WHERE s.outbound_id = cand.outbound_id AND s.status='active'
       AND (p.partner_name LIKE COALESCE(o.fifo_cust,'') || '%' OR COALESCE(o.fifo_cust,'') LIKE p.partner_name || '%')
   )
  -- Strategy 1 으로 처리된 행은 제외 (이미 audit 에 들어가 있음)
  WHERE NOT EXISTS (SELECT 1 FROM _fifo_empty_sibling_audit_20260512 a WHERE a.match_id = o.match_id)
),
s2_audit AS (
  INSERT INTO _fifo_empty_sibling_audit_20260512
    (match_id, old_outbound_id, new_outbound_id, strategy, allocated_qty)
  SELECT match_id, bad_ob, new_ob, '1:1 qty + customer', allocated_qty
  FROM strategy2 WHERE rn = 1
  RETURNING match_id, new_outbound_id
)
UPDATE fifo_matches fm
SET outbound_id = s.new_outbound_id
FROM s2_audit s
WHERE fm.match_id = s.match_id;

DO $$
DECLARE
  v_s1 int;
  v_s2 int;
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_s1 FROM _fifo_empty_sibling_audit_20260512 WHERE strategy='same_erp_sum_match';
  SELECT COUNT(*) INTO v_s2 FROM _fifo_empty_sibling_audit_20260512 WHERE strategy='1:1 qty + customer';
  SELECT COUNT(*) INTO v_remaining FROM (
    SELECT o.outbound_id FROM outbounds o JOIN fifo_matches fm ON fm.outbound_id=o.outbound_id
    WHERE o.usage_category IN ('sale','sale_spare') AND o.status='active'
    GROUP BY o.outbound_id, o.quantity HAVING SUM(fm.allocated_qty) > o.quantity * 1.001
  ) t;
  RAISE NOTICE '[102] Strategy1 (same ERP no, sum match): %, Strategy2 (1:1 qty+customer): %, 잔존: %', v_s1, v_s2, v_remaining;
END $$;

COMMIT;
