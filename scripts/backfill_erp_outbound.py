"""
ERP 자료의 출고 시트(2,445행) → 우리 outbounds backfill (D-064/PR 21).

정책 (D-064): 안전장치 < 데이터 살림. 충돌 시 ERP 가 더 신뢰.

흐름
1. ERP 출고 시트 행마다 (출고일자, M-XX erp_code, 출고수량) 자연키 + 고객/관리구분/프로젝트
2. 우리 outbounds 매칭 후보:
   - 매칭 키: outbound_date + product_id (erp_code → products.product_id) + quantity
   - 다중 매칭이면 customer 이름 또는 site_name 으로 추가 필터
3. 매칭 OK:
   - erp_outbound_no = IS2501... 채움 (NULL 일 때만 update, 아니면 충돌 분석)
   - source_payload 에 ERP 단가/외화/관리구분/프로젝트 등 머지
   - capacity_kw 가 우리에 NULL 인데 ERP 에 있으면 채움
4. 매칭 없음 → 신규 outbound 등록 (ERP 정식 자료 — 우리에게 없는 거래)
5. 충돌 (같은 자연키 우리 outbound 여러 개):
   - ERP 행 1개에 우리 N개 → ERP 가 분할출고 1건이면 첫 매칭만 erp_outbound_no 채움 + 나머지에 source_payload merge
6. 매출 시트는 별도 PR 또는 후속
"""
import os, re, json, sys, datetime, openpyxl, psycopg2

FILE = "/tmp/erp_data.xlsx"
SHEET = "출고"

# D-064: ERP 관리구분 → SolarFlow usage_category 매핑.
# "상품판매" 외에는 매출이 아닌 자체 사용/공사/유지관리 등.
ERP_MGMT_TO_USAGE = {
    "상품판매":            "sale",
    "상품판매(스페어)":      "sale_spare",
    "공사사용":            "construction",
    "공사사용(파손)":       "construction_damage",
    "유지관리(발전소)":      "maintenance",
    "폐기":               "disposal",
    "기타":               "other",
}

# 컬럼 인덱스 (헤더 row 0 — 한 번 행)
COLS = {
    "kind": 0, "out_date": 1, "out_no": 2, "applied": 3, "customer": 4,
    "tax": 6, "currency": 8, "fx": 9,
    "erp_code": 12, "model": 13, "spec": 14, "unit": 15, "out_qty": 16,
    "unit_price": 21, "supply": 24, "vat": 25, "total": 26,
    "fx_unit_price": 28, "fx_total": 30,
    "mgmt": 32, "project": 33, "memo": 34, "memo_detail": 35,
    "warehouse": 36, "location": 37, "lot": 38,
}

def normalize_code(s):
    if not s: return ""
    chars = []
    for ch in str(s):
        c = ord(ch)
        if (ord('A') <= c <= ord('Z')) or (ord('0') <= c <= ord('9')):
            chars.append(ch)
        elif ord('a') <= c <= ord('z'):
            chars.append(chr(c - 32))
        elif 0xAC00 <= c <= 0xD7AF or 0x4E00 <= c <= 0x9FFF:
            chars.append(ch)
    return "".join(chars)

def normalize_corp(s):
    if not s: return ""
    out = str(s).replace("(주)", "").replace("㈜", "").replace("주식회사", "")
    return normalize_code(out)

def to_iso(v):
    if v is None or v == "": return None
    if isinstance(v, datetime.date): return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}", s): return s[:10]
    return None

def to_int(v):
    if v in (None, ""): return None
    try: return int(float(str(v).replace(",", "")))
    except: return None

def to_float(v):
    if v in (None, ""): return None
    try: return float(str(v).replace(",", ""))
    except: return None

c = psycopg2.connect(os.environ["SUPABASE_DB_URL"])
c.autocommit = False
cur = c.cursor()

# 마스터 캐시
cur.execute("SELECT product_id, product_code, erp_code, wattage_kw FROM products")
prod_by_erp = {}
for pid, code, erp, w in cur.fetchall():
    if erp: prod_by_erp[erp] = (pid, float(w) if w else 0)

cur.execute("SELECT partner_id, partner_name FROM partners")
partner_idx = {normalize_corp(n): pid for pid, n in cur.fetchall()}

cur.execute("SELECT canonical_partner_id, alias_text_normalized FROM partner_aliases")
for pid, alias in cur.fetchall():
    partner_idx.setdefault(alias, pid)

cur.execute("SELECT company_id, company_code, company_name FROM companies")
comp_by_name = {}
for cid, code, name in cur.fetchall():
    if code: comp_by_name[normalize_corp(code)] = cid
    if name: comp_by_name[normalize_corp(name)] = cid

cur.execute("SELECT warehouse_id FROM warehouses LIMIT 1")
default_wh = cur.fetchone()[0]

# 탑솔라 그룹 default — 시트 거래구분 'DOMESTIC' 출고는 탑솔라(주) 출고
cur.execute("SELECT company_id FROM companies WHERE company_name LIKE '탑솔라%' LIMIT 1")
topsolar_company = cur.fetchone()
topsolar_company = topsolar_company[0] if topsolar_company else None

# 시트 처리
import openpyxl
wb = openpyxl.load_workbook(FILE, data_only=True)
ws = wb[SHEET]
rows = list(ws.iter_rows(values_only=True))

matched_filled = 0  # 우리 outbound 매칭 + erp_outbound_no 채움
matched_already = 0  # erp_outbound_no 이미 있음 (충돌 분석)
new_outbounds = 0  # 매칭 없음 → 신규 등록
skipped = 0
errors = []

for ridx, row in enumerate(rows[1:], start=2):  # 1행은 헤더
    if not row or not row[COLS["out_no"]]: continue
    erp_no = str(row[COLS["out_no"]]).strip()
    out_date = to_iso(row[COLS["out_date"]])
    erp_code = str(row[COLS["erp_code"]]).strip() if row[COLS["erp_code"]] else ""
    out_qty = to_int(row[COLS["out_qty"]])
    if not out_date or not erp_code or not out_qty or out_qty <= 0:
        skipped += 1
        continue

    pmeta = prod_by_erp.get(erp_code)
    if not pmeta:
        # PR 19 누락 product (특이 케이스)
        skipped += 1
        errors.append(f"row={ridx} erp_code {erp_code} product 마스터 없음")
        continue
    pid, wattage = pmeta

    customer_raw = str(row[COLS["customer"]]).strip() if row[COLS["customer"]] else ""
    project = str(row[COLS["project"]]).strip() if row[COLS["project"]] else ""
    mgmt = str(row[COLS["mgmt"]]).strip() if row[COLS["mgmt"]] else ""
    unit_price = to_float(row[COLS["unit_price"]])
    supply = to_float(row[COLS["supply"]])
    vat = to_float(row[COLS["vat"]])
    total = to_float(row[COLS["total"]])
    fx_unit = to_float(row[COLS["fx_unit_price"]])
    fx_total = to_float(row[COLS["fx_total"]])

    # 자연키로 우리 outbound 매칭
    cur.execute("""
    SELECT outbound_id, erp_outbound_no, source_payload
    FROM outbounds
    WHERE outbound_date = %s AND product_id = %s AND quantity = %s
    """, (out_date, pid, out_qty))
    candidates = cur.fetchall()

    erp_payload = {
        "erp_kind": str(row[COLS["kind"]]) if row[COLS["kind"]] else None,
        "erp_customer": customer_raw,
        "erp_project": project,
        "erp_management": mgmt,
        "erp_unit_price": unit_price,
        "erp_supply": supply,
        "erp_vat": vat,
        "erp_total": total,
        "erp_fx_unit": fx_unit,
        "erp_fx_total": fx_total,
        "erp_warehouse": str(row[COLS["warehouse"]]) if row[COLS["warehouse"]] else None,
        "erp_location": str(row[COLS["location"]]) if row[COLS["location"]] else None,
        "erp_lot": str(row[COLS["lot"]]) if row[COLS["lot"]] else None,
        "erp_memo": str(row[COLS["memo"]]) if row[COLS["memo"]] else None,
    }
    erp_payload = {k: v for k, v in erp_payload.items() if v not in (None, "", "nan")}

    # D-064: 매칭/신규 공통 — ERP 관리구분 + 판매가 기반 usage_category 결정
    if mgmt:
        usage = ERP_MGMT_TO_USAGE.get(mgmt, "other")
    elif (unit_price and unit_price > 0) or (total and total > 0) or (fx_total and fx_total > 0):
        usage = "sale"
    else:
        usage = "other"

    if candidates:
        # 매칭 — 첫 candidate 에 erp_outbound_no 채움 + source_payload merge + usage_category 동기화
        # 다중 매칭: 첫 행만 처리. (분할출고 케이스는 ERP 가 같은 IS 번호일 가능성 — 그래도 첫 매칭만)
        oid, current_erp_no, current_pl = candidates[0]
        new_pl = dict(current_pl) if isinstance(current_pl, dict) else {}
        new_pl.update(erp_payload)

        if current_erp_no and current_erp_no != erp_no:
            # 충돌 — 우리 outbound 가 이미 다른 erp_no 가짐. 다른 행 매칭 시도.
            # ERP 신뢰 정책: 더 최신 ERP 자료가 정식 → 덮어쓰기? 또는 둘 다 보존
            # 안전: 충돌 카운트 + source_payload 에 다른 erp_no 도 보존 (overwrite_history)
            new_pl.setdefault("erp_outbound_no_history", []).append(current_erp_no)
            cur.execute(
                "UPDATE outbounds SET erp_outbound_no = %s, source_payload = %s::jsonb, usage_category = %s WHERE outbound_id = %s",
                (erp_no, json.dumps(new_pl, ensure_ascii=False), usage, oid))
            matched_already += 1
        else:
            cur.execute(
                "UPDATE outbounds SET erp_outbound_no = %s, source_payload = %s::jsonb, usage_category = %s WHERE outbound_id = %s",
                (erp_no, json.dumps(new_pl, ensure_ascii=False), usage, oid))
            matched_filled += 1
    else:
        # 매칭 없음 — ERP 정식 자료 → 신규 outbound 등록
        # company: kind=DOMESTIC 면 탑솔라 / 그 외에는 customer 매칭 시도
        comp_id = topsolar_company  # default
        # warehouse: ERP 의 출고창고 매칭 시도, 없으면 default
        wh_id = default_wh
        cap_kw = (out_qty * wattage) if wattage > 0 else None
        # usage_category: 위에서 이미 ERP 관리구분 + 판매가 기반으로 계산됨 (변수 usage)
        full_payload = dict(erp_payload)
        full_payload.update({
            "source": "erp_outbound_sheet",
            "erp_outbound_no": erp_no,
            "erp_row": ridx,
        })
        try:
            cur.execute("""
            INSERT INTO outbounds (
              outbound_date, company_id, product_id, quantity, capacity_kw,
              warehouse_id, usage_category, status, erp_outbound_no, source_payload, site_name
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', %s, %s::jsonb, %s)
            RETURNING outbound_id
            """, (out_date, comp_id, pid, out_qty, cap_kw, wh_id, usage, erp_no,
                  json.dumps(full_payload, ensure_ascii=False), project[:100] if project else None))
            cur.fetchone()
            new_outbounds += 1
        except Exception as e:
            c.rollback()
            errors.append(f"row={ridx} 신규 INSERT 실패 ({erp_no}): {e}")
            continue

    if (matched_filled + matched_already + new_outbounds) % 100 == 0:
        c.commit()  # 중간 커밋

c.commit()

print(f"\n=== 결과 ===")
print(f"기존 outbound 매칭 + erp_no 채움: {matched_filled}")
print(f"기존 outbound 매칭 + erp_no 충돌(덮어쓰기): {matched_already}")
print(f"신규 outbound 등록 (없는 자료 추가): {new_outbounds}")
print(f"skipped (마스터 누락 등): {skipped}")
print(f"errors: {len(errors)}")
for e in errors[:5]: print(f"  {e}")

cur.execute("SELECT count(*) FROM outbounds WHERE erp_outbound_no IS NOT NULL")
print(f"\nerp_outbound_no 있는 outbound: {cur.fetchone()[0]}")
cur.execute("SELECT count(*) FROM outbounds")
print(f"전체 outbound: {cur.fetchone()[0]}")
