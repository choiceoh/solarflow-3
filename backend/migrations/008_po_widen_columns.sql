-- 008_po_widen_columns.sql
-- 목적: purchase_orders.po_number 컬럼을 varchar(10) → varchar(20)으로 확장
-- 사유: PO 등록 시 PostgreSQL 22001 (string_data_right_truncation) 발생.
--       사용자 요구사항: PO번호 최대 20자.
-- 실행 방법: Supabase SQL Editor에 붙여넣기 후 Run.

ALTER TABLE purchase_orders
  ALTER COLUMN po_number TYPE varchar(20);

-- (선택) incoterms도 BAF/CAF 표기 등 확장 여지를 위해 늘리고 싶으면:
-- ALTER TABLE purchase_orders ALTER COLUMN incoterms TYPE varchar(40);

-- 검증:
-- SELECT column_name, data_type, character_maximum_length
--   FROM information_schema.columns
--  WHERE table_name = 'purchase_orders' AND column_name IN ('po_number','incoterms');
