-- 114: tt_remittances_with_company view — TT 의 company_id 필터를 server-side eq 로
--      바꾸기 위한 view. 094 / 110 / 111 / 112 / 113 동일 패턴.
--
-- 배경:
--   tt_remittances 가 직접 company_id 컬럼이 없어 핸들러가 purchase_orders 에서
--   해당 회사의 po_id 리스트를 끌어와 .In("po_id", poIDs) 로 합친다. 대형
--   테넌트에서 PO 가 수백 개면 URL 폭주 (PR #806 sales 와 동일 메커니즘).
--
-- 해법:
--   purchase_orders.company_id 를 view 로 노출. 핸들러는 eq("po_company_id", X).
--   PostgREST embedded resource (`purchase_orders(po_number, manufacturers(name_kr))`)
--   는 view 의 po_id 컬럼이 그대로 보존돼 정상 동작.

CREATE OR REPLACE VIEW tt_remittances_with_company AS
SELECT
  tt.*,
  po.company_id AS po_company_id
FROM tt_remittances tt
LEFT JOIN purchase_orders po ON po.po_id = tt.po_id;

GRANT SELECT ON tt_remittances_with_company TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
