"""제조사별 product family / 변종 패턴 분석.

분류:
A. 같은 family, 출력만 다름 (5W~10W 단위) — 정상 별도 product 유지, family 묶음
B. 같은 출력, 미세 변종 — 케이스별:
   - B1. 오타/표기 차이 (TSM-720NEG21C.20 vs NGE, BDV-S vs VDV-S) → alias 통합 후보
   - B2. 의미 있는 차이 (CFP / 등급 / 제품 표시) → 별도 유지
   - B3. lot/배치 차이 (-S vs -S1 vs -S2) → family 그룹 + 영업/재고 통합
"""
import os, re, psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
c = psycopg2.connect(DB_URL).cursor()


def hdr(t):
    print(f"\n{'='*70}\n{t}\n{'='*70}")


# ============================================================
hdr("[1] series_name 채움률")
# ============================================================
c.execute("""
SELECT count(*) AS total,
  count(*) FILTER (WHERE series_name IS NOT NULL) AS with_series,
  count(DISTINCT series_name) AS unique_series
FROM products WHERE is_active
""")
print(c.fetchone())
c.execute("""
SELECT series_name, count(*), array_agg(product_code ORDER BY spec_wp)
FROM products WHERE is_active AND series_name IS NOT NULL
GROUP BY series_name ORDER BY count(*) DESC LIMIT 10
""")
print("\n  같은 series_name 묶음 top 10:")
for r in c.fetchall(): print(f"    {r[0]:.<30} {r[1]:>2}개 — {r[2]}")


# ============================================================
hdr("[A] 같은 family — 출력만 다른 패밀리 (자동 추출)")
# ============================================================
# product_code 의 출력 부분 (3자리 숫자) 제거 후 같은 prefix
c.execute("""
SELECT product_code, spec_wp, manufacturer_id
FROM products WHERE is_active AND spec_wp > 0
ORDER BY product_code
""")
rows = c.fetchall()

# 패턴: prefix-NNN-suffix → prefix + suffix (NNN 3자리 출력 수치)
families = {}
for code, wp, mfg in rows:
    # 다음 패턴 추출: 출력 숫자 매칭
    if not code:
        continue
    # 숫자 부분이 spec_wp 와 같으면 그게 출력 부분
    # 우선 단순: 코드에서 spec_wp 의 숫자가 들어있으면 제거
    wp_str = str(wp)
    # 정규화: spec_wp 숫자를 wildcard 로 치환
    family_key = re.sub(rf'(?<!\d){wp_str}(?!\d)', 'NNN', code)
    # 5W 라운딩 변종도 같이 (예: 627 → 625)
    rounded = (wp // 5) * 5
    if rounded != wp:
        family_key = re.sub(rf'(?<!\d){rounded}(?!\d)', 'NNN', family_key)
    if family_key not in families:
        families[family_key] = []
    families[family_key].append((code, wp, mfg))

# family 묶음 (2개+)
multi_family = {k: v for k, v in families.items() if len(v) > 1}
print(f"\n  자동 추출 family 그룹: {len(multi_family)}개 (2개 이상 모듈)")
print(f"\n  Top 10 family (출력 라인업):")
sorted_families = sorted(multi_family.items(), key=lambda x: -len(x[1]))[:15]
for fam_key, members in sorted_families:
    members.sort(key=lambda x: x[1])
    sample = ", ".join(f"{c} ({w}W)" for c, w, _ in members[:6])
    print(f"    {fam_key:.<35} {len(members)}개 — {sample}")


# ============================================================
hdr("[B] 같은 출력, 미세 변종 — spec_wp 별 product_code 변종")
# ============================================================
c.execute("""
SELECT spec_wp, count(*) AS n,
  array_agg(product_code ORDER BY product_code) AS codes,
  array_agg(manufacturer_id ORDER BY product_code) AS mfgs
FROM products WHERE is_active AND spec_wp > 0
GROUP BY spec_wp HAVING count(*) > 1
ORDER BY n DESC LIMIT 20
""")
variants = c.fetchall()
for wp, n, codes, mfgs in variants:
    same_mfg = len(set(mfgs)) == 1 if all(mfgs) else False
    print(f"\n  {wp}Wp ({n}개{', 동일 제조사' if same_mfg else ''}):")
    for code in codes:
        print(f"    - {code}")


# ============================================================
hdr("[B1] 잠재 오타/표기 alias 후보 — 동일 제조사, prefix 99% 같음")
# ============================================================
# Levenshtein 흉내: 같은 첫 8자 + 같은 마지막 5자 + spec_wp 동일
c.execute("""
SELECT a.product_code AS code_a, b.product_code AS code_b, a.spec_wp,
  (SELECT count(*) FROM outbounds WHERE product_id = a.product_id) AS use_a,
  (SELECT count(*) FROM outbounds WHERE product_id = b.product_id) AS use_b
FROM products a JOIN products b ON a.spec_wp = b.spec_wp
  AND a.manufacturer_id = b.manufacturer_id
  AND a.product_code < b.product_code
WHERE a.is_active AND b.is_active
  AND (
    -- 첫 8자 동일 + 길이 차 ≤ 2
    (substring(a.product_code, 1, 8) = substring(b.product_code, 1, 8)
     AND abs(length(a.product_code) - length(b.product_code)) <= 2)
    OR
    -- 한 글자만 다른 동일 길이
    (length(a.product_code) = length(b.product_code)
     AND substring(a.product_code, 1, length(a.product_code)-1)
       = substring(b.product_code, 1, length(b.product_code)-1))
  )
ORDER BY a.spec_wp, a.product_code
""")
print("\n  잠재 alias 후보 (동일 제조사, 표기 거의 같음):")
for r in c.fetchall():
    print(f"    {r[2]}Wp: '{r[0]}' (사용 {r[3]}) ↔ '{r[1]}' (사용 {r[4]})")


# ============================================================
hdr("[B3] -S/-S1/-S2 lot 변종 패턴")
# ============================================================
c.execute("""
SELECT a.product_code AS canonical, b.product_code AS variant, a.spec_wp,
  (SELECT count(*) FROM outbounds WHERE product_id = a.product_id) AS use_a,
  (SELECT count(*) FROM outbounds WHERE product_id = b.product_id) AS use_b
FROM products a JOIN products b ON a.spec_wp = b.spec_wp
  AND a.manufacturer_id = b.manufacturer_id
WHERE a.is_active AND b.is_active
  AND b.product_code ~ (a.product_code || '[0-9]$')
ORDER BY a.spec_wp
""")
print("\n  lot 변종 (canonical + 숫자):")
for r in c.fetchall():
    print(f"    {r[2]}Wp: '{r[0]}' (사용 {r[3]}) — lot 변종 '{r[1]}' (사용 {r[4]})")
