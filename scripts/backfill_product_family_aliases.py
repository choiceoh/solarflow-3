"""products.product_family_code 자동 추출 + alias 6쌍 등록 (D-064 PR 35)."""
import os, re, psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
c = psycopg2.connect(DB_URL)
c.autocommit = False
cur = c.cursor()

# ============================================================
print("[1] product_family_code 자동 추출")
# ============================================================
cur.execute("""
SELECT product_id, product_code, spec_wp FROM products
WHERE is_active AND spec_wp > 0 AND product_code IS NOT NULL
""")
rows = cur.fetchall()

updates = []
for pid, code, wp in rows:
    if not code:
        continue
    wp_str = str(wp)
    # 출력 숫자 (NNNN 또는 NNN) 를 wildcard 처리
    family_key = re.sub(rf"(?<!\d){wp_str}(?!\d)", "NNN", code)
    rounded = (wp // 5) * 5
    if rounded != wp:
        family_key = re.sub(rf"(?<!\d){rounded}(?!\d)", "NNN", family_key)
    if family_key != code:  # 출력 부분이 매칭된 경우만
        updates.append((family_key, pid))
    else:
        # NNN 매치 못 한 경우 — 코드 자체를 family_code 로 사용 (단일 family)
        updates.append((code, pid))

cur.executemany(
    "UPDATE products SET product_family_code = %s WHERE product_id = %s",
    updates,
)
print(f"  {len(updates)} 행 family_code 채움")
c.commit()

# 통계
cur.execute("""
SELECT product_family_code, count(*), array_agg(product_code ORDER BY spec_wp) AS codes
FROM products WHERE is_active AND product_family_code IS NOT NULL
GROUP BY product_family_code HAVING count(*) > 1
ORDER BY count(*) DESC LIMIT 15
""")
print("  Top 15 family 그룹:")
for r in cur.fetchall():
    print(f"    {r[0]:.<35} {r[1]:>2}개 — {r[2][:5]}{'...' if r[1] > 5 else ''}")


# ============================================================
print()
print("[2] alias 후보 6쌍 등록")
# ============================================================
ALIASES = [
    # (canonical_code, alias_code, reason)
    ("LR7-72HGD-615M", "LR7-72HGD-615Ma", "lot_variant"),
    ("JKM630N-78HL4-BDV-S", "JKM630N-78HL4-BDV", "legacy"),
    ("JKM635N-78HL4-BDV-S", "JKM635N-78HL4-BDV-S1", "lot_variant"),
    # 사용 0 인 변종도 포함 (PR 33 비활성화된 38건 중 alias 후보)
    ("JKM635N-78HL4-BDV-S", "JKM635N-78HL4-BDV-S2", "lot_variant"),
    ("JKM635N-78HL4-BDV-S", "JKM635N-78HL4-VDV-S", "typo"),  # B vs V
    ("JKM630N-78HL4-BDV-S", "JKM630N-78HL4-BDV-S(제품)", "typo"),  # 제품 표기
    ("TSM-720NEG21C.20K", "TSM-720NEG21C.20", "lot_variant"),  # K 표기 차이
    ("TSM-720NEG21C.20K", "TSM-720NGE21C.20K", "typo"),  # NGE vs NEG 글자 순서
    ("TSM-710NEG21C.20K", "TSM-710NEG21C.20", "lot_variant"),
    ("HS500WE-GHD (1등급)", "HS500WE-GHD10 (1등급)", "lot_variant"),
]

inserted = 0
skipped = 0
errors = []
for canonical_code, alias_code, reason in ALIASES:
    cur.execute("SELECT product_id FROM products WHERE product_code = %s LIMIT 1", (canonical_code,))
    canonical = cur.fetchone()
    cur.execute("SELECT product_id FROM products WHERE product_code = %s LIMIT 1", (alias_code,))
    alias = cur.fetchone()
    if not canonical or not alias:
        skipped += 1
        errors.append(f"  not found: canonical='{canonical_code}' or alias='{alias_code}'")
        continue
    if canonical[0] == alias[0]:
        skipped += 1
        continue
    try:
        # 기존 alias_code (string) 컬럼은 alias product 의 product_code 로 채움
        cur.execute(
            """
        INSERT INTO product_aliases
          (canonical_product_id, alias_product_id, alias_code, alias_code_normalized, reason, source)
        VALUES (%s, %s, %s, lower(replace(replace(%s, ' ', ''), '-', '')), %s, 'pr35_initial')
        ON CONFLICT (alias_product_id) WHERE alias_product_id IS NOT NULL DO UPDATE SET
          canonical_product_id = EXCLUDED.canonical_product_id,
          reason = EXCLUDED.reason
        """,
            (canonical[0], alias[0], alias_code, alias_code, reason),
        )
        inserted += 1
    except Exception as e:
        c.rollback()
        errors.append(f"  alias 등록 실패: {canonical_code} → {alias_code}: {e}")
        continue

c.commit()
print(f"  alias 등록: {inserted} / skipped: {skipped}")
for e in errors:
    print(e)


# ============================================================
print()
print("[3] 검증")
# ============================================================
cur.execute("SELECT count(*) FROM product_aliases")
print(f"  product_aliases 총: {cur.fetchone()[0]}")

cur.execute("""
SELECT cp.product_code AS canonical, ap.product_code AS alias, pa.reason,
  (SELECT count(*) FROM outbounds WHERE product_id = ap.product_id) AS alias_use,
  (SELECT count(*) FROM outbounds WHERE product_id = cp.product_id) AS canonical_use
FROM product_aliases pa
JOIN products cp ON pa.canonical_product_id = cp.product_id
JOIN products ap ON pa.alias_product_id = ap.product_id
ORDER BY canonical_use DESC
""")
print("  등록된 alias:")
for r in cur.fetchall():
    print(f"    '{r[0]}' (사용 {r[4]}) ← '{r[1]}' (사용 {r[3]}, {r[2]})")

cur.execute("""
SELECT count(*) FROM v_products_canonical WHERE product_id != canonical_product_id
""")
print(f"  v_products_canonical 매핑된 alias: {cur.fetchone()[0]}")
