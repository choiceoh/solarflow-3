-- 116_backfill_cost_details.sql
-- cost_details 백필 — import_declarations 기반 landed cost 정본 생성
--
-- 배경:
--   cost_details 가 0 건. landed cost 정본 (CIF + 관세 + 부가세 + 부대비용 →
--   landed_total_krw) 을 보유해야 매출원가 분석이 정확해지는데 비어 있어
--   엔진 margin-analysis 가 import_declarations.cost_unit_price_ea (= cif/qty)
--   로만 계산되고 있음. 어제 본 매출원가 17억 갭의 분석 기반이 부재한 상태.
--
-- 변경:
--   import_declarations 의 각 행을 cost_details 한 행으로 INSERT.
--   - 직접 매핑: declaration_id, product_id, quantity, capacity_kw, exchange_rate
--   - CIF 계열: cif_total_krw = cif_krw, cif_wp_krw = cost_unit_price_wp,
--               cif_total_usd = contract_total_usd, cif_unit_usd = contract_unit_price_usd_wp
--   - 관세: tariff_rate = customs_rate, tariff_amount = customs_amount
--   - 부가세: vat_amount = vat_amount
--   - FOB: 면장에 FOB 분리값이 없어 NULL (Incoterms CIF 기준만 채워짐)
--   - customs_fee / incidental_cost: NULL (외부 자료 필요, 별도 PR)
--   - landed_total_krw = cif_krw + COALESCE(customs_amount, 0)
--     (incidental 없으면 일단 CIF+관세만으로 계산. 부대비용 들어올 때 보강)
--   - landed_wp_krw = landed_total_krw / (quantity * spec_wp / 1000)
--
-- 영향:
--   - 탑솔라 101 + 다른 회사 면장 → 약 100 ~ 150 행 INSERT 예상
--   - 매출원가 분석 엔진이 cost_details.landed_total_krw 를 활용하도록
--     별도 PR 로 후속 변경. 본 PR 은 데이터만 준비.
--
-- 멱등성:
--   PRIMARY KEY cost_id 는 gen_random_uuid() 라 자동.
--   NOT EXISTS (declaration_id, product_id) 가드로 재실행 시 SKIP.

BEGIN;

INSERT INTO cost_details (
  declaration_id,
  product_id,
  quantity,
  capacity_kw,
  fob_unit_usd,
  fob_total_usd,
  fob_wp_krw,
  exchange_rate,
  cif_total_krw,
  cif_unit_usd,
  cif_total_usd,
  cif_wp_krw,
  tariff_rate,
  tariff_amount,
  vat_amount,
  customs_fee,
  incidental_cost,
  landed_total_krw,
  landed_wp_krw,
  memo
)
SELECT
  id.declaration_id,
  id.product_id,
  id.quantity,
  id.capacity_kw,
  NULL                                                AS fob_unit_usd,
  NULL                                                AS fob_total_usd,
  NULL                                                AS fob_wp_krw,
  COALESCE(id.exchange_rate, 1)                       AS exchange_rate,
  id.cif_krw                                          AS cif_total_krw,
  id.contract_unit_price_usd_wp                       AS cif_unit_usd,
  id.contract_total_usd                               AS cif_total_usd,
  COALESCE(id.cost_unit_price_wp,
           id.cif_krw / NULLIF(id.quantity * COALESCE(p.spec_wp, 0), 0)
  )                                                   AS cif_wp_krw,
  id.customs_rate,
  id.customs_amount,
  id.vat_amount,
  NULL                                                AS customs_fee,
  NULL                                                AS incidental_cost,
  id.cif_krw + COALESCE(id.customs_amount, 0)         AS landed_total_krw,
  (id.cif_krw + COALESCE(id.customs_amount, 0))
    / NULLIF(id.quantity * COALESCE(p.spec_wp, 0), 0) AS landed_wp_krw,
  'backfill from import_declarations (M116)'          AS memo
FROM import_declarations id
JOIN products p ON p.product_id = id.product_id
WHERE id.product_id IS NOT NULL
  AND id.quantity   IS NOT NULL
  AND id.quantity > 0
  AND id.cif_krw    IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cost_details cd
    WHERE cd.declaration_id = id.declaration_id
      AND cd.product_id     = id.product_id
  );

-- 검증
SELECT 'cost_details_rows' AS metric, COUNT(*) AS value FROM cost_details;
SELECT 'cost_details_with_landed' AS metric, COUNT(*) AS value
FROM cost_details WHERE landed_total_krw IS NOT NULL;
SELECT
  '회사별 landed total 합계' AS metric,
  c.company_code,
  to_char(SUM(cd.landed_total_krw)/1000.0,'FM999,999,999,999') AS landed_천원
FROM cost_details cd
JOIN import_declarations id ON id.declaration_id = cd.declaration_id
JOIN companies c ON c.company_id = id.company_id
GROUP BY c.company_code
ORDER BY c.company_code;

COMMIT;
