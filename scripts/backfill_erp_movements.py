"""
ERP 수불 시트(1,856행, 29컬럼) → inventory_movements 시계열 LEDGER backfill (D-064 / PR 25).

정책 (D-064): 모든 컬럼 누락 없이 보존, 안전장치보다 데이터 살림.
- 마이그레이션 068 으로 inventory_movements 테이블 신규 생성
- 멱등 키: source_payload->>'erp_row' + source ('erp_balance_sheet')
- 매 행 = 한 트랜잭션 또는 기초재고 — UPSERT
- partner / warehouse 자동 등록
- 카테고리 4단 (품목군/대분류/중분류/소분류) 코드+이름 모두 보존
"""
import os, re, json, datetime, openpyxl, psycopg2

FILE = "/tmp/erp_data.xlsx"
SHEET = "수불"
SOURCE = "erp_balance_sheet"

COLS = {
    "erp_code": 0, "model": 1, "spec": 2, "stock_unit": 3,
    "wh_code": 4, "wh_name": 5, "loc_code": 6, "loc_name": 7,
    "mv_date": 8, "mv_type_code": 9, "partner": 10, "mv_type": 11,
    "mv_subtype": 12, "partner_code": 13,
    "beginning": 14, "inbound": 15, "outbound": 16, "ending": 17,
    "unit_factor": 18, "unit": 19, "ending_mgmt": 20,
    "cat_code": 21, "cat_name": 22,
    "l1_code": 23, "l1_name": 24,
    "l2_code": 25, "l2_name": 26,
    "l3_code": 27, "l3_name": 28,
}


def normalize(s):
    if not s:
        return ""
    out = str(s).replace("(주)", "").replace("㈜", "").replace("주식회사", "")
    chars = []
    for ch in out:
        c = ord(ch)
        if (ord("A") <= c <= ord("Z")) or (ord("0") <= c <= ord("9")):
            chars.append(ch)
        elif ord("a") <= c <= ord("z"):
            chars.append(chr(c - 32))
        elif 0xAC00 <= c <= 0xD7AF or 0x4E00 <= c <= 0x9FFF:
            chars.append(ch)
    return "".join(chars)


def to_iso(v):
    if v is None or v == "":
        return None
    if isinstance(v, datetime.date):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    return None


def to_int(v):
    if v in (None, ""):
        return None
    try:
        return int(float(str(v).replace(",", "")))
    except Exception:
        return None


def to_float(v):
    if v in (None, ""):
        return None
    try:
        return float(str(v).replace(",", ""))
    except Exception:
        return None


c = psycopg2.connect(os.environ["SUPABASE_DB_URL"])
c.autocommit = False
cur = c.cursor()

cur.execute("SELECT product_id, erp_code FROM products")
prod_by_erp = {erp: pid for pid, erp in cur.fetchall() if erp}

cur.execute("SELECT partner_id, partner_name FROM partners")
partner_idx = {normalize(n): pid for pid, n in cur.fetchall()}
cur.execute("SELECT canonical_partner_id, alias_text_normalized FROM partner_aliases")
for pid, alias in cur.fetchall():
    partner_idx.setdefault(alias, pid)

cur.execute("SELECT warehouse_id, warehouse_code, warehouse_name FROM warehouses")
wh_by_code = {}
wh_by_name = {}
for wid, code, name in cur.fetchall():
    if code:
        wh_by_code[code] = wid
    if name:
        wh_by_name[normalize(name)] = wid

wb = openpyxl.load_workbook(FILE, data_only=True)
ws = wb[SHEET]
rows = list(ws.iter_rows(values_only=True))

inserted = 0
updated = 0
skipped = 0
errors = []

for ridx, row in enumerate(rows[1:], start=2):
    if not row or row[COLS["erp_code"]] in (None, ""):
        continue
    erp_code = str(row[COLS["erp_code"]]).strip()
    if not erp_code.startswith("M-"):
        continue
    pid = prod_by_erp.get(erp_code)
    if not pid:
        skipped += 1
        errors.append(f"row={ridx} erp_code {erp_code} product 마스터 없음")
        continue
    mv_date = to_iso(row[COLS["mv_date"]])
    if not mv_date:
        skipped += 1
        continue

    wh_code = str(row[COLS["wh_code"]] or "").strip() or None
    wh_name = str(row[COLS["wh_name"]] or "").strip() or None
    wh_id = wh_by_code.get(wh_code) if wh_code else None
    if not wh_id and wh_name:
        wh_id = wh_by_name.get(normalize(wh_name))

    partner_raw = str(row[COLS["partner"]] or "").strip()
    partner_code = str(row[COLS["partner_code"]] or "").strip() or None
    partner_id = partner_idx.get(normalize(partner_raw)) if partner_raw else None
    if not partner_id and partner_raw:
        try:
            cur.execute(
                "INSERT INTO partners (partner_name, partner_type, is_active) VALUES (%s, 'unknown', true) RETURNING partner_id",
                (partner_raw,),
            )
            partner_id = cur.fetchone()[0]
            c.commit()
            partner_idx[normalize(partner_raw)] = partner_id
        except Exception as e:
            c.rollback()

    payload = {}
    for key, idx in COLS.items():
        v = row[idx]
        if v in (None, ""):
            continue
        if isinstance(v, datetime.date):
            v = v.strftime("%Y-%m-%d")
        payload[f"erp_{key}"] = v if isinstance(v, (int, float, str)) else str(v)
    payload["erp_row"] = ridx

    fields = dict(
        movement_date=mv_date,
        product_id=pid,
        warehouse_id=wh_id,
        warehouse_code=wh_code,
        warehouse_name=wh_name,
        location_code=str(row[COLS["loc_code"]] or "").strip() or None,
        location_name=str(row[COLS["loc_name"]] or "").strip() or None,
        movement_type=str(row[COLS["mv_type"]] or "").strip() or None,
        movement_subtype=str(row[COLS["mv_subtype"]] or "").strip() or None,
        movement_type_code=to_int(row[COLS["mv_type_code"]]),
        partner_partner_id=partner_id,
        partner_code=partner_code,
        partner_name=partner_raw or None,
        beginning_qty=to_int(row[COLS["beginning"]]),
        inbound_qty=to_int(row[COLS["inbound"]]),
        outbound_qty=to_int(row[COLS["outbound"]]),
        ending_qty=to_int(row[COLS["ending"]]),
        unit_factor=to_float(row[COLS["unit_factor"]]),
        unit=str(row[COLS["unit"]] or "").strip() or None,
        ending_qty_mgmt=to_int(row[COLS["ending_mgmt"]]),
        category_code=str(row[COLS["cat_code"]] or "").strip() or None,
        category_name=str(row[COLS["cat_name"]] or "").strip() or None,
        cat_l1_code=str(row[COLS["l1_code"]] or "").strip() or None,
        cat_l1_name=str(row[COLS["l1_name"]] or "").strip() or None,
        cat_l2_code=str(row[COLS["l2_code"]] or "").strip() or None,
        cat_l2_name=str(row[COLS["l2_name"]] or "").strip() or None,
        cat_l3_code=str(row[COLS["l3_code"]] or "").strip() or None,
        cat_l3_name=str(row[COLS["l3_name"]] or "").strip() or None,
        source_payload=json.dumps(payload, ensure_ascii=False),
    )

    cur.execute(
        "SELECT movement_id FROM inventory_movements WHERE source = %s AND source_payload->>'erp_row' = %s",
        (SOURCE, str(ridx)),
    )
    existing = cur.fetchone()
    try:
        if existing:
            mid = existing[0]
            set_clause = ", ".join(f"{k} = %s" for k in fields.keys())
            sql = f"UPDATE inventory_movements SET {set_clause} WHERE movement_id = %s"
            sql = sql.replace("source_payload = %s", "source_payload = %s::jsonb")
            cur.execute(sql, list(fields.values()) + [mid])
            updated += 1
        else:
            cols = list(fields.keys()) + ["source"]
            vals_ph = ["%s"] * len(fields)
            sp_idx = list(fields.keys()).index("source_payload")
            vals_ph[sp_idx] = "%s::jsonb"
            vals_ph += ["%s"]
            sql = f"INSERT INTO inventory_movements ({', '.join(cols)}) VALUES ({', '.join(vals_ph)})"
            cur.execute(sql, list(fields.values()) + [SOURCE])
            inserted += 1
    except Exception as e:
        c.rollback()
        errors.append(f"row={ridx} INSERT/UPDATE 실패: {e}")
        continue

    # 매 행 commit — batch rollback 방지
    c.commit()

c.commit()

print("\n=== 결과 ===")
print(f"신규 INSERT: {inserted}")
print(f"기존 UPDATE: {updated}")
print(f"skipped: {skipped}")
print(f"errors: {len(errors)}")
for e in errors[:10]:
    print(f"  {e}")

cur.execute("SELECT count(*) FROM inventory_movements")
print(f"\n전체 inventory_movements: {cur.fetchone()[0]}")
cur.execute(
    "SELECT count(DISTINCT product_id), min(movement_date), max(movement_date) FROM inventory_movements"
)
print("DISTINCT product / 기간:", cur.fetchone())
cur.execute(
    "SELECT movement_type, count(*) FROM inventory_movements GROUP BY movement_type ORDER BY count(*) DESC"
)
print("movement_type 분포:")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}")
