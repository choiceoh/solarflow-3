"""잔존 미세 정합성 정정 — USD inbound 20건 currency / sales 1건 supply.

[8] inbounds 20건: currency='USD' 표기인데 단가가 KRW 단위 (예 79,854원/EA).
  → currency='KRW' 정정. erp_fx_unit (USD/Wp) 은 source_payload 에 이미 보존.

[A2] sales SC2504000094 line 1: unit_price_wp×spec×qty=2,354,250 vs supply=2,484,250.
  source_payload 결손 (erp_supply NULL) — backfill 누락 행. 정확한 ERP 값 모르니
  unit_price_ea × quantity 로 재계산 (= 2,354,250).
"""
import os, psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
c = psycopg2.connect(DB_URL)
c.autocommit = False
cur = c.cursor()

print("=" * 60)
print("[8] inbounds USD → KRW currency 정정")
print("=" * 60)
# 사전: 어떤 행
cur.execute("""
SELECT erp_inbound_no, unit_price, source_payload->>'erp_fx_unit' AS fx_unit
FROM inbounds
WHERE currency = 'USD' AND unit_price > 1000 AND unit_price_wp > 100
""")
print(f"  대상: {cur.rowcount} 행 (sample 첫 3)")
rows = cur.fetchall()
for r in rows[:3]:
    print(f"    {r}")

# erp_fx_unit 을 source_payload 에 이미 들어있으니 그대로 두고, currency 만 KRW 로
cur.execute("""
UPDATE inbounds
SET currency = 'KRW',
    source_payload = COALESCE(source_payload, '{}'::jsonb)
                     || jsonb_build_object('currency_corrected_from', 'USD',
                                           'currency_corrected_reason', 'unit_price_wp_in_KRW'),
    updated_at = now()
WHERE currency = 'USD' AND unit_price > 1000 AND unit_price_wp > 100
""")
print(f"  업데이트: {cur.rowcount} 행")
c.commit()

# 사후 검증
cur.execute("""
SELECT count(*) FROM inbounds WHERE currency = 'USD' AND unit_price > 1000 AND unit_price_wp > 100
""")
print(f"  잔존: {cur.fetchone()[0]}")

cur.execute("""
SELECT currency, count(*) FROM inbounds GROUP BY currency
""")
print("  currency 분포:")
for r in cur.fetchall():
    print(f"    {r}")

print()
print("=" * 60)
print("[A2] sales SC2504000094 line 1 supply_amount 정정")
print("=" * 60)

# 사전
cur.execute("""
SELECT s.sale_id, s.erp_sales_no, s.erp_line_no, s.quantity, s.unit_price_wp, s.unit_price_ea,
  s.supply_amount, s.vat_amount, s.total_amount, p.spec_wp,
  s.unit_price_ea * s.quantity AS expected_supply
FROM sales s JOIN outbounds o ON s.outbound_id=o.outbound_id
JOIN products p ON o.product_id=p.product_id
WHERE s.unit_price_wp > 0 AND s.supply_amount > 0 AND s.quantity > 0 AND p.spec_wp > 0
  AND abs(s.unit_price_wp * p.spec_wp * s.quantity - s.supply_amount)
      / GREATEST(s.supply_amount, 1) > 0.01
""")
sale = cur.fetchone()
print(f"  대상 행: {sale}")

if sale:
    sale_id = sale[0]
    from decimal import Decimal
    expected_supply = Decimal(sale[10])
    expected_vat = (expected_supply * Decimal('0.1')).quantize(Decimal('1'))
    expected_total = expected_supply + expected_vat
    cur.execute("""
    UPDATE sales SET
      supply_amount = %s,
      vat_amount = %s,
      total_amount = %s,
      source_payload = COALESCE(source_payload, '{}'::jsonb)
                       || jsonb_build_object(
                         'supply_corrected_from', %s,
                         'supply_corrected_reason', 'unit_ea×qty 재계산 (erp_supply 결손)'
                       ),
      updated_at = now()
    WHERE sale_id = %s
    """, (expected_supply, expected_vat, expected_total, str(sale[6]), sale_id))
    print(f"  업데이트: supply {sale[6]} → {expected_supply}, vat={expected_vat}, total={expected_total}")
    c.commit()

# 최종 검증
print()
print("=" * 60)
print("=== 최종 잔존 검증 ===")
print("=" * 60)

cur.execute("""SELECT count(*) FROM inbounds WHERE currency='USD' AND unit_price > 1000 AND unit_price_wp > 100""")
print(f"  [8] USD inbound w/KRW 단가: {cur.fetchone()[0]}")

cur.execute("""SELECT count(*) FROM sales s JOIN outbounds o ON s.outbound_id=o.outbound_id
JOIN products p ON o.product_id=p.product_id
WHERE s.unit_price_wp > 0 AND s.supply_amount > 0 AND s.quantity > 0 AND p.spec_wp > 0
  AND abs(s.unit_price_wp * p.spec_wp * s.quantity - s.supply_amount)
      / GREATEST(s.supply_amount, 1) > 0.01""")
print(f"  [A2] sales 산식 1% 초과: {cur.fetchone()[0]}")
