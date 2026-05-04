"""
ERP 수입면장 DB-3 시트(116행, 50컬럼) → import_declarations + bl_shipments backfill (D-064 / PR 24).

정책 (D-064): 모든 정보 누락 없이 보존. 50컬럼 zero-loss source_payload.
- 마이그레이션 067 으로 import_declarations 확장 컬럼 + source_payload 추가
- DB-3 시트는 탑솔라(주) 수입원가 분석 — B/L · 면장 · 유상/무상 · ★원가Wp단가
- bl_shipments 매칭: bl_number 자연키 (col26 또는 col11)
  - 매칭 안 되면 bl_shipments 신규 생성
- import_declarations 매칭/생성: declaration_number 자연키 (col10)
- product_id: col24 erp_code → products
- manufacturer_id: col3/col18 공급사(한글) → manufacturers
- company_id: '탑솔라(주)' 고정 (DB-3 시트 자체가 탑솔라)
"""
import os, re, json, datetime, openpyxl, psycopg2

FILE = "/tmp/erp_data.xlsx"
SHEET = "DB-3"
HEADER_ROW_IDX = 4  # 0-indexed: 행4 가 컬럼 헤더, 데이터는 행5+


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


# DB-3 컬럼 (행4 헤더 기준 0-indexed)
COLS = {
    "category_no": 0, "decl_check": 1, "importer": 2, "supplier_kr_main": 3,
    "model_main": 4, "spec_main": 5, "qty_main": 6, "invoice_check": 7, "memo_main": 8,
    "year": 9, "decl_no": 10, "bl_no": 11, "lc_no": 12, "invoice_no": 13,
    "decl_date": 14, "arrival_date": 15, "release_date": 16,
    "supplier_en": 17, "supplier_kr2": 18, "importer2": 19, "hs_code": 20,
    "customs_office": 21, "port": 22, "model": 23, "erp_code": 24, "spec": 25,
    "bl_no2": 26, "po_number": 27, "capacity_kw": 28, "capacity_mw": 29,
    "currency": 30, "contract_unit_usd_wp": 31, "contract_total_usd": 32,
    "incoterms": 33, "memo": 34,
    "exchange_rate": 35, "contract_total_krw": 36, "cif_krw": 37,
    "customs_rate": 38, "customs_amount": 39, "vat_amount": 40,
    "erp_inbound_no": 41, "decl_line_no": 42,
    "paid_qty": 43, "free_qty": 44, "free_ratio": 45,
    "paid_cif_krw": 46, "free_cif_krw": 47,
    "cost_wp_unit_price": 48, "cost_ea_unit_price": 49,
}

c = psycopg2.connect(os.environ["SUPABASE_DB_URL"])
c.autocommit = False
cur = c.cursor()

# 마스터 캐시
cur.execute("SELECT product_id, erp_code, product_code, wattage_kw FROM products")
prod_by_erp = {}
prod_by_code = {}
for pid, erp, code, w in cur.fetchall():
    pmeta = (pid, float(w) if w else 0)
    if erp:
        prod_by_erp[erp] = pmeta
    if code:
        prod_by_code[normalize(code)] = pmeta

cur.execute("SELECT manufacturer_id, name_kr, short_name FROM manufacturers")
mfg_idx = {}
for mid, kr, short in cur.fetchall():
    if kr:
        mfg_idx[normalize(kr)] = mid
    if short:
        mfg_idx[normalize(short)] = mid

# DB-3 시트 표기 → manufacturers 매칭 룰 (D-064: 데이터 살림)
MFG_ALIAS_RULES = [
    (r"진코|JINKO", "징코"),
    (r"론지|LONGI", "론지"),
    (r"트리나|TRINA", "트리나"),
    (r"한화|HANWHA|QCELLS", "한화"),
    (r"한솔|HANSOL", "한솔"),
    (r"^JA|JASOLAR", "JA"),
    (r"라이젠|RISEN", "라이젠"),
    (r"캐솔|캐나디안|CSI|CANADIAN", "캐솔"),
    (r"통웨이|TONGWEI", "통웨이"),
    (r"^SDN|에스디엔", "SDN"),
    (r"현대|HYUNDAI", "현대"),
]
MFG_ALIAS_RULES = [(re.compile(p, re.I), mfg_idx.get(normalize(kw))) for p, kw in MFG_ALIAS_RULES]


def infer_mfg(text):
    if not text:
        return None
    direct = mfg_idx.get(normalize(text))
    if direct:
        return direct
    for pat, mid in MFG_ALIAS_RULES:
        if mid and pat.search(text):
            return mid
    return None

cur.execute("SELECT company_id, company_name FROM companies")
comp_idx = {}
topsolar_company = None
for cid, name in cur.fetchall():
    n = normalize(name)
    comp_idx[n] = cid
    if "탑솔라" in (name or ""):
        topsolar_company = cid

cur.execute("SELECT bl_id, bl_number FROM bl_shipments")
bl_idx = {n: bid for bid, n in cur.fetchall() if n}

cur.execute("SELECT warehouse_id FROM warehouses LIMIT 1")
default_wh = cur.fetchone()[0]

if not topsolar_company:
    raise SystemExit("탑솔라(주) company 없음 — companies 테이블 확인 필요")

# 시트 처리
wb = openpyxl.load_workbook(FILE, data_only=True)
ws = wb[SHEET]
rows = list(ws.iter_rows(values_only=True))

bl_created = 0
decl_inserted = 0
decl_updated = 0
skipped = 0
errors = []

for ridx, row in enumerate(rows[HEADER_ROW_IDX + 1 :], start=HEADER_ROW_IDX + 2):
    if not row or row[COLS["decl_no"]] in (None, ""):
        continue
    decl_no = str(row[COLS["decl_no"]]).strip()
    decl_date = to_iso(row[COLS["decl_date"]])
    erp_code = str(row[COLS["erp_code"]]).strip() if row[COLS["erp_code"]] else ""
    bl_no = str(row[COLS["bl_no2"]] or row[COLS["bl_no"]] or "").strip()
    qty = to_int(row[COLS["qty_main"]])

    if not decl_date or not erp_code or not qty:
        skipped += 1
        errors.append(f"row={ridx} 필수 누락: decl_no={decl_no} date={decl_date} erp_code={erp_code} qty={qty}")
        continue

    pmeta = prod_by_erp.get(erp_code)
    if not pmeta:
        # fallback: 모델명으로 매칭
        model_str = str(row[COLS["model"]] or row[COLS["model_main"]] or "").strip()
        pmeta = prod_by_code.get(normalize(model_str))
    if not pmeta:
        skipped += 1
        errors.append(f"row={ridx} erp_code {erp_code} model={row[COLS['model']]} product 마스터 없음")
        continue
    pid, wattage = pmeta
    cap_kw = to_float(row[COLS["capacity_kw"]]) or (qty * wattage if wattage else None)

    # B/L 매칭/생성
    bl_id = bl_idx.get(bl_no) if bl_no else None
    supplier_kr = str(row[COLS["supplier_kr_main"]] or row[COLS["supplier_kr2"]] or "").strip()
    supplier_en = str(row[COLS["supplier_en"]] or "").strip()
    mfg_id = infer_mfg(supplier_kr) or infer_mfg(supplier_en) or infer_mfg(str(row[COLS["model"]] or ""))

    if not bl_id and bl_no:
        if not mfg_id:
            errors.append(f"row={ridx} BL 신규 생성 위해 manufacturer 추론 실패 ({supplier_kr})")
        try:
            cur.execute(
                """
            INSERT INTO bl_shipments (
              bl_number, company_id, manufacturer_id, inbound_type, currency,
              exchange_rate, eta, actual_arrival, port, invoice_number,
              status, declaration_number, cif_amount_krw, memo
            ) VALUES (%s, %s, %s, 'import', %s, %s, %s, %s, %s, %s, 'arrived', %s, %s, %s)
            RETURNING bl_id
            """,
                (
                    bl_no,
                    topsolar_company,
                    mfg_id,
                    str(row[COLS["currency"]] or "USD")[:10],
                    to_float(row[COLS["exchange_rate"]]),
                    to_iso(row[COLS["arrival_date"]]),
                    to_iso(row[COLS["arrival_date"]]),
                    str(row[COLS["port"]] or "")[:50] or None,
                    str(row[COLS["invoice_no"]] or "")[:100] or None,
                    decl_no,
                    int(to_float(row[COLS["cif_krw"]]) or 0) if to_float(row[COLS["cif_krw"]]) else None,
                    str(row[COLS["memo"]] or "")[:1000] or None,
                ),
            )
            bl_id = cur.fetchone()[0]
            bl_idx[bl_no] = bl_id
            c.commit()  # FK 참조 위해 즉시 commit
            bl_created += 1
        except Exception as e:
            c.rollback()
            errors.append(f"row={ridx} BL '{bl_no}' 신규 생성 실패: {e}")
            continue

    if not bl_id:
        skipped += 1
        errors.append(f"row={ridx} bl_no '{bl_no}' 매칭 안 됨, 신규 생성도 실패")
        continue

    # source_payload — 50컬럼 전부
    payload = {}
    for key, idx in COLS.items():
        v = row[idx]
        if v in (None, ""):
            continue
        if isinstance(v, datetime.date):
            v = v.strftime("%Y-%m-%d")
        payload[f"erp_{key}"] = v if isinstance(v, (int, float, str)) else str(v)
    payload["erp_row"] = ridx

    # import_declarations UPSERT
    cur.execute(
        "SELECT declaration_id FROM import_declarations WHERE declaration_number = %s",
        (decl_no,),
    )
    existing = cur.fetchone()
    fields = dict(
        bl_id=bl_id,
        company_id=topsolar_company,
        declaration_date=decl_date,
        arrival_date=to_iso(row[COLS["arrival_date"]]),
        release_date=to_iso(row[COLS["release_date"]]),
        hs_code=str(row[COLS["hs_code"]] or "")[:50] or None,
        customs_office=str(row[COLS["customs_office"]] or "")[:100] or None,
        port=str(row[COLS["port"]] or "")[:50] or None,
        memo=str(row[COLS["memo_main"]] or row[COLS["memo"]] or "")[:1000] or None,
        lc_no=str(row[COLS["lc_no"]] or "") or None,
        invoice_no=str(row[COLS["invoice_no"]] or "") or None,
        bl_number=bl_no or None,
        supplier_name_en=supplier_en or None,
        supplier_name_kr=supplier_kr or None,
        po_number=str(row[COLS["po_number"]] or "") or None,
        exchange_rate=to_float(row[COLS["exchange_rate"]]),
        contract_unit_price_usd_wp=to_float(row[COLS["contract_unit_usd_wp"]]),
        contract_total_usd=to_float(row[COLS["contract_total_usd"]]),
        contract_total_krw=to_float(row[COLS["contract_total_krw"]]),
        cif_krw=to_float(row[COLS["cif_krw"]]),
        incoterms=str(row[COLS["incoterms"]] or "") or None,
        customs_rate=to_float(row[COLS["customs_rate"]]),
        customs_amount=to_float(row[COLS["customs_amount"]]),
        vat_amount=to_float(row[COLS["vat_amount"]]),
        paid_qty=to_int(row[COLS["paid_qty"]]),
        free_qty=to_int(row[COLS["free_qty"]]),
        free_ratio=to_float(row[COLS["free_ratio"]]),
        paid_cif_krw=to_float(row[COLS["paid_cif_krw"]]),
        free_cif_krw=to_float(row[COLS["free_cif_krw"]]),
        cost_unit_price_wp=to_float(row[COLS["cost_wp_unit_price"]]),
        cost_unit_price_ea=to_float(row[COLS["cost_ea_unit_price"]]),
        product_id=pid,
        quantity=qty,
        capacity_kw=cap_kw,
        erp_inbound_no=str(row[COLS["erp_inbound_no"]] or "") or None,
        declaration_line_no=str(row[COLS["decl_line_no"]] or "") or None,
        source_payload=json.dumps(payload, ensure_ascii=False),
    )
    try:
        if existing:
            decl_id = existing[0]
            set_clause = ", ".join(f"{k} = %s" for k in fields.keys()) + ", updated_at = now()"
            sql = f"UPDATE import_declarations SET {set_clause} WHERE declaration_id = %s"
            params = list(fields.values()) + [decl_id]
            # source_payload 는 jsonb 캐스트 필요 — placeholders 변환
            sql = sql.replace("source_payload = %s", "source_payload = %s::jsonb")
            cur.execute(sql, params)
            decl_updated += 1
        else:
            cols = ["declaration_number"] + list(fields.keys())
            vals_ph = ["%s"] * len(cols)
            # source_payload 인덱스 찾아 cast
            sp_idx = cols.index("source_payload")
            vals_ph[sp_idx] = "%s::jsonb"
            sql = f"INSERT INTO import_declarations ({', '.join(cols)}) VALUES ({', '.join(vals_ph)})"
            params = [decl_no] + list(fields.values())
            cur.execute(sql, params)
            decl_inserted += 1
    except Exception as e:
        c.rollback()
        errors.append(f"row={ridx} declaration {decl_no} INSERT/UPDATE 실패: {e}")
        continue

    # 행마다 즉시 commit — 트랜잭션 격리로 다음 행 실패가 이전 성공행을 rollback 시키는 것 방지
    c.commit()

c.commit()

print("\n=== 결과 ===")
print(f"declaration 신규 INSERT: {decl_inserted}")
print(f"declaration UPDATE: {decl_updated}")
print(f"BL 신규 생성: {bl_created}")
print(f"skipped: {skipped}")
print(f"errors: {len(errors)}")
for e in errors[:10]:
    print(f"  {e}")

cur.execute("SELECT count(*) FROM import_declarations")
print(f"\n전체 import_declarations: {cur.fetchone()[0]}")
cur.execute("SELECT count(DISTINCT declaration_number), count(DISTINCT bl_id), sum(quantity) FROM import_declarations")
print("DISTINCT decl_no / bl_id / total qty:", cur.fetchone())
cur.execute("SELECT count(*) FROM bl_shipments")
print(f"전체 bl_shipments: {cur.fetchone()[0]}")
