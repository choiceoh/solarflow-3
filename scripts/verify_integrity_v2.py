"""전체 정합성 광역 검증 v2 — 모든 테이블 / FK / 산식 / 시점 / enum / 외화 / 누계."""
import os, psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
c = psycopg2.connect(DB_URL).cursor()

issues = []


def check(label, sql, expected=0):
    c.execute(sql)
    r = c.fetchone()
    n = r[0] if r else 0
    status = "✅" if n == expected else "❌"
    print(f"  {status} {label}: {n}")
    if n != expected:
        issues.append((label, n))
    return n


def hdr(t):
    print(f"\n{'='*70}\n{t}\n{'='*70}")


# ============================================================
hdr("[1] FK orphan 광역")
# ============================================================
check("outbounds.product_id orphan",
      "SELECT count(*) FROM outbounds o WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id=o.product_id)")
check("outbounds.company_id orphan",
      "SELECT count(*) FROM outbounds o WHERE NOT EXISTS(SELECT 1 FROM companies c WHERE c.company_id=o.company_id)")
check("outbounds.warehouse_id orphan",
      "SELECT count(*) FROM outbounds o WHERE warehouse_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM warehouses w WHERE w.warehouse_id=o.warehouse_id)")
check("outbounds.order_id orphan",
      "SELECT count(*) FROM outbounds o WHERE order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM orders ord WHERE ord.order_id=o.order_id)")
check("sales.customer_id orphan",
      "SELECT count(*) FROM sales s WHERE NOT EXISTS(SELECT 1 FROM partners p WHERE p.partner_id=s.customer_id)")
check("sales.outbound_id orphan",
      "SELECT count(*) FROM sales s WHERE outbound_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM outbounds o WHERE o.outbound_id=s.outbound_id)")
check("inbounds.product_id orphan",
      "SELECT count(*) FROM inbounds i WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id=i.product_id)")
check("inbounds.supplier_partner_id orphan",
      "SELECT count(*) FROM inbounds i WHERE supplier_partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM partners p WHERE p.partner_id=i.supplier_partner_id)")
check("fifo_matches.product_id orphan",
      "SELECT count(*) FROM fifo_matches WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id=fifo_matches.product_id)")
check("import_declarations.bl_id orphan",
      "SELECT count(*) FROM import_declarations d WHERE NOT EXISTS(SELECT 1 FROM bl_shipments b WHERE b.bl_id=d.bl_id)")
check("import_declarations.product_id orphan",
      "SELECT count(*) FROM import_declarations d WHERE product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id=d.product_id)")
check("orders.customer_id orphan",
      "SELECT count(*) FROM orders o WHERE NOT EXISTS(SELECT 1 FROM partners p WHERE p.partner_id=o.customer_id)")
check("orders.product_id orphan",
      "SELECT count(*) FROM orders o WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id=o.product_id)")
check("inventory_movements.product_id orphan",
      "SELECT count(*) FROM inventory_movements m WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id=m.product_id)")
check("inventory_snapshots.product_id orphan",
      "SELECT count(*) FROM inventory_snapshots s WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id=s.product_id)")
check("bl_shipments.manufacturer_id orphan",
      "SELECT count(*) FROM bl_shipments b WHERE manufacturer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM manufacturers m WHERE m.manufacturer_id=b.manufacturer_id)")

# ============================================================
hdr("[2] 산식 정합성")
# ============================================================
check("sales: supply+vat=total (오차 5원)",
      """SELECT count(*) FROM sales WHERE supply_amount IS NOT NULL AND vat_amount IS NOT NULL
         AND total_amount IS NOT NULL AND abs(supply_amount + vat_amount - total_amount) > 5""")
check("sales: unit_price_wp×spec×qty ≈ supply (1%)",
      """SELECT count(*) FROM sales s JOIN outbounds o ON s.outbound_id=o.outbound_id
         JOIN products p ON o.product_id=p.product_id
         WHERE s.unit_price_wp > 0 AND s.supply_amount > 0 AND s.quantity > 0 AND p.spec_wp > 0
         AND abs(s.unit_price_wp * p.spec_wp * s.quantity - s.supply_amount)
             / GREATEST(s.supply_amount, 1) > 0.01""")
check("inbounds: unit_price×qty ≈ supply_amount (공급가, 1%)",
      """SELECT count(*) FROM inbounds WHERE unit_price > 0 AND supply_amount > 0 AND quantity > 0
         AND abs(unit_price * quantity - supply_amount) / GREATEST(supply_amount, 1) > 0.01""")
check("inbounds: supply+vat=total (5원)",
      """SELECT count(*) FROM inbounds WHERE supply_amount IS NOT NULL AND vat_amount IS NOT NULL
         AND total_amount IS NOT NULL AND abs(supply_amount + vat_amount - total_amount) > 5""")
check("fifo_matches: cost+profit=sales (1%)",
      """SELECT count(*) FROM fifo_matches WHERE cost_amount IS NOT NULL AND profit_amount IS NOT NULL
         AND sales_amount IS NOT NULL AND sales_amount > 0
         AND abs(cost_amount + profit_amount - sales_amount) / GREATEST(sales_amount, 1) > 0.01""")
check("fifo_matches: ea_unit_cost × allocated_qty ≈ cost_amount (1%)",
      """SELECT count(*) FROM fifo_matches WHERE ea_unit_cost > 0 AND allocated_qty > 0 AND cost_amount > 0
         AND abs(ea_unit_cost * allocated_qty - cost_amount) / GREATEST(cost_amount, 1) > 0.01""")
check("fifo_matches: sales_unit × allocated ≈ sales_amount (1%)",
      """SELECT count(*) FROM fifo_matches WHERE sales_unit_price_ea > 0 AND allocated_qty > 0
         AND sales_amount > 0
         AND abs(sales_unit_price_ea * allocated_qty - sales_amount) / GREATEST(sales_amount, 1) > 0.01""")
check("outbounds: capacity_kw ≈ qty × spec_wp / 1000 (0.5%)",
      """SELECT count(*) FROM outbounds o JOIN products p ON o.product_id=p.product_id
         WHERE o.capacity_kw > 0 AND o.quantity > 0 AND p.spec_wp > 0
         AND abs(o.capacity_kw - o.quantity * p.spec_wp / 1000.0) / o.capacity_kw > 0.005""")
check("inbounds: capacity_kw ≈ qty × spec_wp / 1000",
      """SELECT count(*) FROM inbounds i JOIN products p ON i.product_id=p.product_id
         WHERE i.capacity_kw > 0 AND i.quantity > 0 AND p.spec_wp > 0
         AND abs(i.capacity_kw - i.quantity * p.spec_wp / 1000.0) / i.capacity_kw > 0.005""")
check("declarations: paid_qty + free_qty = quantity",
      """SELECT count(*) FROM import_declarations
         WHERE paid_qty IS NOT NULL AND free_qty IS NOT NULL AND quantity IS NOT NULL
         AND paid_qty + free_qty != quantity""")
check("declarations: cif_krw = paid_cif_krw + free_cif_krw (5%)",
      """SELECT count(*) FROM import_declarations
         WHERE cif_krw > 0 AND paid_cif_krw IS NOT NULL AND free_cif_krw IS NOT NULL
         AND abs(cif_krw - (paid_cif_krw + free_cif_krw)) / GREATEST(cif_krw, 1) > 0.05""")
check("declarations: cost_unit_price_wp × spec × paid_qty ≈ paid_cif_krw (5%)",
      """SELECT count(*) FROM import_declarations d JOIN products p ON d.product_id=p.product_id
         WHERE d.cost_unit_price_wp > 0 AND d.paid_cif_krw > 0 AND d.paid_qty > 0 AND p.spec_wp > 0
         AND abs(d.cost_unit_price_wp * p.spec_wp * d.paid_qty - d.paid_cif_krw)
             / GREATEST(d.paid_cif_krw, 1) > 0.05""")
check("declarations: contract_total_krw ≈ contract_total_usd × exchange_rate (5%)",
      """SELECT count(*) FROM import_declarations
         WHERE contract_total_krw > 0 AND contract_total_usd > 0 AND exchange_rate > 0
         AND abs(contract_total_krw - contract_total_usd * exchange_rate)
             / GREATEST(contract_total_krw, 1) > 0.05""")

# ============================================================
hdr("[3] 시점 일관성")
# ============================================================
check("created_at > updated_at (sales)",
      "SELECT count(*) FROM sales WHERE created_at > updated_at")
check("created_at > updated_at (outbounds)",
      "SELECT count(*) FROM outbounds WHERE created_at > updated_at")
check("created_at > updated_at (inbounds)",
      "SELECT count(*) FROM inbounds WHERE created_at > updated_at")
check("outbound 후 sale 등록? (outbound_date > tax_invoice_date)",
      """SELECT count(*) FROM sales s JOIN outbounds o ON s.outbound_id=o.outbound_id
         WHERE s.tax_invoice_date IS NOT NULL AND o.outbound_date IS NOT NULL
         AND o.outbound_date > s.tax_invoice_date""")
check("inbound 후 outbound? (인벤토리 거꾸로)",
      """SELECT count(DISTINCT product_id) FROM (
         SELECT o.product_id FROM outbounds o
         WHERE NOT EXISTS(SELECT 1 FROM inbounds i WHERE i.product_id=o.product_id
                          AND i.inbound_date <= o.outbound_date)
           AND NOT EXISTS(SELECT 1 FROM inventory_movements im
                          WHERE im.product_id=o.product_id AND im.movement_subtype='기초')
      ) t""")
check("declaration_date > arrival_date",
      "SELECT count(*) FROM import_declarations WHERE declaration_date > arrival_date")
check("arrival_date > release_date",
      "SELECT count(*) FROM import_declarations WHERE arrival_date IS NOT NULL AND release_date IS NOT NULL AND arrival_date > release_date")
check("bl_shipments: etd > eta",
      "SELECT count(*) FROM bl_shipments WHERE etd IS NOT NULL AND eta IS NOT NULL AND etd > eta")
check("orders.order_date > order outbound.outbound_date",
      """SELECT count(*) FROM orders ord JOIN outbounds o ON o.order_id=ord.order_id
         WHERE ord.order_date > o.outbound_date""")

# ============================================================
hdr("[4] enum / status 값 분포")
# ============================================================
print("\n  outbounds.status / outbounds.usage_category")
c.execute("SELECT status, count(*) FROM outbounds GROUP BY status")
for r in c.fetchall(): print(f"    status: {r}")
c.execute("SELECT usage_category, count(*) FROM outbounds GROUP BY usage_category ORDER BY count DESC")
for r in c.fetchall(): print(f"    usage: {r}")

print("\n  sales.status / currency 분포")
c.execute("SELECT status, count(*) FROM sales GROUP BY status")
for r in c.fetchall(): print(f"    status: {r}")
c.execute("SELECT currency, count(*) FROM sales GROUP BY currency")
for r in c.fetchall(): print(f"    currency: {r}")

print("\n  inbounds.status / currency")
c.execute("SELECT status, count(*) FROM inbounds GROUP BY status")
for r in c.fetchall(): print(f"    status: {r}")
c.execute("SELECT currency, count(*) FROM inbounds GROUP BY currency")
for r in c.fetchall(): print(f"    currency: {r}")

print("\n  bl_shipments.status / inbound_type / currency")
c.execute("SELECT status, count(*) FROM bl_shipments GROUP BY status")
for r in c.fetchall(): print(f"    status: {r}")
c.execute("SELECT inbound_type, count(*) FROM bl_shipments GROUP BY inbound_type")
for r in c.fetchall(): print(f"    inbound_type: {r}")
c.execute("SELECT currency, count(*) FROM bl_shipments GROUP BY currency")
for r in c.fetchall(): print(f"    currency: {r}")

print("\n  fifo_matches.source / corporation")
c.execute("SELECT source, count(*) FROM fifo_matches GROUP BY source")
for r in c.fetchall(): print(f"    source: {r}")
c.execute("SELECT corporation, count(*) FROM fifo_matches GROUP BY corporation")
for r in c.fetchall(): print(f"    corp: {r}")

# ============================================================
hdr("[5] 외화 / 환율 정합성")
# ============================================================
check("inbounds: currency=USD 인데 unit_price 가 100원/Wp 미만 안 보임 (KRW 가능성)",
      """SELECT count(*) FROM inbounds WHERE currency='USD' AND unit_price > 1000 AND unit_price_wp > 100""")
check("sales: currency=USD 인데 단가가 KRW 단위로 들어간 의심",
      """SELECT count(*) FROM sales WHERE currency='USD' AND unit_price_ea > 1000""")
print("\n  USD sales의 unit_price_ea 분포")
c.execute("SELECT min(unit_price_ea), avg(unit_price_ea), max(unit_price_ea), count(*) FROM sales WHERE currency='USD' AND unit_price_ea > 0")
print(f"    {c.fetchone()}")

# ============================================================
hdr("[6] UNIQUE 가정")
# ============================================================
check("outbounds: 같은 (erp_outbound_no, product_id, quantity) 중복",
      """SELECT count(*) FROM (
         SELECT erp_outbound_no, product_id, quantity FROM outbounds
         WHERE erp_outbound_no IS NOT NULL
         GROUP BY 1,2,3 HAVING count(*) > 1
      ) t""")
check("sales: (erp_sales_no, erp_line_no) 중복",
      """SELECT count(*) FROM (
         SELECT erp_sales_no, erp_line_no FROM sales WHERE erp_sales_no IS NOT NULL
         GROUP BY 1,2 HAVING count(*) > 1
      ) t""")
check("inbounds: (erp_inbound_no, erp_line_no) 중복",
      """SELECT count(*) FROM (
         SELECT erp_inbound_no, erp_line_no FROM inbounds WHERE erp_inbound_no IS NOT NULL
         GROUP BY 1,2 HAVING count(*) > 1
      ) t""")
check("declarations: declaration_number 중복",
      """SELECT count(*) FROM (
         SELECT declaration_number FROM import_declarations
         GROUP BY 1 HAVING count(*) > 1
      ) t""")
check("products: product_code 중복",
      """SELECT count(*) FROM (
         SELECT product_code FROM products WHERE is_active GROUP BY 1 HAVING count(*) > 1
      ) t""")
check("partners: 정규화된 partner_name 중복 (잠재 alias)",
      """SELECT count(*) FROM (
         SELECT lower(replace(replace(replace(partner_name,'(주)',''),'㈜',''),' ','')) AS norm
         FROM partners GROUP BY norm HAVING count(*) > 1
      ) t""")

# ============================================================
hdr("[7] 누계 정합성")
# ============================================================
check("v_product_qty_balance 출고>입고+초기 1.05배",
      """SELECT count(*) FROM v_product_qty_balance
         WHERE outbound_qty > (initial_qty + inbound_qty) * 1.05""")
check("v_product_qty_balance balance < 0",
      """SELECT count(*) FROM v_product_qty_balance WHERE balance_qty < 0""")
print("\n  balance_qty 분포 top 10 음수 (재고 부족)")
c.execute("""SELECT product_code, initial_qty, inbound_qty, outbound_qty, balance_qty
   FROM v_product_qty_balance WHERE balance_qty < 0 ORDER BY balance_qty LIMIT 10""")
for r in c.fetchall(): print(f"    {r}")

# ============================================================
hdr("[8] usage_category 일관성 (PR 33 후)")
# ============================================================
print("\n  outbound.usage_category vs source_payload.erp_management 일관성")
c.execute("""
SELECT source_payload->>'erp_management' AS mgmt, usage_category, count(*) AS n
FROM outbounds WHERE source_payload IS NOT NULL
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15
""")
for r in c.fetchall(): print(f"    {r}")

# ============================================================
hdr("[9] sale 단가 vs ERP 매출 시트 단가")
# ============================================================
check("sales.unit_price_ea 와 source_payload.erp_unit_price 차이 1원 초과 (0 제외)",
      """SELECT count(*) FROM sales s
         WHERE s.unit_price_ea > 0
           AND (s.source_payload->>'erp_unit_price')::numeric > 0
           AND abs(s.unit_price_ea - (s.source_payload->>'erp_unit_price')::numeric) > 1""")

# ============================================================
hdr("[10] 화면 KPI 영향 — 영업 전월/금년 출고")
# ============================================================
print("\n  최근 6개월 outbound 월별 (status=active, usage in sale/sale_spare/construction)")
c.execute("""
SELECT to_char(outbound_date,'YYYY-MM') AS m,
  count(*) AS n,
  sum(quantity) AS qty,
  sum(capacity_kw) AS kw
FROM outbounds
WHERE status='active' AND outbound_date >= '2025-10-01'
GROUP BY m ORDER BY m
""")
for r in c.fetchall(): print(f"    {r}")

# ============================================================
hdr("[종합 결과]")
# ============================================================
print(f"\n총 이슈: {len(issues)}")
for label, n in issues:
    print(f"  ❌ {label}: {n}")
if not issues:
    print("  ✅ 모든 검증 통과")
