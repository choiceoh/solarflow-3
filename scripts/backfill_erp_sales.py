"""
ERP 매출 시트(2,417행) → sales backfill (D-064 / PR 22).

정책 (D-064): 안전장치 < 데이터 살림. 충돌 시 ERP 가 더 신뢰.

흐름
1. ERP 매출 시트 행마다 (마감일자 sale_date, 마감번호 SC..., 순번 line_no, 품번, 마감수량, 고객, 단가)
2. 자연키 매칭 — outbound 후보:
   - outbound_date = 마감일자  AND  product_id = 매핑된 erp_code  AND  quantity = 마감수량
   - 다중 매칭이면 customer 이름으로 추가 필터
3. outbound 발견 → 그 outbound 의 sale 매칭 (sales.outbound_id)
   - sale 있음: erp_sales_no/erp_line_no/source_payload 채움 + 단가/공급가/세 머지
   - sale 없음: 신규 sale 생성, outbound_id 연결
4. outbound 없음 → sale 만 신규 생성 (outbound_id NULL, customer 매칭)
5. 충돌 — 같은 outbound 에 이미 sale 있는데 erp_sales_no 가 다름:
   - source_payload 에 history 보존 + ERP 최신값으로 덮어쓰기
6. 단가 0 (스페어/자체현장분) — 그대로 보존 (ERP 자체현장분 의도와 일치, status='draft')

매출 시트 행은 출고 시트와 별개의 line item — 같은 IS 출고에 여러 SC 매출이 가능.
"""
import os, re, json, sys, datetime, openpyxl, psycopg2

FILE = "/tmp/erp_data.xlsx"
SHEET = "매출"

# 컬럼 인덱스 (헤더 row 0)
COLS = {
    "sale_date": 0, "customer": 1, "kind": 2, "tax_kind": 3, "tax_class": 4,
    "sales_no": 5, "export_no": 6, "currency": 7, "line_no": 8,
    "erp_code": 9, "model": 10, "spec": 11, "unit": 12,
    "out_qty": 13, "stock_unit": 14, "stock_qty": 15,
    "unit_price": 16, "supply": 17, "vat": 18, "total": 19,
    "fx_unit_price": 20, "fx_total": 21,
    "mgmt": 22, "project": 23, "memo": 24, "memo_detail": 25,
    "salesperson": 26, "delivery_to": 27,
    "category": 28, "cat_l1": 29, "cat_l2": 30, "cat_l3": 31,
    "lot": 32, "account": 33, "procurement": 34,
    "cust_class_code": 35, "cust_class": 36, "team": 37,
    "region": 38, "region_group": 39, "project_group": 40,
}


def normalize_code(s):
    if not s:
        return ""
    chars = []
    for ch in str(s):
        c = ord(ch)
        if (ord("A") <= c <= ord("Z")) or (ord("0") <= c <= ord("9")):
            chars.append(ch)
        elif ord("a") <= c <= ord("z"):
            chars.append(chr(c - 32))
        elif 0xAC00 <= c <= 0xD7AF or 0x4E00 <= c <= 0x9FFF:
            chars.append(ch)
    return "".join(chars)


def normalize_corp(s):
    if not s:
        return ""
    out = str(s).replace("(주)", "").replace("㈜", "").replace("주식회사", "")
    return normalize_code(out)


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

# 탑솔라(주) — DOMESTIC 출고 신규 생성 시 default company
cur.execute("SELECT company_id FROM companies WHERE company_name LIKE '탑솔라%' LIMIT 1")
r = cur.fetchone()
topsolar_company = r[0] if r else None

cur.execute("SELECT warehouse_id FROM warehouses LIMIT 1")
default_wh = cur.fetchone()[0]

# D-064: ERP 관리구분 → SolarFlow usage_category (PR 21 동일)
ERP_MGMT_TO_USAGE = {
    "상품판매": "sale",
    "상품판매(스페어)": "sale_spare",
    "공사사용": "construction",
    "공사사용(파손)": "construction_damage",
    "유지관리(발전소)": "maintenance",
    "폐기": "disposal",
    "기타": "other",
}

# 매출 시트 처리
wb = openpyxl.load_workbook(FILE, data_only=True)
ws = wb[SHEET]
rows = list(ws.iter_rows(values_only=True))

filled_existing_sale = 0  # 기존 sale 매칭 + erp_sales_no 채움
new_sale_with_outbound = 0  # outbound 매칭됐는데 sale 없어서 신규
new_sale_without_outbound = 0  # outbound 도 없음 → sale 만 단독
conflict_overwrite = 0  # erp_sales_no 충돌 덮어쓰기
skipped = 0
errors = []

for ridx, row in enumerate(rows[1:], start=2):  # 1행 헤더
    if not row or not row[COLS["sales_no"]]:
        continue
    sales_no = str(row[COLS["sales_no"]]).strip()
    sale_date = to_iso(row[COLS["sale_date"]])
    erp_code = str(row[COLS["erp_code"]]).strip() if row[COLS["erp_code"]] else ""
    qty = to_int(row[COLS["out_qty"]])
    line_no = to_int(row[COLS["line_no"]]) or 1
    if not sale_date or not erp_code or not qty or qty <= 0:
        skipped += 1
        continue

    pmeta = prod_by_erp.get(erp_code)
    if not pmeta:
        skipped += 1
        errors.append(f"row={ridx} erp_code {erp_code} product 마스터 없음")
        continue
    pid, wattage = pmeta

    customer_raw = str(row[COLS["customer"]]).strip() if row[COLS["customer"]] else ""
    customer_norm = normalize_corp(customer_raw)
    customer_id = partner_idx.get(customer_norm)
    # 자동 partner 등록 (D-064: 데이터 살림 우선) — ERP 자료에서 처음 만난 거래처
    # 트랜잭션 격리: 다른 sale 행 INSERT 가 partner FK 를 참조하도록 partner 만 즉시 commit
    if not customer_id and customer_raw:
        try:
            cur.execute(
                """
            INSERT INTO partners (partner_name, partner_type, is_active)
            VALUES (%s, 'customer', true)
            RETURNING partner_id
            """,
                (customer_raw,),
            )
            customer_id = cur.fetchone()[0]
            c.commit()  # partner 즉시 commit — 후속 sale FK 참조 가능
            partner_idx[customer_norm] = customer_id
            try:
                cur.execute(
                    "INSERT INTO partner_aliases (canonical_partner_id, alias_text, alias_text_normalized) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                    (customer_id, customer_raw, customer_norm),
                )
                c.commit()
            except Exception:
                c.rollback()  # alias 실패는 무해
        except Exception as e:
            c.rollback()
            errors.append(f"row={ridx} partner 자동 등록 실패: {e}")
            customer_id = None

    unit_price = to_float(row[COLS["unit_price"]])
    supply = to_float(row[COLS["supply"]])
    vat = to_float(row[COLS["vat"]])
    total = to_float(row[COLS["total"]])
    fx_unit = to_float(row[COLS["fx_unit_price"]])
    fx_total = to_float(row[COLS["fx_total"]])
    currency = str(row[COLS["currency"]]).strip() if row[COLS["currency"]] else None
    project = str(row[COLS["project"]]).strip() if row[COLS["project"]] else ""
    mgmt = str(row[COLS["mgmt"]]).strip() if row[COLS["mgmt"]] else ""
    salesperson = str(row[COLS["salesperson"]]).strip() if row[COLS["salesperson"]] else ""
    cap_kw = (qty * wattage) if wattage > 0 else None
    unit_price_wp = float(unit_price / wattage / 1000.0) if (unit_price and wattage and wattage > 0) else 0.0

    # D-064: 모든 정보 누락 없이 source_payload 에 보존. 41개 컬럼 전부.
    def _s(key):
        v = row[COLS[key]]
        return str(v).strip() if v not in (None, "") else None

    erp_payload = {
        "erp_sale_date": sale_date,
        "erp_customer": customer_raw,
        "erp_kind": _s("kind"),
        "erp_tax_kind": _s("tax_kind"),
        "erp_tax_class": _s("tax_class"),
        "erp_sales_no": sales_no,
        "erp_export_no": _s("export_no"),
        "erp_currency": currency,
        "erp_line_no": line_no,
        "erp_code": erp_code,
        "erp_model": _s("model"),
        "erp_spec": _s("spec"),
        "erp_unit": _s("unit"),
        "erp_qty": qty,
        "erp_stock_unit": _s("stock_unit"),
        "erp_stock_qty": to_int(row[COLS["stock_qty"]]),
        "erp_unit_price": unit_price,
        "erp_supply": supply,
        "erp_vat": vat,
        "erp_total": total,
        "erp_fx_unit": fx_unit,
        "erp_fx_total": fx_total,
        "erp_management": mgmt,
        "erp_project": project,
        "erp_memo": _s("memo"),
        "erp_memo_detail": _s("memo_detail"),
        "erp_salesperson": salesperson,
        "erp_delivery_to": _s("delivery_to"),
        "erp_category": _s("category"),
        "erp_cat_l1": _s("cat_l1"),
        "erp_cat_l2": _s("cat_l2"),
        "erp_cat_l3": _s("cat_l3"),
        "erp_lot": _s("lot"),
        "erp_account": _s("account"),
        "erp_procurement": _s("procurement"),
        "erp_cust_class_code": _s("cust_class_code"),
        "erp_cust_class": _s("cust_class"),
        "erp_team": _s("team"),
        "erp_region": _s("region"),
        "erp_region_group": _s("region_group"),
        "erp_project_group": _s("project_group"),
        "erp_row": ridx,
    }
    erp_payload = {k: v for k, v in erp_payload.items() if v not in (None, "", "nan")}

    # outbound 매칭 시도 — 자연키
    cur.execute(
        """
    SELECT outbound_id FROM outbounds
    WHERE outbound_date = %s AND product_id = %s AND quantity = %s
    """,
        (sale_date, pid, qty),
    )
    out_candidates = [r[0] for r in cur.fetchall()]
    outbound_id = out_candidates[0] if out_candidates else None

    # outbound 매칭 안 됨 — D-064: ERP 매출은 정식 자료라 outbound 도 함께 신규 등록
    if not outbound_id:
        usage = ERP_MGMT_TO_USAGE.get(mgmt, "sale" if (unit_price and unit_price > 0) else "other")
        try:
            cur.execute(
                """
            INSERT INTO outbounds (
              outbound_date, company_id, product_id, quantity, capacity_kw,
              warehouse_id, usage_category, status, source_payload, site_name
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', %s::jsonb, %s)
            RETURNING outbound_id
            """,
                (
                    sale_date, topsolar_company, pid, qty, cap_kw, default_wh, usage,
                    json.dumps({"source": "erp_sales_sheet_implied", "erp_sales_no": sales_no, "erp_line_no": line_no, "erp_row": ridx}, ensure_ascii=False),
                    project[:100] if project else None,
                ),
            )
            outbound_id = cur.fetchone()[0]
        except Exception as e:
            c.rollback()
            errors.append(f"row={ridx} outbound 함께 신규 INSERT 실패: {e}")
            continue

    # status: sales_status_check 는 ('active','cancelled') 만 허용.
    # ERP 매출 자료는 모두 active 로 시작 (취소만 cancelled).
    status = "active"

    # 기존 sale 매칭: outbound_id 가 있으면 그 outbound 의 sale, 또는 erp_sales_no/line 으로
    sale_id = None
    current_erp_no = None
    current_pl = None
    if outbound_id:
        cur.execute(
            "SELECT sale_id, erp_sales_no, source_payload FROM sales WHERE outbound_id = %s LIMIT 1",
            (outbound_id,),
        )
        r = cur.fetchone()
        if r:
            sale_id, current_erp_no, current_pl = r

    if not sale_id:
        # erp_sales_no + line_no 키로도 한번 더 (재실행 멱등성)
        cur.execute(
            "SELECT sale_id, erp_sales_no, source_payload, outbound_id FROM sales WHERE erp_sales_no = %s AND erp_line_no = %s LIMIT 1",
            (sales_no, line_no),
        )
        r = cur.fetchone()
        if r:
            sale_id, current_erp_no, current_pl, _ = r

    if sale_id:
        # 매칭 — 머지 update
        new_pl = dict(current_pl) if isinstance(current_pl, dict) else {}
        new_pl.update(erp_payload)
        if current_erp_no and current_erp_no != sales_no:
            new_pl.setdefault("erp_sales_no_history", []).append(current_erp_no)
            conflict_overwrite += 1
        else:
            filled_existing_sale += 1
        try:
            cur.execute(
                """
            UPDATE sales SET
              erp_sales_no = %s, erp_line_no = %s, currency = %s,
              source_payload = %s::jsonb,
              unit_price_wp = COALESCE(NULLIF(%s, 0), unit_price_wp),
              unit_price_ea = COALESCE(%s, unit_price_ea),
              supply_amount = COALESCE(%s, supply_amount),
              vat_amount    = COALESCE(%s, vat_amount),
              total_amount  = COALESCE(%s, total_amount),
              quantity      = COALESCE(quantity, %s),
              capacity_kw   = COALESCE(capacity_kw, %s),
              tax_invoice_date = %s,
              erp_closed       = true,
              erp_closed_date  = %s,
              status        = CASE WHEN status = 'draft' THEN %s ELSE status END,
              updated_at    = now()
            WHERE sale_id = %s
            """,
                (
                    sales_no, line_no, currency,
                    json.dumps(new_pl, ensure_ascii=False),
                    unit_price_wp, unit_price, supply, vat, total,
                    qty, cap_kw,
                    sale_date, sale_date,
                    status, sale_id,
                ),
            )
        except Exception as e:
            c.rollback()
            errors.append(f"row={ridx} sale UPDATE 실패: {e}")
            continue
    else:
        # 신규 sale 등록 — customer_id 필수
        if not customer_id:
            skipped += 1
            errors.append(f"row={ridx} customer '{customer_raw}' 매칭 안됨 — 신규 sale skip")
            continue
        full_payload = dict(erp_payload)
        full_payload.update(
            {
                "source": "erp_sales_sheet",
                "erp_sales_no": sales_no,
                "erp_line_no": line_no,
                "erp_row": ridx,
            }
        )
        try:
            cur.execute(
                """
            INSERT INTO sales (
              outbound_id, customer_id, quantity, capacity_kw,
              unit_price_wp, unit_price_ea, supply_amount, vat_amount, total_amount,
              status, erp_sales_no, erp_line_no, currency, source_payload,
              tax_invoice_date, erp_closed, erp_closed_date, memo
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, true, %s, %s)
            RETURNING sale_id
            """,
                (
                    outbound_id, customer_id, qty, cap_kw,
                    unit_price_wp, unit_price, supply, vat, total,
                    status, sales_no, line_no, currency,
                    json.dumps(full_payload, ensure_ascii=False),
                    sale_date, sale_date,
                    project[:200] if project else None,
                ),
            )
            cur.fetchone()
            if outbound_id:
                new_sale_with_outbound += 1
            else:
                new_sale_without_outbound += 1
        except Exception as e:
            c.rollback()
            errors.append(f"row={ridx} 신규 sale INSERT 실패 ({sales_no}/{line_no}): {e}")
            continue

    if (filled_existing_sale + new_sale_with_outbound + new_sale_without_outbound) % 200 == 0:
        c.commit()  # 중간 커밋

c.commit()

print("\n=== 결과 ===")
print(f"기존 sale 매칭 + erp_sales_no 채움: {filled_existing_sale}")
print(f"기존 sale + erp_sales_no 충돌 덮어쓰기: {conflict_overwrite}")
print(f"신규 sale (outbound 매칭): {new_sale_with_outbound}")
print(f"신규 sale (outbound 없음 — 단독 매출 전표): {new_sale_without_outbound}")
print(f"skipped (customer/product 마스터 누락): {skipped}")
print(f"errors: {len(errors)}")
for e in errors[:10]:
    print(f"  {e}")

cur.execute("SELECT count(*) FROM sales WHERE erp_sales_no IS NOT NULL")
print(f"\nerp_sales_no 있는 sales: {cur.fetchone()[0]}")
cur.execute("SELECT count(*) FROM sales")
print(f"전체 sales: {cur.fetchone()[0]}")
