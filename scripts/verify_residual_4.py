"""잔존 이슈 4건 심층 분석 — declarations 환율 / USD inbound / 시점 2건."""
import os, psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
c = psycopg2.connect(DB_URL).cursor()

print("="*70)
print("[5] declarations: contract_total_krw ≠ usd × rate — 18건 패턴")
print("="*70)
c.execute("""
SELECT declaration_number, contract_total_usd, exchange_rate, contract_total_krw,
  contract_total_usd * exchange_rate AS expected_krw,
  round((contract_total_krw - contract_total_usd * exchange_rate)::numeric / contract_total_krw * 100, 2) AS pct
FROM import_declarations
WHERE contract_total_krw > 0 AND contract_total_usd > 0 AND exchange_rate > 0
  AND abs(contract_total_krw - contract_total_usd * exchange_rate) / GREATEST(contract_total_krw, 1) > 0.05
ORDER BY abs(contract_total_krw - contract_total_usd * exchange_rate) / contract_total_krw DESC
LIMIT 20
""")
for r in c.fetchall(): print(f"  {r}")

print()
print("="*70)
print("[8] USD inbounds 인데 단가가 KRW 의심 — 20건")
print("="*70)
c.execute("""
SELECT inbound_date, erp_inbound_no, currency, quantity, unit_price, unit_price_wp,
  source_payload->>'erp_unit_price' AS erp_unit,
  source_payload->>'erp_fx_unit' AS erp_fx_unit,
  source_payload->>'erp_currency' AS erp_currency
FROM inbounds
WHERE currency='USD' AND unit_price > 1000 AND unit_price_wp > 100
ORDER BY inbound_date LIMIT 10
""")
for r in c.fetchall(): print(f"  {r}")
print()
c.execute("""
SELECT count(*),
  count(*) FILTER (WHERE (source_payload->>'erp_fx_unit')::numeric > 0
                    AND (source_payload->>'erp_unit_price')::numeric != (source_payload->>'erp_fx_unit')::numeric)
FROM inbounds WHERE currency='USD' AND unit_price > 1000
""")
print(f"  USD inbounds w/ KRW unit, w/ erp_unit != erp_fx_unit: {c.fetchone()}")

print()
print("="*70)
print("[6] declaration_date > arrival_date — 43건 패턴")
print("="*70)
c.execute("""
SELECT min(declaration_date - arrival_date), max(declaration_date - arrival_date),
  avg(declaration_date - arrival_date), count(*)
FROM import_declarations WHERE declaration_date > arrival_date
""")
print(f"  diff days: min/max/avg/n = {c.fetchone()}")
c.execute("""
SELECT declaration_number, declaration_date, arrival_date, release_date, port
FROM import_declarations WHERE declaration_date > arrival_date
ORDER BY declaration_date - arrival_date DESC LIMIT 5
""")
print("  top 5 차이큰 행:")
for r in c.fetchall(): print(f"    {r}")

print()
print("="*70)
print("[7] arrival_date > release_date — 22건 패턴")
print("="*70)
c.execute("""
SELECT min(arrival_date - release_date), max(arrival_date - release_date),
  avg(arrival_date - release_date), count(*)
FROM import_declarations WHERE arrival_date > release_date
""")
print(f"  diff days: min/max/avg/n = {c.fetchone()}")
c.execute("""
SELECT declaration_number, declaration_date, arrival_date, release_date
FROM import_declarations WHERE arrival_date > release_date
ORDER BY arrival_date - release_date DESC LIMIT 5
""")
print("  top 5:")
for r in c.fetchall(): print(f"    {r}")

print()
print("="*70)
print("[3] declarations paid+free ≠ qty — 2건")
print("="*70)
c.execute("""
SELECT declaration_number, quantity, paid_qty, free_qty, paid_qty+free_qty AS sum
FROM import_declarations
WHERE paid_qty IS NOT NULL AND free_qty IS NOT NULL AND quantity IS NOT NULL
  AND paid_qty + free_qty != quantity
""")
for r in c.fetchall(): print(f"  {r}")
