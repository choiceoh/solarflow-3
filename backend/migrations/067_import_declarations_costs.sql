-- @auto-apply: yes
-- 067_import_declarations_costs.sql
-- ERP 수입면장 DB-3 시트(116행, 50컬럼) 의 통관 자료 + 수입원가 산출 정보 보존 (D-064 PR 24).
-- 사용자 지시: 안전장치보다 데이터 살림. 모든 컬럼 누락 없이.

ALTER TABLE import_declarations
  -- 통관/계약 식별
  ADD COLUMN IF NOT EXISTS lc_no               text,
  ADD COLUMN IF NOT EXISTS invoice_no          text,
  ADD COLUMN IF NOT EXISTS bl_number           text,
  ADD COLUMN IF NOT EXISTS supplier_name_en    text,
  ADD COLUMN IF NOT EXISTS supplier_name_kr    text,
  ADD COLUMN IF NOT EXISTS po_number           text,
  -- 환율/금액
  ADD COLUMN IF NOT EXISTS exchange_rate       numeric,
  ADD COLUMN IF NOT EXISTS contract_unit_price_usd_wp numeric,
  ADD COLUMN IF NOT EXISTS contract_total_usd  numeric,
  ADD COLUMN IF NOT EXISTS contract_total_krw  numeric,
  ADD COLUMN IF NOT EXISTS cif_krw             numeric,
  ADD COLUMN IF NOT EXISTS incoterms           text,
  -- 관세/부가세
  ADD COLUMN IF NOT EXISTS customs_rate        numeric,
  ADD COLUMN IF NOT EXISTS customs_amount      numeric,
  ADD COLUMN IF NOT EXISTS vat_amount          numeric,
  -- 유상/무상 분리
  ADD COLUMN IF NOT EXISTS paid_qty            integer,
  ADD COLUMN IF NOT EXISTS free_qty            integer,
  ADD COLUMN IF NOT EXISTS free_ratio          numeric,
  ADD COLUMN IF NOT EXISTS paid_cif_krw        numeric,
  ADD COLUMN IF NOT EXISTS free_cif_krw        numeric,
  -- 원가단가
  ADD COLUMN IF NOT EXISTS cost_unit_price_wp  numeric,
  ADD COLUMN IF NOT EXISTS cost_unit_price_ea  numeric,
  -- 모델·수량
  ADD COLUMN IF NOT EXISTS product_id          uuid REFERENCES products(product_id),
  ADD COLUMN IF NOT EXISTS quantity            integer,
  ADD COLUMN IF NOT EXISTS capacity_kw         numeric,
  -- ERP 입고번호 (RV...) 와 면장 란번호 — DB-3 와 입고/FIFO 시트 cross-key
  ADD COLUMN IF NOT EXISTS erp_inbound_no      text,
  ADD COLUMN IF NOT EXISTS declaration_line_no text,
  -- D-064: 50개 컬럼 zero-loss 보존
  ADD COLUMN IF NOT EXISTS source_payload      jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS import_declarations_decl_no_uidx
  ON import_declarations (declaration_number);

CREATE INDEX IF NOT EXISTS import_declarations_bl_number_idx
  ON import_declarations (bl_number);
CREATE INDEX IF NOT EXISTS import_declarations_erp_in_no_idx
  ON import_declarations (erp_inbound_no);

COMMENT ON COLUMN import_declarations.cost_unit_price_wp IS
  '★원가Wp단가(원/Wp) — DB-3 의 FIFO 원가 산출 결과. 후속 PR 26 에서 fifo_lots 와 매칭.';
COMMENT ON COLUMN import_declarations.source_payload IS
  'ERP 수입면장 DB-3 50컬럼 zero-loss 보존(D-064). 원본 메모/문제점 등 포함.';
