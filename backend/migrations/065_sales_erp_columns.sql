-- @auto-apply: yes
-- 065_sales_erp_columns.sql
-- ERP 매출 시트(2,417행) backfill 을 위한 sales 식별 컬럼 + 원자료 보존(D-064 PR 22).
-- 사용자 지시: 안전장치보다 데이터 살림. ERP 마감번호(SC...) 와 line item 단위 식별.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS erp_sales_no   text,
  ADD COLUMN IF NOT EXISTS erp_line_no    integer,
  ADD COLUMN IF NOT EXISTS currency       text,
  ADD COLUMN IF NOT EXISTS source_payload jsonb;

COMMENT ON COLUMN sales.erp_sales_no IS
  'ERP 매출 마감번호 (예: SC2501000032). PR 22 backfill 식별 키.';
COMMENT ON COLUMN sales.erp_line_no IS
  'ERP 매출 마감 line item 순번. 같은 SC 번호의 분할 라인 구분.';
COMMENT ON COLUMN sales.currency IS
  '환종 (KRW/USD/...). ERP 자료에서 동기화. NULL 이면 KRW 가정.';
COMMENT ON COLUMN sales.source_payload IS
  'ERP 매출 원자료 보존(D-064). 단가/외화/관리구분/프로젝트/담당자 등 zero-loss.';

-- partial UNIQUE — ERP 매출 식별 키 중복 방지 (PR 19/20/21 패턴)
CREATE UNIQUE INDEX IF NOT EXISTS sales_erp_no_line_uidx
  ON sales (erp_sales_no, erp_line_no)
  WHERE erp_sales_no IS NOT NULL;
