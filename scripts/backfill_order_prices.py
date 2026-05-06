"""orders.unit_price_wp / unit_price_ea 일괄 backfill (D-064 PR 32, 1회성).

배경:
- PR 19~31 ERP backfill 후, OrdersPage 의 KPI '평균 단가' 가 2025-12 이전 표시 0.
- 진단: orders 88건 (대부분 2025-12) 의 unit_price_wp 가 0/NULL.
- sales 테이블에는 매출 단가가 정상이지만 orders 단가 컬럼은 별도라 전파 안 됨.

정책 (D-064): 안전장치보다 데이터 살림.
4단계 fallback — 정확도 높은 순서로:
  1) sales.outbound_id → outbounds.order_id 경유 매칭 (정확)
  2) order_date ±30일, 같은 product 의 sales 평균 (추정 마킹)
  3) 같은 product 전체 평균 (추정 마킹)
  4) 같은 월의 sales 평균 — product 무관, 월 평균 KPI 의 본질에 부합 (추정 마킹)

추정값은 source_payload.unit_price_estimated = true 마크 — 정확한 데이터 들어오면 덮어쓰기 가능.

운영 적용 결과:
  사전: 88 행 단가 0/NULL
  1) outbound 경유 정확 매칭: 13
  2) ±30일 product 평균: 66
  3) product 전체 평균: 4
  4) 같은 월 평균 (product 무관): 5
  사후: 0 잔존 — 100% 복구
"""
import os, psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
if not DB_URL:
    raise SystemExit("SUPABASE_DB_URL 환경변수 필요")

c = psycopg2.connect(DB_URL)
c.autocommit = False
cur = c.cursor()

# orders 에 source_payload (jsonb) 가 없으면 추가 — 추정치 마킹용
cur.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_payload jsonb")
c.commit()

print("=== 사전 ===")
cur.execute("SELECT count(*) FROM orders WHERE unit_price_wp IS NULL OR unit_price_wp = 0")
before = cur.fetchone()[0]
print(f"단가 0/NULL 인 orders: {before}")

# 1) sales.outbound_id → outbounds.order_id 경유 (정확 매칭)
cur.execute(
    """
WITH src AS (
  SELECT o2.order_id,
         max(s.unit_price_wp) FILTER (WHERE s.unit_price_wp > 0) AS unit_price_wp,
         max(s.unit_price_ea) FILTER (WHERE s.unit_price_ea > 0) AS unit_price_ea
  FROM sales s
  JOIN outbounds o2 ON s.outbound_id = o2.outbound_id
  WHERE o2.order_id IS NOT NULL
    AND COALESCE(s.status, 'active') <> 'cancelled'
    AND (s.unit_price_wp > 0 OR s.unit_price_ea > 0)
  GROUP BY o2.order_id
)
UPDATE orders o
SET unit_price_wp = COALESCE(NULLIF(o.unit_price_wp, 0), src.unit_price_wp),
    unit_price_ea = COALESCE(NULLIF(o.unit_price_ea, 0), src.unit_price_ea),
    updated_at = now()
FROM src
WHERE o.order_id = src.order_id
  AND (o.unit_price_wp IS NULL OR o.unit_price_wp = 0)
  AND src.unit_price_wp IS NOT NULL
"""
)
n1 = cur.rowcount
c.commit()
print(f"1) outbound 경유 정확 매칭: {n1} 행")

# 2) ±30일 같은 product 의 sales 평균 (추정 마킹)
cur.execute(
    """
WITH cand AS (
  SELECT o.order_id, o.product_id,
         (
           SELECT round(avg(NULLIF(s.unit_price_wp, 0))::numeric, 2)
           FROM sales s JOIN outbounds ob ON s.outbound_id = ob.outbound_id
           WHERE ob.product_id = o.product_id
             AND ob.outbound_date BETWEEN o.order_date - INTERVAL '30 days' AND o.order_date + INTERVAL '30 days'
             AND s.unit_price_wp > 0
             AND COALESCE(s.status, 'active') <> 'cancelled'
         ) AS avg_wp
  FROM orders o
  WHERE o.unit_price_wp IS NULL OR o.unit_price_wp = 0
)
UPDATE orders o
SET unit_price_wp = cand.avg_wp,
    unit_price_ea = round(cand.avg_wp * (SELECT spec_wp FROM products WHERE product_id = o.product_id))::numeric(12,2),
    source_payload = COALESCE(o.source_payload, '{}'::jsonb)
                     || jsonb_build_object('unit_price_source', 'fallback_avg_30d', 'unit_price_estimated', true),
    updated_at = now()
FROM cand
WHERE o.order_id = cand.order_id AND cand.avg_wp IS NOT NULL
"""
)
n2 = cur.rowcount
c.commit()
print(f"2) ±30일 product 평균 fallback: {n2} 행 (추정 마킹)")

# 3) 같은 product 전체 평균 (추정 마킹)
cur.execute(
    """
WITH cand AS (
  SELECT o.order_id, o.product_id,
         (
           SELECT round(avg(NULLIF(s.unit_price_wp, 0))::numeric, 2)
           FROM sales s JOIN outbounds ob ON s.outbound_id = ob.outbound_id
           WHERE ob.product_id = o.product_id
             AND s.unit_price_wp > 0
             AND COALESCE(s.status, 'active') <> 'cancelled'
         ) AS avg_wp
  FROM orders o
  WHERE o.unit_price_wp IS NULL OR o.unit_price_wp = 0
)
UPDATE orders o
SET unit_price_wp = cand.avg_wp,
    unit_price_ea = round(cand.avg_wp * (SELECT spec_wp FROM products WHERE product_id = o.product_id))::numeric(12,2),
    source_payload = COALESCE(o.source_payload, '{}'::jsonb)
                     || jsonb_build_object('unit_price_source', 'fallback_avg_product_all', 'unit_price_estimated', true),
    updated_at = now()
FROM cand
WHERE o.order_id = cand.order_id AND cand.avg_wp IS NOT NULL
"""
)
n3 = cur.rowcount
c.commit()
print(f"3) product 전체 평균 fallback: {n3} 행 (추정 마킹)")

# 4) 같은 월의 sales 평균 — product 무관, 월 평균 KPI 본질에 부합 (추정 마킹)
cur.execute(
    """
WITH cand AS (
  SELECT o.order_id, o.product_id,
         (
           SELECT round(avg(NULLIF(s.unit_price_wp, 0))::numeric, 2)
           FROM sales s JOIN outbounds ob ON s.outbound_id = ob.outbound_id
           WHERE date_trunc('month', ob.outbound_date) = date_trunc('month', o.order_date)
             AND s.unit_price_wp > 0
             AND COALESCE(s.status, 'active') <> 'cancelled'
         ) AS avg_wp
  FROM orders o
  WHERE o.unit_price_wp IS NULL OR o.unit_price_wp = 0
)
UPDATE orders o
SET unit_price_wp = cand.avg_wp,
    unit_price_ea = round(cand.avg_wp * (SELECT spec_wp FROM products WHERE product_id = o.product_id))::numeric(12,2),
    source_payload = COALESCE(o.source_payload, '{}'::jsonb)
                     || jsonb_build_object('unit_price_source', 'fallback_avg_month_all', 'unit_price_estimated', true),
    updated_at = now()
FROM cand
WHERE o.order_id = cand.order_id AND cand.avg_wp IS NOT NULL
"""
)
n4 = cur.rowcount
c.commit()
print(f"4) 같은 월 평균 fallback (product 무관): {n4} 행 (추정 마킹)")

# 사후 검증
print()
print("=== 사후 ===")
cur.execute("SELECT count(*) FROM orders WHERE unit_price_wp IS NULL OR unit_price_wp = 0")
after = cur.fetchone()[0]
print(f"단가 0/NULL 잔존: {after} (사전 {before} → 처리 {before - after})")

cur.execute(
    """
SELECT to_char(order_date, 'YYYY-MM') AS m,
       count(*) AS rows,
       count(*) FILTER (WHERE unit_price_wp > 0) AS w_wp,
       count(*) FILTER (WHERE source_payload->>'unit_price_estimated' = 'true') AS estimated,
       round(avg(NULLIF(unit_price_wp, 0))::numeric, 2) AS avg_wp
FROM orders
WHERE order_date IS NOT NULL
GROUP BY m ORDER BY m
"""
)
print(f"\n{'month':<8} {'rows':>5} {'w_wp':>5} {'est':>4} {'avg_wp':>9}")
for r in cur.fetchall():
    print(f"{r[0]:<8} {r[1]:>5} {r[2]:>5} {r[3]:>4} {str(r[4] or '—'):>9}")
