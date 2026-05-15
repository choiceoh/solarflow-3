-- M133: PL/BL/CI PDF 텍스트 추출 결과 저장 테이블
-- @auto-apply: yes
-- document_files 의 PDF 본문에서 fitz/regex 로 뽑은 정형 데이터를 보관한다.
-- raw_text 도 같이 두어 추후 파서 개선 시 재처리 가능.

CREATE TABLE IF NOT EXISTS pdf_extractions (
  extraction_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id        uuid        NOT NULL REFERENCES document_files(file_id) ON DELETE CASCADE,
  bl_id          uuid        REFERENCES bl_shipments(bl_id) ON DELETE SET NULL,
  file_type      text        NOT NULL,
  extractor      text        NOT NULL,
  parse_status   text        NOT NULL DEFAULT 'partial',
  page_count     integer     NOT NULL DEFAULT 0,
  raw_text       text,
  parsed         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  extracted_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdf_extractions_status_check
    CHECK (parse_status IN ('success', 'partial', 'failed')),
  CONSTRAINT pdf_extractions_file_id_unique UNIQUE (file_id)
);

CREATE INDEX IF NOT EXISTS idx_pdf_extractions_bl_id
  ON pdf_extractions(bl_id) WHERE bl_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pdf_extractions_file_type
  ON pdf_extractions(file_type);

CREATE INDEX IF NOT EXISTS idx_pdf_extractions_parsed_invoice_no
  ON pdf_extractions((parsed ->> 'invoice_no')) WHERE parsed ? 'invoice_no';

CREATE INDEX IF NOT EXISTS idx_pdf_extractions_parsed_lc_no
  ON pdf_extractions((parsed ->> 'lc_no')) WHERE parsed ? 'lc_no';

COMMENT ON TABLE pdf_extractions IS 'document_files PDF 본문에서 추출한 정형 데이터 (BL no, 수량, 가격, vessel 등)';
COMMENT ON COLUMN pdf_extractions.extractor IS '파서 식별자, 예: fitz-regex-jinko-v1';
COMMENT ON COLUMN pdf_extractions.parse_status IS 'success=핵심필드 모두 / partial=일부만 / failed=추출 실패';
COMMENT ON COLUMN pdf_extractions.raw_text IS 'fitz 로 추출한 페이지별 텍스트 합본 (디버깅 + 재처리용)';
COMMENT ON COLUMN pdf_extractions.parsed IS '구조화된 추출 결과 (invoice_no, lc_no, pa_no, qty_pc, total_watt, unit_price_usd_wp, total_usd, vessel, port_of_loading, port_of_discharge, etd, eta, net_weight_kg, gross_weight_kg, pallets, cbm, model, trade_term, hs_code, container_seals[])';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pdf_extractions TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pdf_extractions TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pdf_extractions TO service_role;
  END IF;
END $$;
