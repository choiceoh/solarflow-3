"""
ERP FIFO 시트 backfill — 디원화신fifo (728행) + 탑솔라Fifo_복사본 (2,615행) → fifo_matches (D-064 / PR 26).

정책 (D-064): 모든 컬럼 누락 없이 보존, 안전장치보다 데이터 살림.
- 마이그레이션 070 fifo_matches 테이블 신규
- FIFO 한 행 = (입고 LOT, 출고) 쌍 + 배분수량 + 원가/판매단가/이익
- inbound_id (PR 23), outbound_id (PR 21), declaration_id (PR 24) cross-link
- 멱등 키: erp_row + source ('fifo_topsolar'|'fifo_diwon')
"""
import os, re, json, datetime, openpyxl, psycopg2

FILE = "/tmp/erp_data.xlsx"

SHEETS = [
    ("탑솔라Fifo_복사본", "fifo_topsolar"),
    ("디원화신fifo", "fifo_diwon"),
]

COLS = {
    "erp_code": 0, "model": 1, "spec": 2,
    "in_kind": 3, "in_date": 4, "in_no": 5, "in_line_no": 6, "supplier": 7,
    "wp_unit_price": 8, "ea_unit_cost": 9, "lot_in_qty": 10,
    "out_date": 11, "out_no": 12, "customer": 13, "mgmt": 14, "project": 15,
    "out_qty_origin": 16, "allocated_qty": 17, "cost_amount": 18,
    "sales_unit_ea": 19, "sales_amount": 20, "profit_amount": 21, "profit_ratio": 22,
    "category_no": 23, "decl_no": 24, "bl_no": 25, "lc_no": 26,
    "procurement": 27, "corporation": 28, "manufacturer_kr": 29,
    "manufacturer_en": 30, "po_match_date": 31,
    "extra_32": 32, "extra_33": 33, "extra_34": 34, "extra_35": 35, "extra_36": 36,
    "po_number": 37, "extra_38": 38, "extra_39": 39,
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

cur.execute("SELECT product_id, erp_code, product_code FROM products")
prod_by_erp = {}
prod_by_code = {}
for pid, erp, code in cur.fetchall():
    if erp:
        prod_by_erp[erp] = pid
    if code:
        prod_by_code[normalize(code)] = pid

# 입고/출고/면장 cross-key 캐시 (PR 21/23/24 결과 활용)
cur.execute("SELECT inbound_id, erp_inbound_no, erp_line_no FROM inbounds WHERE erp_inbound_no IS NOT NULL")
inb_idx = {(no, ln): iid for iid, no, ln in cur.fetchall()}

cur.execute("SELECT outbound_id, erp_outbound_no FROM outbounds WHERE erp_outbound_no IS NOT NULL")
outb_idx = {}
for oid, no in cur.fetchall():
    outb_idx.setdefault(no, oid)  # 첫 매칭만

cur.execute("SELECT declaration_id, declaration_number FROM import_declarations")
decl_idx = {n: did for did, n in cur.fetchall() if n}

wb = openpyxl.load_workbook(FILE, data_only=True)

total_inserted = 0
total_updated = 0
total_skipped = 0
total_errors = []

for sheet_name, source_tag in SHEETS:
    if sheet_name not in wb.sheetnames:
        continue
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))
    print(f"\n=== 시트 {sheet_name} ({source_tag}) — 데이터 행: {len(rows) - 1} ===")
    inserted = 0
    updated = 0
    skipped = 0

    for ridx, row in enumerate(rows[1:], start=2):
        if not row or row[COLS["erp_code"]] in (None, ""):
            continue
        erp_code = str(row[COLS["erp_code"]]).strip()
        # 일부 행은 erp_code 가 모델명 그대로 들어 있음 (M- prefix 없음)
        pid = prod_by_erp.get(erp_code)
        if not pid:
            pid = prod_by_code.get(normalize(erp_code))
        if not pid:
            # model 로 fallback
            mdl = str(row[COLS["model"]] or "").strip()
            pid = prod_by_code.get(normalize(mdl))
        if not pid:
            skipped += 1
            total_errors.append(f"{sheet_name} row={ridx} 매칭 안됨 erp_code={erp_code} model={row[COLS['model']]}")
            continue

        in_no = str(row[COLS["in_no"]] or "").strip() or None
        in_line = to_int(row[COLS["in_line_no"]])
        out_no = str(row[COLS["out_no"]] or "").strip() or None
        decl_no = str(row[COLS["decl_no"]] or "").strip() or None

        inbound_id = inb_idx.get((in_no, in_line)) if in_no and in_line else None
        outbound_id = outb_idx.get(out_no) if out_no else None
        declaration_id = decl_idx.get(decl_no) if decl_no else None

        payload = {}
        for key, idx in COLS.items():
            v = row[idx] if idx < len(row) else None
            if v in (None, ""):
                continue
            if isinstance(v, datetime.date):
                v = v.strftime("%Y-%m-%d")
            payload[f"erp_{key}"] = v if isinstance(v, (int, float, str)) else str(v)
        payload["erp_row"] = ridx

        fields = dict(
            erp_inbound_no=in_no,
            erp_inbound_line_no=in_line,
            inbound_id=inbound_id,
            inbound_date=to_iso(row[COLS["in_date"]]),
            inbound_kind=str(row[COLS["in_kind"]] or "").strip() or None,
            supplier_name=str(row[COLS["supplier"]] or "").strip() or None,
            erp_outbound_no=out_no,
            outbound_id=outbound_id,
            outbound_date=to_iso(row[COLS["out_date"]]),
            customer_name=str(row[COLS["customer"]] or "").strip() or None,
            product_id=pid,
            lot_inbound_qty=to_int(row[COLS["lot_in_qty"]]),
            outbound_qty_origin=to_int(row[COLS["out_qty_origin"]]),
            allocated_qty=to_int(row[COLS["allocated_qty"]]),
            wp_unit_price=to_float(row[COLS["wp_unit_price"]]),
            ea_unit_cost=to_float(row[COLS["ea_unit_cost"]]),
            cost_amount=to_float(row[COLS["cost_amount"]]),
            sales_unit_price_ea=to_float(row[COLS["sales_unit_ea"]]),
            sales_amount=to_float(row[COLS["sales_amount"]]),
            profit_amount=to_float(row[COLS["profit_amount"]]),
            profit_ratio=to_float(row[COLS["profit_ratio"]]),
            usage_category_raw=str(row[COLS["mgmt"]] or "").strip() or None,
            project=str(row[COLS["project"]] or "").strip() or None,
            procurement_type=str(row[COLS["procurement"]] or "").strip() or None,
            corporation=str(row[COLS["corporation"]] or "").strip() or None,
            manufacturer_name_kr=str(row[COLS["manufacturer_kr"]] or "").strip() or None,
            manufacturer_name_en=str(row[COLS["manufacturer_en"]] or "").strip() or None,
            declaration_id=declaration_id,
            declaration_number=decl_no,
            bl_number=str(row[COLS["bl_no"]] or "").strip() or None,
            lc_number=str(row[COLS["lc_no"]] or "").strip() or None,
            category_no=str(row[COLS["category_no"]] or "").strip() or None,
            po_number=str(row[COLS["po_number"]] or "").strip() or None,
            source_payload=json.dumps(payload, ensure_ascii=False),
        )

        cur.execute(
            "SELECT match_id FROM fifo_matches WHERE source = %s AND source_payload->>'erp_row' = %s",
            (source_tag, str(ridx)),
        )
        existing = cur.fetchone()
        try:
            if existing:
                mid = existing[0]
                set_clause = ", ".join(f"{k} = %s" for k in fields.keys())
                sql = f"UPDATE fifo_matches SET {set_clause} WHERE match_id = %s"
                sql = sql.replace("source_payload = %s", "source_payload = %s::jsonb")
                cur.execute(sql, list(fields.values()) + [mid])
                updated += 1
            else:
                cols = list(fields.keys()) + ["source"]
                vals_ph = ["%s"] * len(fields)
                sp_idx = list(fields.keys()).index("source_payload")
                vals_ph[sp_idx] = "%s::jsonb"
                vals_ph += ["%s"]
                sql = f"INSERT INTO fifo_matches ({', '.join(cols)}) VALUES ({', '.join(vals_ph)})"
                cur.execute(sql, list(fields.values()) + [source_tag])
                inserted += 1
            c.commit()
        except Exception as e:
            c.rollback()
            total_errors.append(f"{sheet_name} row={ridx} INSERT/UPDATE 실패: {e}")
            continue

    print(f"  신규 INSERT: {inserted}, UPDATE: {updated}, skipped: {skipped}")
    total_inserted += inserted
    total_updated += updated
    total_skipped += skipped

print("\n=== 전체 결과 ===")
print(f"신규 INSERT: {total_inserted}")
print(f"UPDATE: {total_updated}")
print(f"skipped: {total_skipped}")
print(f"errors: {len(total_errors)}")
for e in total_errors[:10]:
    print(f"  {e}")

cur.execute(
    "SELECT count(*), count(*) FILTER (WHERE inbound_id IS NOT NULL), count(*) FILTER (WHERE outbound_id IS NOT NULL), count(*) FILTER (WHERE declaration_id IS NOT NULL) FROM fifo_matches"
)
total, w_inb, w_out, w_decl = cur.fetchone()
print(f"\n전체 fifo_matches: {total}")
print(f"  inbound_id 매칭: {w_inb} ({w_inb*100//total if total else 0}%)")
print(f"  outbound_id 매칭: {w_out} ({w_out*100//total if total else 0}%)")
print(f"  declaration_id 매칭: {w_decl} ({w_decl*100//total if total else 0}%)")
cur.execute("SELECT corporation, count(*), sum(allocated_qty), sum(sales_amount), sum(profit_amount) FROM fifo_matches GROUP BY corporation ORDER BY count(*) DESC")
print("법인별 집계:")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}건 / 배분 {r[2]}EA / 매출 {r[3]} / 이익 {r[4]}")
