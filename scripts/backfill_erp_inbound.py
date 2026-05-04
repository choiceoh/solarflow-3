"""
ERP 입고 시트(118행) → inbounds 테이블 backfill (D-064 / PR 23).

정책 (D-064): 안전장치 < 데이터 살림. 모든 정보 누락 없이 보존.
- 마이그레이션 066 으로 inbounds 테이블 신규 생성 (outbounds 와 대칭)
- 입고 시트 35개 컬럼 전부 source_payload 에 zero-loss 보존
- erp_inbound_no + erp_line_no partial UNIQUE — 멱등 재실행
- 거래처(supplier) 자동 partner 등록
- 단가/공급가/부가세/외화 등 모두 inbounds 행에 기록
- 단가유형 (적용평균/계약 등) 도 source_payload 에 보존
- FIFO매칭키 컬럼은 source_payload.erp_fifo_key — 후속 PR 26 에서 활용
"""
import os, re, json, datetime, openpyxl, psycopg2

FILE = "/tmp/erp_data.xlsx"
SHEET = "입고"

# 컬럼 인덱스 (헤더 행 0)
COLS = {
    "kind": 0, "in_date": 1, "in_no": 2, "line_no": 3, "applied": 4,
    "supplier": 5, "currency": 6,
    "erp_code": 7, "model": 8, "spec": 9, "wp_unit_price": 10,
    "unit": 11, "in_qty": 12, "closed_qty": 13, "remain_qty": 14,
    "price_type": 15, "unit_price": 16, "applied_avg_price": 17,
    "supply": 18, "vat": 19, "total": 20, "applied_total": 21, "diff": 22,
    "fx_unit": 23, "applied_fx_avg": 24, "fx_amount": 25,
    "applied_fx_total": 26, "fx_diff": 27,
    "mgmt": 28, "project": 29, "memo": 30, "memo_detail": 31,
    "warehouse": 32, "location": 33, "fifo_key": 34,
}


def normalize_corp(s):
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

# 마스터 캐시
cur.execute("SELECT product_id, erp_code, wattage_kw FROM products")
prod_by_erp = {}
for pid, erp, w in cur.fetchall():
    if erp:
        prod_by_erp[erp] = (pid, float(w) if w else 0)

cur.execute("SELECT partner_id, partner_name FROM partners")
partner_idx = {normalize_corp(n): pid for pid, n in cur.fetchall()}
cur.execute("SELECT canonical_partner_id, alias_text_normalized FROM partner_aliases")
for pid, alias in cur.fetchall():
    partner_idx.setdefault(alias, pid)

cur.execute("SELECT warehouse_id, warehouse_name FROM warehouses")
wh_by_name = {}
default_wh = None
for wid, name in cur.fetchall():
    if default_wh is None:
        default_wh = wid
    if name:
        wh_by_name[normalize_corp(name)] = wid

wb = openpyxl.load_workbook(FILE, data_only=True)
ws = wb[SHEET]
rows = list(ws.iter_rows(values_only=True))

inserted = 0
updated = 0
skipped = 0
errors = []

for ridx, row in enumerate(rows[1:], start=2):
    if not row or not row[COLS["in_no"]]:
        continue
    in_no = str(row[COLS["in_no"]]).strip()
    in_date = to_iso(row[COLS["in_date"]])
    erp_code = str(row[COLS["erp_code"]]).strip() if row[COLS["erp_code"]] else ""
    qty = to_int(row[COLS["in_qty"]])
    line_no = to_int(row[COLS["line_no"]]) or 1
    if not in_date or not erp_code or not qty or qty <= 0:
        skipped += 1
        continue

    pmeta = prod_by_erp.get(erp_code)
    if not pmeta:
        skipped += 1
        errors.append(f"row={ridx} erp_code {erp_code} product 마스터 없음")
        continue
    pid, wattage = pmeta

    supplier_raw = str(row[COLS["supplier"]]).strip() if row[COLS["supplier"]] else ""
    supplier_norm = normalize_corp(supplier_raw)
    supplier_id = partner_idx.get(supplier_norm)
    if not supplier_id and supplier_raw:
        try:
            cur.execute(
                "INSERT INTO partners (partner_name, partner_type, is_active) VALUES (%s, 'supplier', true) RETURNING partner_id",
                (supplier_raw,),
            )
            supplier_id = cur.fetchone()[0]
            c.commit()
            partner_idx[supplier_norm] = supplier_id
            try:
                cur.execute(
                    "INSERT INTO partner_aliases (canonical_partner_id, alias_text, alias_text_normalized) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                    (supplier_id, supplier_raw, supplier_norm),
                )
                c.commit()
            except Exception:
                c.rollback()
        except Exception as e:
            c.rollback()
            errors.append(f"row={ridx} supplier 자동 등록 실패: {e}")

    wh_raw = str(row[COLS["warehouse"]]).strip() if row[COLS["warehouse"]] else ""
    wh_id = wh_by_name.get(normalize_corp(wh_raw)) if wh_raw else None
    if not wh_id:
        wh_id = default_wh

    unit_price = to_float(row[COLS["unit_price"]])
    wp_price = to_float(row[COLS["wp_unit_price"]])
    supply = to_float(row[COLS["supply"]])
    vat = to_float(row[COLS["vat"]])
    total = to_float(row[COLS["total"]])
    fx_unit = to_float(row[COLS["fx_unit"]])
    fx_amount = to_float(row[COLS["fx_amount"]])
    currency = str(row[COLS["currency"]]).strip() if row[COLS["currency"]] else None
    cap_kw = (qty * wattage) if wattage > 0 else None

    def _s(key):
        v = row[COLS[key]]
        return str(v).strip() if v not in (None, "") else None

    erp_payload = {
        "erp_in_date": in_date,
        "erp_kind": _s("kind"),
        "erp_in_no": in_no,
        "erp_line_no": line_no,
        "erp_applied": _s("applied"),
        "erp_supplier": supplier_raw,
        "erp_currency": currency,
        "erp_code": erp_code,
        "erp_model": _s("model"),
        "erp_spec": _s("spec"),
        "erp_wp_unit_price": wp_price,
        "erp_unit": _s("unit"),
        "erp_qty": qty,
        "erp_closed_qty": to_int(row[COLS["closed_qty"]]),
        "erp_remain_qty": to_int(row[COLS["remain_qty"]]),
        "erp_price_type": _s("price_type"),
        "erp_unit_price": unit_price,
        "erp_applied_avg_price": to_float(row[COLS["applied_avg_price"]]),
        "erp_supply": supply,
        "erp_vat": vat,
        "erp_total": total,
        "erp_applied_total": to_float(row[COLS["applied_total"]]),
        "erp_diff": to_float(row[COLS["diff"]]),
        "erp_fx_unit": fx_unit,
        "erp_applied_fx_avg": to_float(row[COLS["applied_fx_avg"]]),
        "erp_fx_amount": fx_amount,
        "erp_applied_fx_total": to_float(row[COLS["applied_fx_total"]]),
        "erp_fx_diff": to_float(row[COLS["fx_diff"]]),
        "erp_management": _s("mgmt"),
        "erp_project": _s("project"),
        "erp_memo": _s("memo"),
        "erp_memo_detail": _s("memo_detail"),
        "erp_warehouse": wh_raw,
        "erp_location": _s("location"),
        "erp_fifo_key": _s("fifo_key"),
        "erp_row": ridx,
    }
    erp_payload = {k: v for k, v in erp_payload.items() if v not in (None, "", "nan")}
    location = _s("location")
    memo = _s("memo")

    # 멱등: erp_inbound_no + line_no UNIQUE — UPDATE 우선, 없으면 INSERT
    cur.execute(
        "SELECT inbound_id FROM inbounds WHERE erp_inbound_no = %s AND erp_line_no = %s",
        (in_no, line_no),
    )
    r = cur.fetchone()
    try:
        if r:
            inbound_id = r[0]
            cur.execute(
                """
            UPDATE inbounds SET
              inbound_date = %s, supplier_partner_id = %s, product_id = %s,
              quantity = %s, capacity_kw = %s, warehouse_id = %s, location = %s,
              currency = %s, unit_price = %s, unit_price_wp = %s,
              supply_amount = %s, vat_amount = %s, total_amount = %s,
              source_payload = %s::jsonb, memo = %s
            WHERE inbound_id = %s
            """,
                (
                    in_date, supplier_id, pid, qty, cap_kw, wh_id, location,
                    currency, unit_price, wp_price, supply, vat, total,
                    json.dumps(erp_payload, ensure_ascii=False), memo, inbound_id,
                ),
            )
            updated += 1
        else:
            cur.execute(
                """
            INSERT INTO inbounds (
              inbound_date, supplier_partner_id, product_id, quantity, capacity_kw,
              warehouse_id, location, status, erp_inbound_no, erp_line_no, currency,
              unit_price, unit_price_wp, supply_amount, vat_amount, total_amount,
              source_payload, memo
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
            RETURNING inbound_id
            """,
                (
                    in_date, supplier_id, pid, qty, cap_kw, wh_id, location,
                    in_no, line_no, currency, unit_price, wp_price, supply, vat, total,
                    json.dumps(erp_payload, ensure_ascii=False), memo,
                ),
            )
            cur.fetchone()
            inserted += 1
    except Exception as e:
        c.rollback()
        errors.append(f"row={ridx} inbounds INSERT/UPDATE 실패 ({in_no}/{line_no}): {e}")
        continue

    if (inserted + updated) % 50 == 0:
        c.commit()

c.commit()

print("\n=== 결과 ===")
print(f"신규 INSERT: {inserted}")
print(f"기존 UPDATE (재실행 멱등): {updated}")
print(f"skipped: {skipped}")
print(f"errors: {len(errors)}")
for e in errors[:10]:
    print(f"  {e}")

cur.execute("SELECT count(*) FROM inbounds")
print(f"\n전체 inbounds: {cur.fetchone()[0]}")
cur.execute(
    "SELECT count(DISTINCT erp_inbound_no), count(DISTINCT supplier_partner_id), sum(quantity) FROM inbounds"
)
print("DISTINCT erp_inbound_no / supplier / total qty:", cur.fetchone())
