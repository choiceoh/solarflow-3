-- @auto-apply: yes
-- 073_integrity_checks.sql
-- 운영 정합성 cron 의 baseline + 결과 + 알림 이력 (D-064 PR 37).
--
-- 비유: "체크리스트의 정답지" — 매 검증마다 기대값(baseline) 과 실제값을 비교해
-- 변화가 tolerance 초과면 알림. 같은 알림이 반복되지 않도록 cooldown.

CREATE TABLE IF NOT EXISTS integrity_checks (
  check_id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL UNIQUE,
  category           text        NOT NULL,            -- 'count'|'null_ratio'|'orphan'|'formula'|'balance'
  severity           text        NOT NULL CHECK (severity IN ('high', 'med', 'low')),
  baseline_value     numeric,                          -- 정상 기대값 (또는 비율)
  tolerance          numeric     NOT NULL DEFAULT 0,   -- 절대값 또는 비율 (severity 별 의미 다름)
  tolerance_type     text        NOT NULL DEFAULT 'abs' CHECK (tolerance_type IN ('abs', 'pct')),
  cooldown_minutes   integer     NOT NULL DEFAULT 60,
  description        text,
  enabled            boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrity_check_runs (
  run_id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id           uuid        NOT NULL REFERENCES integrity_checks(check_id) ON DELETE CASCADE,
  ran_at             timestamptz NOT NULL DEFAULT now(),
  actual_value       numeric,
  passed             boolean     NOT NULL,
  alerted            boolean     NOT NULL DEFAULT false,
  alert_reason       text,
  duration_ms        integer
);

CREATE INDEX IF NOT EXISTS integrity_check_runs_recent_idx
  ON integrity_check_runs (check_id, ran_at DESC);

CREATE INDEX IF NOT EXISTS integrity_check_runs_alerted_idx
  ON integrity_check_runs (alerted, ran_at DESC) WHERE alerted;

COMMENT ON TABLE integrity_checks IS
  '운영 정합성 cron 의 검증 정의 (D-064 PR 37). baseline + tolerance + cooldown.';
COMMENT ON TABLE integrity_check_runs IS
  '검증 실행 이력. alerted=true 인 행이 알림 발송된 회귀 인스턴스.';

ALTER TABLE integrity_checks DISABLE ROW LEVEL SECURITY;
ALTER TABLE integrity_check_runs DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE integrity_checks, integrity_check_runs TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON TABLE integrity_checks, integrity_check_runs TO authenticated;
  END IF;
END $$;

-- 초기 baseline 등록 (현재 정상 상태 기준)
INSERT INTO integrity_checks (name, category, severity, baseline_value, tolerance, tolerance_type, cooldown_minutes, description) VALUES
  -- HIGH: 데이터 손실 감지
  ('count_sales',                     'count',      'high', 1976,  0.05, 'pct',  30, 'sales 행 수 ±5%'),
  ('count_outbounds',                 'count',      'high', 2229,  0.05, 'pct',  30, 'outbounds 행 수 ±5%'),
  ('count_inbounds',                  'count',      'high', 117,   0.05, 'pct',  30, 'inbounds 행 수 ±5%'),
  ('count_fifo_matches',              'count',      'high', 3332,  0.05, 'pct',  30, 'fifo_matches 행 수 ±5%'),
  ('count_declarations',              'count',      'high', 100,   0.05, 'pct',  30, 'import_declarations 행 수 ±5%'),
  ('count_products_active',           'count',      'high', 104,   0.10, 'pct',  60, '활성 products ±10%'),
  ('null_ratio_sales_tax_invoice',    'null_ratio', 'high', 0,     0.05, 'abs',  30, 'sales.tax_invoice_date NULL 비율 +5% 이상이면 알림'),
  ('null_ratio_sales_outbound_id',    'null_ratio', 'high', 0,     0.01, 'abs',  30, 'sales.outbound_id NULL 비율 +1% 이상이면 알림'),
  -- MED: 산식/orphan
  ('orphan_fifo_outbound',            'orphan',     'med',  0,     0,    'abs',  60, 'fifo_matches.outbound_id orphan'),
  ('orphan_fifo_inbound',             'orphan',     'med',  0,     0,    'abs',  60, 'fifo_matches.inbound_id orphan'),
  ('orphan_sales_outbound',           'orphan',     'med',  0,     0,    'abs',  60, 'sales.outbound_id orphan'),
  ('orphan_sales_customer',           'orphan',     'med',  0,     0,    'abs',  60, 'sales.customer_id orphan'),
  ('orphan_outbounds_product',        'orphan',     'med',  0,     0,    'abs',  60, 'outbounds.product_id orphan'),
  ('formula_sales_supply_vat_total',  'formula',    'med',  0,     0,    'abs',  60, 'sales: supply+vat≠total (5원 초과)'),
  ('formula_fifo_cost_profit_sales',  'formula',    'med',  0,     0,    'abs',  60, 'fifo: cost+profit≠sales (1%)'),
  ('balance_negative',                'balance',    'med',  0,     0,    'abs',  60, 'v_product_qty_balance 음수 행'),
  -- LOW: ERP 본질 잔존 (변화만 알림)
  ('erp_residual_contract_krw',       'count',      'low',  18,    2,    'abs',  1440, 'contract_total_krw mismatch 18 ± 2'),
  ('erp_residual_decl_after_arrival', 'count',      'low',  43,    5,    'abs',  1440, 'declaration_date > arrival_date 43 ± 5'),
  ('erp_residual_arrival_after_release','count',    'low',  22,    5,    'abs',  1440, 'arrival_date > release_date 22 ± 5')
ON CONFLICT (name) DO UPDATE SET
  baseline_value = EXCLUDED.baseline_value,
  tolerance = EXCLUDED.tolerance,
  tolerance_type = EXCLUDED.tolerance_type,
  description = EXCLUDED.description,
  updated_at = now();
