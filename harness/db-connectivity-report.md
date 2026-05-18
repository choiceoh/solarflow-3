# SolarFlow DB Reference (for AI Agents)

목적: AI 에이전트가 DB 쿼리/마이그/분석 작업 시 즉시 참조하는 구조화 자료.
사람용 narrative 가 아니라 **schema / join key / enum / 함정 카탈로그**.

---

## 0. 운영 환경

- DB: **Supabase hosted PostgreSQL** (`aalxpmfnsjzmhsfkuxnp.supabase.co`)
- 접근:
  - Go backend: Supabase REST/Auth (supa.Client)
  - Rust engine: `SUPABASE_DB_URL` 직접 sqlx (pool=5)
  - 진단: `ssh choiceoh@100.105.145.6` → `engine/.env` 의 `SUPABASE_DB_URL`
- 스키마: `public` 만 사용
- 마이그 위치: `backend/migrations/NNN_*.sql`, 적용은 `scripts/apply_migrations.ts` + `verify_migration.ts`
- 스키마 캐시: PostgREST `NOTIFY pgrst, 'reload schema'` (apply_migrations 자동)

---

## 1. 회사 (tenant) 식별자

| code | company_id | name |
|---|---|---|
| TS | `99f0fc15-0555-4a41-a025-8bf3630a7947` | 탑솔라(주) — module |
| DW | `84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c` | 디원 |
| BR | `e41f100b-c63d-4c87-b02d-e305af610018` | 바로(주) — baro |
| HS | `a9c3c675-8ed5-4a33-80e7-190d25888e80` | 화신이엔지 |

**모든 데이터 격리는 `company_id` 단위.** outbounds/orders/bl_shipments/import_declarations 등 핵심 테이블에 직접 컬럼.

---

## 2. 핵심 도메인 흐름

### 2.1 매입 → 수입 → 입고

```
purchase_orders (0)        ─── 발주 (운용 안 함)
  ↓ po_id
bl_shipments (150)         ─── BL 마스터
  ├── bl_line_items (153)         ─── BL 안 모델/수량 라인
  ├── import_declarations (101)   ─── 면장 (회사·BL 단위)
  │     └── cost_details (100)    ─── landed cost (CIF/관세/landed_total)
  └── incidental_expenses (0)     ─── 부대비용 (운임/통관 등, 미입력)

inbounds (117)             ─── 실입고 (창고 도착 후)
```

### 2.2 출고 → 매출 → 수금

```
orders (602)               ─── 수주 (분할 가능)
  ↓ order_id
outbounds (3369)           ─── 출고 (창고에서 현장/고객으로)
  ├── outbound_bl_items (2963) ─── 출고 ↔ BL 다대다 (분할 출고)
  ├── fifo_matches (3326)      ─── 출고 ↔ 입고 FIFO 매칭 (원가)
  └── sales (3116)             ─── 매출 (세금계산서/공급가)
        ↓ sale_id
        receipt_matches (2637) ─── 매출 ↔ 수금 매칭
        ↑ receipt_id
        receipts (2637)        ─── 수금 (입금)
```

### 2.3 원가 산정 사슬 (margin-analysis)

```
outbounds.outbound_id
  → fifo_matches (출고 → 입고 매칭)
      → fifo_matches.declaration_id
        → import_declarations.cif_krw / cost_unit_price_ea  (CIF 기준)
        → cost_details.landed_total_krw                     (부대비용 포함 정본, M116 백필 후)
```

---

## 3. 테이블 카탈로그 (핵심)

### bl_shipments — BL 마스터

- PK: `bl_id` (uuid)
- 자연 키: `bl_number` (varchar, unique in practice)
- 테넌트: `company_id`
- 주요 컬럼: `bl_number, inbound_type, currency, exchange_rate, etd, eta, actual_arrival, port, forwarder, status, declaration_number, cif_amount_krw, manufacturer_id`
- inbound_type: `import | domestic | domestic_foreign | group`
- status: `scheduled | shipping | arrived | customs | completed | erp_done`
- currency: `USD | KRW`
- 참조 받는 곳: bl_line_items, import_declarations, incidental_expenses, outbound_bl_items, orders, outbounds(deprecated), inventory_allocations

### bl_line_items — BL 안 모델 라인

- PK: `bl_line_id`
- FK: `bl_id → bl_shipments` (ON DELETE CASCADE), `product_id → products`
- item_type: `main | spare`
- payment_type: `paid | free`
- usage_category: `sale | construction | spare | replacement | repowering | transfer | adjustment`
- 인덱스: `(bl_id, product_id)`

### import_declarations — 면장

- PK: `declaration_id`
- 자연 키: `declaration_number` (UNIQUE)
- FK: `bl_id → bl_shipments`, `company_id → companies`, `product_id → products`
- 핵심 컬럼: `cif_krw, exchange_rate, contract_unit_price_usd_wp, contract_total_usd, customs_rate, customs_amount, vat_amount, paid_qty, free_qty, paid_cif_krw, free_cif_krw, cost_unit_price_wp, cost_unit_price_ea, quantity, capacity_kw, erp_inbound_no`
- 한 BL 에 여러 면장 가능 (다면장 케이스 존재 — SUM 필요)

### cost_details — landed cost 정본 (M116)

- PK: `cost_id`
- FK: `declaration_id, product_id`
- 핵심: `cif_total_krw, cif_wp_krw, tariff_amount, customs_fee, incidental_cost, landed_total_krw, landed_wp_krw`
- 상태: customs_fee/incidental_cost 는 NULL (외부 자료 필요)

### incidental_expenses — 부대비용 (EMPTY)

- PK: `expense_id`
- FK: `bl_id | outbound_id | (month)` 중 하나 필수 (CHECK)
- expense_type: `dock_charge | shuttle | customs_fee | transport | storage | handling | surcharge | lc_fee | lc_acceptance | telegraph | other`
- **현재 0건** — 회계 분개 자료 받기 전까지 비어있음

### outbounds — 출고

- PK: `outbound_id`
- FK: `company_id, product_id, warehouse_id, order_id?, target_company_id?, dispatch_route_id?`
- usage_category: `sale | sale_spare | construction | construction_damage | repowering | maintenance | disposal | transfer | adjustment | other`
- status: `active | cancel_pending | cancelled`
- 핵심: `outbound_date, quantity, capacity_kw, site_name, site_address, erp_outbound_no, group_trade, target_company_id`
- 워크플로우 플래그 (D-055): `tx_statement_ready, inspection_request_sent, approval_requested, tax_invoice_issued`
- ⚠️ `bl_id` 컬럼은 deprecated (M115 DROP 예정, `outbound_bl_items` 가 정본)

### outbound_bl_items — 출고 ↔ BL 다대다

- PK: `outbound_bl_item_id`
- UNIQUE 없음 (운용상 `(outbound_id, bl_id)` 유일 가정)
- CHECK: `quantity > 0`
- 한 출고가 여러 BL 에서 분할 출고된 경우 다중 행

### fifo_matches — 출고 ↔ 입고 FIFO 매칭

- PK: `match_id`
- FK: `inbound_id, outbound_id, product_id, declaration_id`
- 핵심: `allocated_qty, ea_unit_cost, cost_amount, sales_unit_price_ea, sales_amount, profit_amount, usage_category_raw`
- `usage_category_raw` 는 **한글** (ERP 원본): `상품판매 / 공사사용 / 상품판매(스페어) / 공사사용(파손) / 유지관리(발전소) / 폐기 / 기타`
- `corporation` 컬럼: 한글 회사명 (`탑솔라 / 디원 / 화신`)
- `ea_unit_cost` ≒ `import_declarations.cost_unit_price_ea` (= cif_krw/qty), 즉 면장 CIF 만 사용 (부대비용 미반영)

### sales — 매출

- PK: `sale_id`
- FK: `customer_id → partners, outbound_id → outbounds, order_id?`
- status: `active | cancelled` (기본 active)
- 핵심: `supply_amount, vat_amount, total_amount, tax_invoice_date, unit_price_wp, unit_price_ea, capacity_kw`
- `supply_amount` = 공급가액 (VAT 제외, 재무제표 "상품매출"과 매칭)
- `total_amount` = 공급가 + 부가세
- 모든 매출은 `usage_category='sale'` 출고에만 잡힘 (다른 카테고리는 0)

### receipts / receipt_matches — 수금

- receipts: 입금 (bank_account_id, customer_id, amount, date)
- receipt_matches: 입금 ↔ 매출 매칭 (`receipt_id, sale_id, outbound_id`)

### orders — 수주

- PK: `order_id`
- FK: `company_id, customer_id (=partner), product_id, bl_id?, site_id?`
- 한 수주 → 여러 출고 가능 (`outbounds.order_id`)

---

## 4. 비즈니스 enum 카탈로그

### 4.1 카테고리 매핑 (한글 ↔ 영문)

| fifo_matches.usage_category_raw | outbounds.usage_category | bl_line_items.usage_category |
|---|---|---|
| 상품판매 | sale | sale |
| 상품판매(스페어) | sale_spare | spare |
| 공사사용 | construction | construction |
| 공사사용(파손) | construction_damage | - |
| 유지관리(발전소) | maintenance | - |
| 폐기 | disposal | - |
| 기타 | other | - |
| - | repowering | repowering |
| - | transfer | transfer |
| - | adjustment | adjustment |
| - | - | replacement |

### 4.2 매출 / 비매출 정책

- **매출 (외부 판매)**: `outbounds.usage_category IN ('sale', 'sale_spare')`
  - `sales.supply_amount > 0` 로 매핑됨
  - 매출분석 / sales_dashboard / margin-analysis 가 이 필터 적용
- **비매출**: construction / construction_damage / maintenance / disposal / repowering / transfer / adjustment / other
  - `sales.supply_amount = 0` 또는 sales 행 없음
  - 회계상 타계정대체

### 4.3 sales.status / outbounds.status

- sales.status: `active | cancelled` (기본 active)
- outbounds.status: `active | cancel_pending | cancelled`
- `sales.status <> 'cancelled'` 가 매출 합계의 표준 필터

### 4.4 import_declarations.incoterms

- `CIF | FOB | DDP` 등 (자유 텍스트)
- 현재 운영 데이터는 대부분 CIF

### 4.5 매출 인식 시점 (bin_date)

```sql
COALESCE(s.tax_invoice_date::date, o.outbound_date::date, ord.order_date::date)
```

- `sales_dashboard` RPC ([073](backend/migrations/073_sales_dashboard_rpc.sql)) 와 SalesAnalysisPage 가 동일 로직 사용

### 4.6 수주 트렌드 binning (orders_dashboard.trend24)

```sql
COALESCE(
  (SELECT MIN(s.tax_invoice_date::date)
     FROM sales s WHERE s.order_id = o.order_id
       AND s.status <> 'cancelled' AND s.tax_invoice_date IS NOT NULL),
  o.order_date::date
)
```

- `orders_dashboard` RPC ([131](backend/migrations/131_orders_dashboard_trend_invoice_binning.sql)) 의 `trend24` 만 적용.
  totals (recent_30 포함) / by_* breakdowns / unit_price_ma15_180 은 `order_date` 기준 유지.
- 배경: ERP 도입(2025-12) 이전 수주는 사후 등록돼 `order_date` 가 도입 시점에 몰려 있다 → § 6.11.
- 한 수주에 여러 매출이 매핑되면 `MIN`(첫 매출일) 사용. 매출 매핑이 없으면 `order_date` 폴백.

---

## 5. 자주 쓰는 JOIN 키

### 5.1 출고 한 행에 필요한 모든 메타

```sql
SELECT o.*, p.product_name, p.spec_wp, p.manufacturer_id,
       w.warehouse_name, tc.company_name AS target_company_name,
       ord.order_number, s.supply_amount, s.tax_invoice_date
FROM outbounds o
LEFT JOIN products p     ON p.product_id     = o.product_id
LEFT JOIN orders ord     ON ord.order_id     = o.order_id
LEFT JOIN warehouses w   ON w.warehouse_id   = o.warehouse_id
LEFT JOIN companies tc   ON tc.company_id    = o.target_company_id
LEFT JOIN sales s        ON s.outbound_id    = o.outbound_id AND s.status <> 'cancelled'
WHERE o.company_id = '99f0fc15-...';
```

### 5.2 출고 → BL 사슬

```sql
-- 다대다 (정본)
SELECT o.outbound_id, b.bl_id, b.bl_number, obi.quantity
FROM outbounds o
JOIN outbound_bl_items obi ON obi.outbound_id = o.outbound_id
JOIN bl_shipments b ON b.bl_id = obi.bl_id;
```

### 5.3 매출원가 (FIFO 기반)

```sql
SELECT fm.outbound_id, fm.allocated_qty,
       fm.ea_unit_cost,      -- CIF/qty (부대비용 미반영)
       cd.landed_total_krw,  -- M116 후 정본 (incidental 가산 가능)
       id.bl_id, b.bl_number
FROM fifo_matches fm
LEFT JOIN import_declarations id ON id.declaration_id = fm.declaration_id
LEFT JOIN cost_details cd ON cd.declaration_id = fm.declaration_id AND cd.product_id = fm.product_id
LEFT JOIN bl_shipments b ON b.bl_id = id.bl_id
WHERE fm.outbound_date BETWEEN '2025-01-01' AND '2025-12-31'
  AND fm.corporation = '탑솔라'
  AND fm.usage_category_raw = '상품판매';
```

### 5.4 회사 필터 — 주의

- outbounds: `company_id` 직접
- sales: `outbound_id` join 후 outbounds.company_id (sales 자체엔 company_id 없음)
- import_declarations: `company_id` 직접
- fifo_matches: **`corporation` 컬럼 (한글)** — uuid 가 아님

---

## 6. 함정 / 주의사항

### 6.1 outbounds.bl_id 는 deprecated (M115)

- `outbound_bl_items` 가 정본
- 응답에서 `outbound.bl_id` / `outbound.bl_number` 노출 안 됨 (M115 후)
- 신규 코드는 무조건 `outbound_bl_items` 사용. RPC `sf_create_outbound` 도 `p_bl_items` 만 받음

### 6.2 fifo_matches 의 corporation 은 한글 자유 텍스트

- `'탑솔라'`, `'디원'`, `'화신'` — uuid 아님
- `company_id` 와 매핑하려면 코드 변환 필요

### 6.3 매출 합계 정의 차이

- **재무제표 "상품매출"** = `sales.supply_amount` SUM (VAT 제외)
- **시스템 sales 전체** = 위와 동일 (모두 sale 카테고리에만 잡혀있음)
- **시스템 outbound 합계** (sale + sale_spare) > sales 합계 (sale_spare 는 supply_amount=0)

### 6.4 매출원가 (회계 vs 시스템)

- 회계: 면장 CIF + 부대비용 + 결산 보정
- 시스템 `fifo_matches.cost_amount`: 면장 CIF/qty 만 (부대비용 미반영)
- 갭 = `incidental_expenses` (현재 0건) + 결산 보정
- **2025 탑솔라 갭 ≈ 17억** — `incidental_expenses` 백필 필요

### 6.5 다면장 BL

- 한 BL 에 면장 여러 건 (예: `DFS815002444` = 2 면장)
- `cif_amount_krw` 백필 시 `SUM(cif_krw)` 필수
- declaration_number 같은 단일 값은 MAX/first 로 단일화

### 6.6 sales 의 단가 0 ≠ NULL

- NULL 행 0건 (모든 sales 에 단가 컬럼 있음)
- 비매출 카테고리 sales: 단가 = 0 (정상)
- 매출 카테고리 sales: 단가 > 0
- `unit_price_ea = 0 AND supply_amount > 0` 모순 케이스 0건 ✅

### 6.7 fifo_matches 의 매출/원가 합산 함정

- `SUM(profit_amount)` ≠ `SUM(sales_amount) - SUM(cost_amount)` 인 경우 다수
- 이유: 비매출 카테고리 (공사사용/폐기) 행은 sales_amount=0 + cost_amount>0 + profit_amount=0 으로 잡힘
- 카테고리별로 분리해서 집계 권장

### 6.8 PostgREST `42703` (column does not exist)

- 컬럼 추가/제거 마이그 후 PostgREST 스키마 캐시 갱신 필수
- `apply_migrations.ts` 가 자동 `NOTIFY pgrst, 'reload schema'`
- 운영 직접 변경 시엔 수동 NOTIFY 또는 PostgREST 재시작

### 6.9 supabase pooler transaction mode (port 5432)

- prepared statement 제약
- `\i` 같은 psql 메타 명령은 작동, BEGIN-COMMIT 도 OK
- 단 prepared statement 캐시는 짧음 → 매 쿼리 plan 재생성

### 6.10 outbounds.company_id 의 의미

- group_trade=true 인 출고: `company_id` = 보낸 법인, `target_company_id` = 받는 법인
- 그룹사 간 이전은 양쪽 모두에 outbound + inbound 생성될 수 있음 (`intercompany_requests` 참조)

### 6.11 사후 등록된 수주 — orders.order_date 가 ERP 도입 시점(2025-12)에 몰림

- 매출(sales) 은 2025-01 부터 백필됐으나, 그 매출과 매핑된 orders 행들의 `order_date` 는
  대부분 2025-12 ~ 2026-03 (ERP 도입 후 일괄 작성). 예: 2025-03 매출 198건 중
  101건이 orders 와 매핑돼 있고, 그 101 개 orders 의 `order_date` 는 2025-12 (23) /
  2026-01 (66) / 2026-03 (12).
- 영향: 수주 KPI 의 `trend24` / sparkline 등 `order_date` 기반 시계열은 2025-11 이전이 전부 0.
- 대응 (마이그 131): `orders_dashboard.trend24` binning 을 § 4.6 처럼 첫 매출 발행일 폴백으로 변경.
  `unit_price_ma15_180` 과 `totals.recent_30` 은 의도적으로 그대로 — "최근 30일에 입력된 수주" 의미 보존.

---

## 7. 핵심 RPC / 함수

| RPC | 위치 | 역할 |
|---|---|---|
| `sf_create_outbound(p_outbound_id, p_outbound jsonb, p_bl_items jsonb)` | M115 | 출고 + obi 트랜잭션 일원화 |
| `sf_update_outbound(p_outbound_id, p_outbound, p_bl_items)` | M115 | 출고 수정 + obi 재구성 |
| `sf_delete_outbound(p_outbound_id)` | M036 | 출고 삭제 |
| `sf_insert_outbound_bl_items(p_outbound_id, p_bl_items)` | M036 | obi 일괄 INSERT (내부 호출) |
| `sf_recalculate_order_progress(order_id)` | M036 | 수주 진행률 재계산 |
| `sales_dashboard(...)` | M073 | 매출 대시보드 1 round-trip 집계 |
| `orders_dashboard(...)` | M075 (정정 M104, M131 trend binning) | 수주 대시보드 1 round-trip 집계 — `trend24` 만 첫 매출 발행일 폴백 |
| `outbounds_dashboard(...)` | - | 출고 대시보드 |

---

## 8. 핵심 뷰

| 뷰 | 정의 | 용도 |
|---|---|---|
| `outbounds_with_meta` | outbounds + products + orders + warehouses + companies | 출고 화면/대시보드 |
| `outbounds_sale_unregistered` | outbounds_with_meta WHERE 매출 미생성 | 매출 등록 대기 큐 |
| `sales_with_meta` | sales + outbound/order meta | 매출 분석 |

---

## 9. 현재 빈 도메인 (자료 부재)

| 테이블 | 임팩트 | 자료 소스 후보 |
|---|---|---|
| `purchase_orders / po_line_items` | 발주 추적 불가 | ERP 발주 export |
| `lc_records / lc_line_items` | 신용장 추적 불가 | 은행 LC 발급 자료 |
| `incidental_expenses` | 매출원가 정확도 (~17억 갭) | 회계장부 분개 |
| `cost_details.incidental_cost / customs_fee` | landed cost 정확도 | 동일 |
| `partner_price_book` | 거래처별 단가 분석 | 영업 견적 누적 |
| `price_histories` | 단가 이력 추적 | 운영 누적 |
| `inventory_allocations` | 재고 사전 배정 | 정책상 미사용 |

---

## 10. 마이그 시리즈 컨텍스트 (현재 활성)

| PR | 마이그 | 효과 |
|---|---|---|
| #814 | 111 + 112 | bl_shipments.cif_amount_krw + bl_line_items 백필 |
| #816 | 113 | outbound_bl_items 매핑 18% → 74% |
| #817 | 114 | obi ↔ outbound.bl_id 동기화 트리거 |
| #818 | 115 | outbounds.bl_id 컬럼 DROP (레거시 정리) |
| #821 | 116 | cost_details 백필 (면장 기반 100건) |
| #822 | 117 | bl_shipments 4 컬럼 백필 (decl_no/inv/xr/arrival) |
| #824 | 118 | outbounds.site_name 보강 (17건) |
| #? | 131 | orders_dashboard.trend24 binning → 첫 매출 발행일 폴백 |
| 본 PR | 155 | 24년 PO/LC 백필 — raw 수입진행상황 2024 시트 기반 (PO 2 + LC 19, BL 1 skip) |

머지 순서: 마이그 번호순 (111 → 155)

**M155 상세**: raw 자료 (`수입진행상황(module)-2025년도.xlsx::2024 시트`) 에서 24년 PO 11건 / LC 24건 / BL 62건 추출 후 DB 와 차이 비교. 신규 INSERT 후보 중 메타데이터 충분한 것만 적용:
- PO 2건: `기산태양광 1차~4차`, `CSI-TO240730` (캐나디안솔라 제조사)
- LC 19건: 24년 LC (`M12MK24*` 하나은행 / `M04NG24*` 신한은행)
- SKIP: `무안햇빛솔라` (제조사 미상), `M12MK2410NU00025` (amount_usd NULL), BL 1건 (기존 DB 중복)
- 멱등 INSERT: `po_number` / `lc_number+po_id` / `bl_number` 가 unique key. memo `M155%` 로 추적 가능
- 빌더: `scripts/gen_m155_backfill_2024.py` (raw JSON → SQL 자동 생성)

---

## 11. 진단 헬퍼 명령

```bash
# 가장 흔한 진단
ssh choiceoh@100.105.145.6 'scripts/prod-logs.sh errors'           # 30분 ERROR/WARN
ssh choiceoh@100.105.145.6 'scripts/prod-logs.sh db 1h'            # PostgREST/스키마 드리프트
ssh choiceoh@100.105.145.6 'scripts/prod-logs.sh status'           # 4유닛 systemd

# 임시 SQL 조회
ssh choiceoh@100.105.145.6 "set -a; source /home/choiceoh/공개/solarflow-3/engine/.env; set +a; \
  psql \"\$SUPABASE_DB_URL\" -A -c 'SELECT ...'"
```

---

## 12. 작업 원칙 (AI 에이전트용)

1. **마이그 작성 시**:
   - 번호는 기존 최대 + 1 (`ls backend/migrations | tail -3` 으로 확인)
   - 멱등성 가드 필수 (NOT EXISTS / WHERE NULL / DROP IF EXISTS)
   - BEGIN/COMMIT 트랜잭션
   - 검증 SELECT 마지막에
   - 운영에서 `sed COMMIT→ROLLBACK` 으로 dry-run

2. **읽기 작업 시**:
   - 회사 필터 `company_id` 또는 `corporation` (fifo_matches 는 한글)
   - 매출 합산은 `sales.supply_amount` (VAT 제외)
   - 매출원가는 `fifo_matches.cost_amount` (단 부대비용 미반영)
   - 매출 카테고리는 `usage_category IN ('sale','sale_spare')`

3. **쓰기 작업 금지 사항**:
   - 운영 DB 에 직접 UPDATE/INSERT 금지 (마이그 + PR 경유)
   - PostgreSQL function 변경은 RPC 의존 코드 동시 변경 필수
   - 외부 API (Deneb) 영향 컬럼 변경은 사전 확인

4. **PR 절차**:
   - 새 브랜치 `ostcode/<설명>` (main 기반)
   - 마이그 + dry-run 결과 PR 본문에 포함
   - 머지 후 cron-deploy 가 자동 적용 (`scripts/cron-deploy.sh`)

---

## 13. 데이터 정합 자가 검증

```sql
-- 1) fifo_matches ↔ outbounds 정합
SELECT COUNT(*) FROM fifo_matches fm
LEFT JOIN outbounds o ON o.outbound_id = fm.outbound_id
WHERE fm.outbound_id IS NOT NULL AND o.outbound_id IS NULL;
-- 0 이어야 정상

-- 2) outbound_bl_items ↔ bl_shipments 정합
SELECT COUNT(*) FROM outbound_bl_items obi
LEFT JOIN bl_shipments b ON b.bl_id = obi.bl_id
WHERE b.bl_id IS NULL;
-- 0 이어야 정상

-- 3) sales ↔ outbounds 정합
SELECT COUNT(*) FROM sales s
LEFT JOIN outbounds o ON o.outbound_id = s.outbound_id
WHERE s.outbound_id IS NOT NULL AND o.outbound_id IS NULL;
-- 0 이어야 정상

-- 4) cost_details ↔ import_declarations 정합
SELECT COUNT(*) FROM cost_details cd
LEFT JOIN import_declarations id ON id.declaration_id = cd.declaration_id
WHERE id.declaration_id IS NULL;
-- 0 이어야 정상
```

---

생성: 2026-05-14
참고: 본 문서는 작업 중 발견된 데이터 모델 패턴/함정을 누적 기록. 변경 시 PR 로 갱신.
## 부록 A — 테이블 카드 (컬럼 / FK / CHECK)

각 테이블의 컬럼 명세 + 양방향 FK + CHECK 제약을 정리한 카드. 카탈로그 §3 의 보강판.


### A.1 마스터


#### `companies` (rows: 4)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `company_id` | uuid | ✓ | uuid_generate_v4() |
| 2 | `company_name` | character varying(100) | ✓ |  |
| 3 | `company_code` | character varying(10) | ✓ |  |
| 4 | `business_number` | character varying(20) |  |  |
| 5 | `is_active` | boolean | ✓ | true |
| 6 | `created_at` | timestamp with time zone | ✓ | now() |
| 7 | `updated_at` | timestamp with time zone | ✓ | now() |

**FK in** (다른 테이블 → 이 테이블):
- `bank_accounts.company_id` → `company_id`
- `banks.company_id` → `company_id`
- `bl_shipments.company_id` → `company_id`
- `company_aliases.canonical_company_id` → `company_id`
- `import_declarations.company_id` → `company_id`
- `incidental_expenses.company_id` → `company_id`
- `intercompany_requests.requester_company_id` → `company_id`
- `intercompany_requests.target_company_id` → `company_id`
- `inventory_allocations.company_id` → `company_id`
- `lc_records.company_id` → `company_id`
- `module_demand_forecasts.company_id` → `company_id`
- `orders.company_id` → `company_id`
- `outbounds.company_id` → `company_id`
- `outbounds.target_company_id` → `company_id`
- `price_histories.company_id` → `company_id`
- `purchase_orders.company_id` → `company_id`
- `receipts.company_id` → `company_id`
- `user_profiles.company_id` → `company_id`

#### `manufacturers` (rows: 12)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `manufacturer_id` | uuid | ✓ | uuid_generate_v4() |
| 2 | `name_kr` | character varying(50) | ✓ |  |
| 3 | `name_en` | character varying(100) |  |  |
| 4 | `country` | character varying(20) | ✓ |  |
| 5 | `domestic_foreign` | character varying(10) | ✓ |  |
| 6 | `is_active` | boolean | ✓ | true |
| 7 | `created_at` | timestamp with time zone | ✓ | now() |
| 8 | `updated_at` | timestamp with time zone | ✓ | now() |
| 9 | `short_name` | character varying(20) |  |  |
| 10 | `tier` | integer | ✓ | 3 |
| 11 | `priority_rank` | integer | ✓ | 999 |

**FK in** (다른 테이블 → 이 테이블):
- `bl_shipments.manufacturer_id` → `manufacturer_id`
- `module_demand_forecasts.manufacturer_id` → `manufacturer_id`
- `price_histories.manufacturer_id` → `manufacturer_id`
- `products.manufacturer_id` → `manufacturer_id`
- `purchase_orders.manufacturer_id` → `manufacturer_id`

#### `products` (rows: 123)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `product_id` | uuid | ✓ | uuid_generate_v4() |
| 2 | `product_code` | character varying(30) | ✓ |  |
| 3 | `product_name` | character varying(100) | ✓ |  |
| 4 | `manufacturer_id` | uuid |  |  |
| 5 | `spec_wp` | integer |  |  |
| 6 | `wattage_kw` | numeric |  |  |
| 7 | `module_width_mm` | integer |  |  |
| 8 | `module_height_mm` | integer |  |  |
| 9 | `module_depth_mm` | integer |  |  |
| 10 | `weight_kg` | numeric |  |  |
| 11 | `wafer_platform` | character varying(30) |  |  |
| 12 | `cell_config` | character varying(30) |  |  |
| 13 | `series_name` | character varying(50) |  |  |
| 14 | `is_active` | boolean | ✓ | true |
| 15 | `memo` | text |  |  |
| 16 | `created_at` | timestamp with time zone | ✓ | now() |
| 17 | `updated_at` | timestamp with time zone | ✓ | now() |
| 18 | `erp_code` | text |  |  |
| 19 | `safety_stock` | integer |  |  |
| 20 | `available_stock` | integer |  |  |
| 21 | `module_efficiency` | numeric |  |  |
| 22 | `module_type` | character varying(20) |  |  |
| 23 | `module_grade` | character varying(2) |  |  |
| 24 | `product_family_code` | text |  |  |
| 25 | `product_kind` | text | ✓ | 'module'::text |
| 26 | `rated_power_kw` | numeric |  |  |
| 27 | `max_input_kw` | numeric |  |  |
| 28 | `mppt_channels` | integer |  |  |
| 29 | `voltage_min_v` | integer |  |  |
| 30 | `voltage_max_v` | integer |  |  |
| 31 | `phase` | text |  |  |
| 32 | `product_variant_kind` | character varying(30) |  |  |
| 33 | `bom_revision` | text |  |  |
| 34 | `substitution_group_code` | text |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `manufacturer_id` → `manufacturers.manufacturer_id`

**FK in** (다른 테이블 → 이 테이블):
- `baro_quote_lines.product_id` → `product_id`
- `bl_line_items.product_id` → `product_id`
- `cost_details.product_id` → `product_id`
- `cycle_count_items.product_id` → `product_id`
- `fifo_matches.product_id` → `product_id`
- `import_declarations.product_id` → `product_id`
- `inbounds.product_id` → `product_id`
- `intercompany_requests.product_id` → `product_id`
- `inventory_allocations.product_id` → `product_id`
- `inventory_movements.product_id` → `product_id`
- `inventory_snapshots.product_id` → `product_id`
- `lc_line_items.product_id` → `product_id`
- `orders.product_id` → `product_id`
- `outbounds.product_id` → `product_id`
- `partner_price_book.product_id` → `product_id`
- `picking_list_items.product_id` → `product_id`
- `po_line_items.product_id` → `product_id`
- `price_histories.product_id` → `product_id`
- `product_aliases.alias_product_id` → `product_id`
- `product_aliases.canonical_product_id` → `product_id`
- `product_package_items.child_product_id` → `product_id`
- `product_package_items.package_id` → `product_id`
- `receiving_logs.product_id` → `product_id`

#### `partners` (rows: 152)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `partner_id` | uuid | ✓ | uuid_generate_v4() |
| 2 | `partner_name` | character varying(100) | ✓ |  |
| 3 | `partner_type` | character varying(20) | ✓ |  |
| 4 | `erp_code` | character varying(10) |  |  |
| 5 | `payment_terms` | character varying(50) |  |  |
| 6 | `contact_name` | character varying(50) |  |  |
| 7 | `contact_phone` | character varying(20) |  |  |
| 8 | `contact_email` | character varying(100) |  |  |
| 9 | `is_active` | boolean | ✓ | true |
| 10 | `created_at` | timestamp with time zone | ✓ | now() |
| 11 | `updated_at` | timestamp with time zone | ✓ | now() |
| 12 | `credit_limit_krw` | numeric |  |  |
| 13 | `credit_payment_days` | integer |  |  |
| 14 | `owner_user_id` | uuid |  |  |
| 16 | `normalized_name` | text |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `owner_user_id` → `user_profiles.user_id`

**FK in** (다른 테이블 → 이 테이블):
- `baro_credit_holds.partner_id` → `partner_id`
- `baro_quotes.partner_id` → `partner_id`
- `baro_shipment_notices.partner_id` → `partner_id`
- `inbounds.supplier_partner_id` → `partner_id`
- `inventory_movements.partner_partner_id` → `partner_id`
- `orders.customer_id` → `partner_id`
- `partner_activities.partner_id` → `partner_id`
- `partner_aliases.canonical_partner_id` → `partner_id`
- `partner_price_book.partner_id` → `partner_id`
- `picking_lists.partner_id` → `partner_id`
- `receipts.customer_id` → `partner_id`
- `sales.customer_id` → `partner_id`

#### `warehouses` (rows: 8)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `warehouse_id` | uuid | ✓ | uuid_generate_v4() |
| 2 | `warehouse_code` | character varying(10) | ✓ |  |
| 3 | `warehouse_name` | character varying(50) | ✓ |  |
| 4 | `warehouse_type` | character varying(20) | ✓ |  |
| 5 | `location_code` | character varying(10) | ✓ |  |
| 6 | `location_name` | character varying(50) | ✓ |  |
| 7 | `is_active` | boolean | ✓ | true |
| 8 | `created_at` | timestamp with time zone | ✓ | now() |
| 9 | `updated_at` | timestamp with time zone | ✓ | now() |

**FK in** (다른 테이블 → 이 테이블):
- `bl_shipments.warehouse_id` → `warehouse_id`
- `cycle_counts.warehouse_id` → `warehouse_id`
- `external_sync_sources.default_warehouse_id` → `warehouse_id`
- `inbounds.warehouse_id` → `warehouse_id`
- `inventory_movements.warehouse_id` → `warehouse_id`
- `outbounds.warehouse_id` → `warehouse_id`
- `picking_lists.warehouse_id` → `warehouse_id`
- `receiving_logs.warehouse_id` → `warehouse_id`
- `warehouse_locations.warehouse_id` → `warehouse_id`

#### `warehouse_locations` (rows: ?)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `location_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `warehouse_id` | uuid | ✓ |  |
| 3 | `zone` | text |  |  |
| 4 | `aisle` | text |  |  |
| 5 | `rack` | text |  |  |
| 6 | `bin` | text |  |  |
| 7 | `location_code` | text | ✓ |  |
| 8 | `capacity_qty` | integer |  |  |
| 9 | `weight_capacity_kg` | numeric |  |  |
| 10 | `location_type` | text | ✓ | 'storage'::text |
| 11 | `notes` | text |  |  |
| 12 | `is_active` | boolean | ✓ | true |
| 13 | `created_at` | timestamp with time zone | ✓ | now() |
| 14 | `updated_at` | timestamp with time zone | ✓ | now() |

**FK out** (이 테이블 → 다른 테이블):
- `warehouse_id` → `warehouses.warehouse_id`

**FK in** (다른 테이블 → 이 테이블):
- `cycle_count_items.location_id` → `location_id`
- `inventory_allocations.location_id` → `location_id`
- `picking_list_items.location_id` → `location_id`
- `receiving_logs.location_id` → `location_id`

#### `construction_sites` (rows: ?)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `site_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `company_id` | uuid | ✓ |  |
| 3 | `name` | text | ✓ |  |
| 4 | `location` | text |  |  |
| 5 | `site_type` | text | ✓ |  |
| 6 | `capacity_mw` | numeric |  |  |
| 7 | `started_at` | date |  |  |
| 8 | `completed_at` | date |  |  |
| 9 | `notes` | text |  |  |
| 10 | `is_active` | boolean | ✓ | true |
| 11 | `created_at` | timestamp with time zone | ✓ | now() |
| 12 | `updated_at` | timestamp with time zone | ✓ | now() |

**FK in** (다른 테이블 → 이 테이블):
- `inventory_allocations.site_id` → `site_id`
- `module_demand_forecasts.site_id` → `site_id`
- `orders.site_id` → `site_id`

#### `dispatch_routes` (rows: ?)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `route_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `route_date` | date | ✓ |  |
| 3 | `vehicle_type` | text |  |  |
| 4 | `vehicle_plate` | text |  |  |
| 5 | `driver_name` | text |  |  |
| 6 | `driver_phone` | text |  |  |
| 7 | `status` | text | ✓ | 'planned'::text |
| 8 | `memo` | text |  |  |
| 9 | `tenant_scope` | text | ✓ | 'baro'::text |
| 10 | `created_by` | uuid |  |  |
| 11 | `created_at` | timestamp with time zone | ✓ | now() |
| 12 | `updated_at` | timestamp with time zone | ✓ | now() |

**FK in** (다른 테이블 → 이 테이블):
- `outbounds.dispatch_route_id` → `route_id`

#### `banks` (rows: ?)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `bank_id` | uuid | ✓ | uuid_generate_v4() |
| 2 | `company_id` | uuid | ✓ |  |
| 3 | `bank_name` | character varying(50) | ✓ |  |
| 4 | `lc_limit_usd` | numeric | ✓ |  |
| 5 | `opening_fee_rate` | numeric |  |  |
| 6 | `acceptance_fee_rate` | numeric |  |  |
| 7 | `fee_calc_method` | character varying(20) |  |  |
| 8 | `memo` | text |  |  |
| 9 | `is_active` | boolean | ✓ | true |
| 10 | `created_at` | timestamp with time zone | ✓ | now() |
| 11 | `updated_at` | timestamp with time zone | ✓ | now() |

**FK out** (이 테이블 → 다른 테이블):
- `company_id` → `companies.company_id`

**FK in** (다른 테이블 → 이 테이블):
- `bank_accounts.bank_id` → `bank_id`
- `lc_records.bank_id` → `bank_id`
- `limit_changes.bank_id` → `bank_id`

#### `bank_accounts` (rows: ?)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `account_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `company_id` | uuid | ✓ |  |
| 3 | `bank_id` | uuid |  |  |
| 4 | `bank_name` | text | ✓ |  |
| 5 | `branch_name` | text |  |  |
| 6 | `account_number` | text | ✓ |  |
| 7 | `account_holder` | text | ✓ |  |
| 8 | `currency` | character(3) | ✓ | 'KRW'::bpchar |
| 9 | `swift_code` | text |  |  |
| 10 | `memo` | text |  |  |
| 11 | `is_default` | boolean | ✓ | false |
| 12 | `is_active` | boolean | ✓ | true |
| 13 | `created_at` | timestamp with time zone | ✓ | now() |
| 14 | `updated_at` | timestamp with time zone | ✓ | now() |

**FK out** (이 테이블 → 다른 테이블):
- `bank_id` → `banks.bank_id`
- `company_id` → `companies.company_id`

**FK in** (다른 테이블 → 이 테이블):
- `receipts.bank_account_id` → `account_id`

#### `partner_aliases` (rows: ?)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `alias_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `canonical_partner_id` | uuid | ✓ |  |
| 3 | `alias_text` | text | ✓ |  |
| 4 | `alias_text_normalized` | text | ✓ |  |
| 5 | `source` | text | ✓ | 'manual'::text |
| 6 | `created_at` | timestamp with time zone | ✓ | now() |
| 7 | `created_by` | text |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `canonical_partner_id` → `partners.partner_id`

#### `product_aliases` (rows: ?)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `alias_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `canonical_product_id` | uuid | ✓ |  |
| 3 | `alias_code` | text | ✓ |  |
| 4 | `alias_code_normalized` | text | ✓ |  |
| 5 | `source` | text | ✓ | 'manual'::text |
| 6 | `created_at` | timestamp with time zone | ✓ | now() |
| 7 | `created_by` | text |  |  |
| 8 | `alias_product_id` | uuid |  |  |
| 9 | `reason` | text |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `alias_product_id` → `products.product_id`
- `canonical_product_id` → `products.product_id`

#### `company_aliases` (rows: ?)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `alias_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `canonical_company_id` | uuid | ✓ |  |
| 3 | `alias_text` | text | ✓ |  |
| 4 | `alias_text_normalized` | text | ✓ |  |
| 5 | `source` | text | ✓ | 'manual'::text |
| 6 | `created_at` | timestamp with time zone | ✓ | now() |
| 7 | `created_by` | text |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `canonical_company_id` → `companies.company_id`

### A.2 매입 (발주/신용장)


#### `purchase_orders` (rows: 0)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `po_id` | uuid | ✓ | uuid_generate_v4() |
| 2 | `po_number` | character varying(20) |  |  |
| 3 | `company_id` | uuid | ✓ |  |
| 4 | `manufacturer_id` | uuid | ✓ |  |
| 5 | `contract_type` | character varying(20) | ✓ |  |
| 6 | `contract_date` | date |  |  |
| 7 | `incoterms` | character varying(30) |  |  |
| 8 | `payment_terms` | text |  |  |
| 9 | `total_qty` | integer |  |  |
| 10 | `total_mw` | numeric |  |  |
| 11 | `contract_period_start` | date |  |  |
| 12 | `contract_period_end` | date |  |  |
| 13 | `status` | character varying(20) | ✓ | 'draft'::character varying |
| 14 | `memo` | text |  |  |
| 15 | `created_at` | timestamp with time zone | ✓ | now() |
| 16 | `updated_at` | timestamp with time zone | ✓ | now() |
| 17 | `parent_po_id` | uuid |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `company_id` → `companies.company_id`
- `manufacturer_id` → `manufacturers.manufacturer_id`
- `parent_po_id` → `purchase_orders.po_id`

**FK in** (다른 테이블 → 이 테이블):
- `bl_shipments.po_id` → `po_id`
- `lc_records.po_id` → `po_id`
- `po_line_items.po_id` → `po_id`
- `price_histories.related_po_id` → `po_id`
- `purchase_orders.parent_po_id` → `po_id`
- `tt_remittances.po_id` → `po_id`

#### `po_line_items` (rows: 0)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `po_line_id` | uuid | ✓ | uuid_generate_v4() |
| 2 | `po_id` | uuid | ✓ |  |
| 3 | `product_id` | uuid | ✓ |  |
| 4 | `quantity` | integer | ✓ |  |
| 5 | `unit_price_usd` | numeric |  |  |
| 6 | `total_amount_usd` | numeric |  |  |
| 7 | `memo` | text |  |  |
| 8 | `created_at` | timestamp with time zone | ✓ | now() |
| 9 | `updated_at` | timestamp with time zone | ✓ | now() |
| 10 | `item_type` | text |  |  |
| 11 | `payment_type` | text |  |  |
| 12 | `unit_price_usd_wp` | numeric |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `po_id` → `purchase_orders.po_id`
- `product_id` → `products.product_id`

**FK in** (다른 테이블 → 이 테이블):
- `lc_line_items.po_line_id` → `po_line_id`

#### `lc_records` (rows: 0)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `lc_id` | uuid | ✓ | uuid_generate_v4() |
| 2 | `po_id` | uuid | ✓ |  |
| 3 | `lc_number` | character varying(30) |  |  |
| 4 | `bank_id` | uuid | ✓ |  |
| 5 | `company_id` | uuid | ✓ |  |
| 6 | `open_date` | date |  |  |
| 7 | `amount_usd` | numeric | ✓ |  |
| 8 | `target_qty` | integer |  |  |
| 9 | `target_mw` | numeric |  |  |
| 10 | `usance_days` | integer |  | 90 |
| 11 | `usance_type` | character varying(20) |  |  |
| 12 | `maturity_date` | date |  |  |
| 13 | `settlement_date` | date |  |  |
| 14 | `status` | character varying(20) | ✓ | 'pending'::character varying |
| 15 | `memo` | text |  |  |
| 16 | `created_at` | timestamp with time zone | ✓ | now() |
| 17 | `updated_at` | timestamp with time zone | ✓ | now() |
| 18 | `repayment_date` | date |  |  |
| 19 | `repaid` | boolean | ✓ | false |

**FK out** (이 테이블 → 다른 테이블):
- `bank_id` → `banks.bank_id`
- `company_id` → `companies.company_id`
- `po_id` → `purchase_orders.po_id`

**FK in** (다른 테이블 → 이 테이블):
- `bl_shipments.lc_id` → `lc_id`
- `lc_line_items.lc_id` → `lc_id`

#### `lc_line_items` (rows: 0)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `lc_line_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `lc_id` | uuid | ✓ |  |
| 3 | `po_line_id` | uuid |  |  |
| 4 | `product_id` | uuid | ✓ |  |
| 5 | `quantity` | integer | ✓ |  |
| 6 | `capacity_kw` | numeric | ✓ |  |
| 7 | `amount_usd` | numeric |  |  |
| 8 | `unit_price_usd_wp` | numeric |  |  |
| 9 | `item_type` | character varying(20) | ✓ | 'main'::character varying |
| 10 | `payment_type` | character varying(20) | ✓ | 'paid'::character varying |
| 11 | `memo` | text |  |  |
| 12 | `created_at` | timestamp with time zone | ✓ | now() |
| 13 | `updated_at` | timestamp with time zone | ✓ | now() |

**FK out** (이 테이블 → 다른 테이블):
- `lc_id` → `lc_records.lc_id`
- `po_line_id` → `po_line_items.po_line_id`
- `product_id` → `products.product_id`

#### `tt_remittances` (rows: ?)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `tt_id` | uuid | ✓ | uuid_generate_v4() |
| 2 | `po_id` | uuid | ✓ |  |
| 3 | `remit_date` | date |  |  |
| 4 | `amount_usd` | numeric | ✓ |  |
| 5 | `amount_krw` | numeric |  |  |
| 6 | `exchange_rate` | numeric |  |  |
| 7 | `purpose` | character varying(50) |  |  |
| 8 | `status` | character varying(20) | ✓ | 'planned'::character varying |
| 9 | `bank_name` | character varying(50) |  |  |
| 10 | `memo` | text |  |  |
| 11 | `created_at` | timestamp with time zone | ✓ | now() |
| 12 | `updated_at` | timestamp with time zone | ✓ | now() |

**FK out** (이 테이블 → 다른 테이블):
- `po_id` → `purchase_orders.po_id`

### A.3 수입 (BL/면장/원가)


#### `bl_shipments` (rows: 150)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `bl_id` | uuid | ✓ | uuid_generate_v4() |
| 2 | `bl_number` | character varying(30) | ✓ |  |
| 3 | `po_id` | uuid |  |  |
| 4 | `lc_id` | uuid |  |  |
| 5 | `company_id` | uuid | ✓ |  |
| 6 | `manufacturer_id` | uuid | ✓ |  |
| 7 | `inbound_type` | character varying(20) | ✓ |  |
| 8 | `currency` | character varying(3) | ✓ | 'USD'::character varying |
| 9 | `exchange_rate` | numeric |  |  |
| 10 | `etd` | date |  |  |
| 11 | `eta` | date |  |  |
| 12 | `actual_arrival` | date |  |  |
| 13 | `port` | character varying(20) |  |  |
| 14 | `forwarder` | character varying(50) |  |  |
| 15 | `warehouse_id` | uuid |  |  |
| 16 | `invoice_number` | character varying(30) |  |  |
| 17 | `status` | character varying(20) | ✓ | 'scheduled'::character varying |
| 18 | `erp_registered` | boolean |  | false |
| 19 | `memo` | text |  |  |
| 20 | `created_at` | timestamp with time zone | ✓ | now() |
| 21 | `updated_at` | timestamp with time zone | ✓ | now() |
| 22 | `declaration_number` | text |  |  |
| 23 | `cif_amount_krw` | bigint |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `company_id` → `companies.company_id`
- `lc_id` → `lc_records.lc_id`
- `manufacturer_id` → `manufacturers.manufacturer_id`
- `po_id` → `purchase_orders.po_id`
- `warehouse_id` → `warehouses.warehouse_id`

**FK in** (다른 테이블 → 이 테이블):
- `bl_line_items.bl_id` → `bl_id`
- `import_declarations.bl_id` → `bl_id`
- `incidental_expenses.bl_id` → `bl_id`
- `inventory_allocations.bl_id` → `bl_id`
- `orders.bl_id` → `bl_id`
- `outbound_bl_items.bl_id` → `bl_id`
- `outbounds.bl_id` → `bl_id`

**CHECK 제약:**
- `bl_shipments_currency_check`: `((currency)::text = ANY ((ARRAY['USD'::character varying, 'KRW'::character varying])::text[]))`
- `bl_shipments_inbound_type_check`: `((inbound_type)::text = ANY ((ARRAY['import'::character varying, 'domestic'::character varying, 'domestic_foreign'::c...`
- `bl_shipments_status_check`: `((status)::text = ANY ((ARRAY['scheduled'::character varying, 'shipping'::character varying, 'arrived'::character var...`

#### `bl_line_items` (rows: 0)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `bl_line_id` | uuid | ✓ | uuid_generate_v4() |
| 2 | `bl_id` | uuid | ✓ |  |
| 3 | `product_id` | uuid | ✓ |  |
| 4 | `quantity` | integer | ✓ |  |
| 5 | `capacity_kw` | numeric | ✓ |  |
| 6 | `item_type` | character varying(10) | ✓ |  |
| 7 | `payment_type` | character varying(10) | ✓ |  |
| 8 | `invoice_amount_usd` | numeric |  |  |
| 9 | `unit_price_usd_wp` | numeric |  |  |
| 10 | `unit_price_krw_wp` | numeric |  |  |
| 11 | `usage_category` | character varying(20) | ✓ | 'sale'::character varying |
| 12 | `memo` | text |  |  |
| 13 | `created_at` | timestamp with time zone | ✓ | now() |
| 14 | `updated_at` | timestamp with time zone | ✓ | now() |

**FK out** (이 테이블 → 다른 테이블):
- `bl_id` → `bl_shipments.bl_id`
- `product_id` → `products.product_id`

**CHECK 제약:**
- `bl_line_items_item_type_check`: `((item_type)::text = ANY ((ARRAY['main'::character varying, 'spare'::character varying])::text[]))`
- `bl_line_items_payment_type_check`: `((payment_type)::text = ANY ((ARRAY['paid'::character varying, 'free'::character varying])::text[]))`
- `bl_line_items_usage_category_check`: `((usage_category)::text = ANY ((ARRAY['sale'::character varying, 'construction'::character varying, 'spare'::characte...`

#### `import_declarations` (rows: 101)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `declaration_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `declaration_number` | character varying(30) | ✓ |  |
| 3 | `bl_id` | uuid | ✓ |  |
| 4 | `company_id` | uuid | ✓ |  |
| 5 | `declaration_date` | date | ✓ |  |
| 6 | `arrival_date` | date |  |  |
| 7 | `release_date` | date |  |  |
| 8 | `hs_code` | character varying(20) |  |  |
| 9 | `customs_office` | character varying(20) |  |  |
| 10 | `port` | character varying(20) |  |  |
| 11 | `memo` | text |  |  |
| 12 | `created_at` | timestamp with time zone | ✓ | now() |
| 13 | `updated_at` | timestamp with time zone | ✓ | now() |
| 15 | `lc_no` | text |  |  |
| 16 | `invoice_no` | text |  |  |
| 17 | `bl_number` | text |  |  |
| 18 | `supplier_name_en` | text |  |  |
| 19 | `supplier_name_kr` | text |  |  |
| 20 | `po_number` | text |  |  |
| 21 | `exchange_rate` | numeric |  |  |
| 22 | `contract_unit_price_usd_wp` | numeric |  |  |
| 23 | `contract_total_usd` | numeric |  |  |
| 24 | `contract_total_krw` | numeric |  |  |
| 25 | `cif_krw` | numeric |  |  |
| 26 | `incoterms` | text |  |  |
| 27 | `customs_rate` | numeric |  |  |
| 28 | `customs_amount` | numeric |  |  |
| 29 | `vat_amount` | numeric |  |  |
| 30 | `paid_qty` | integer |  |  |
| 31 | `free_qty` | integer |  |  |
| 32 | `free_ratio` | numeric |  |  |
| 33 | `paid_cif_krw` | numeric |  |  |
| 34 | `free_cif_krw` | numeric |  |  |
| 35 | `cost_unit_price_wp` | numeric |  |  |
| 36 | `cost_unit_price_ea` | numeric |  |  |
| 37 | `product_id` | uuid |  |  |
| 38 | `quantity` | integer |  |  |
| 39 | `capacity_kw` | numeric |  |  |
| 40 | `erp_inbound_no` | text |  |  |
| 41 | `declaration_line_no` | text |  |  |
| 42 | `source_payload` | jsonb |  |  |
| 43 | `erp_inbound_no_clean` | text |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `bl_id` → `bl_shipments.bl_id`
- `company_id` → `companies.company_id`
- `product_id` → `products.product_id`

**FK in** (다른 테이블 → 이 테이블):
- `cost_details.declaration_id` → `declaration_id`
- `fifo_matches.declaration_id` → `declaration_id`

#### `cost_details` (rows: 0)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `cost_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `declaration_id` | uuid | ✓ |  |
| 3 | `product_id` | uuid | ✓ |  |
| 4 | `quantity` | integer | ✓ |  |
| 5 | `capacity_kw` | numeric |  |  |
| 6 | `fob_unit_usd` | numeric |  |  |
| 7 | `fob_total_usd` | numeric |  |  |
| 8 | `fob_wp_krw` | numeric |  |  |
| 9 | `exchange_rate` | numeric | ✓ |  |
| 10 | `cif_total_krw` | numeric | ✓ |  |
| 11 | `cif_unit_usd` | numeric |  |  |
| 12 | `cif_total_usd` | numeric |  |  |
| 13 | `cif_wp_krw` | numeric | ✓ |  |
| 14 | `tariff_rate` | numeric |  |  |
| 15 | `tariff_amount` | numeric |  |  |
| 16 | `vat_amount` | numeric |  |  |
| 17 | `customs_fee` | numeric |  |  |
| 18 | `incidental_cost` | numeric |  |  |
| 19 | `landed_total_krw` | numeric |  |  |
| 20 | `landed_wp_krw` | numeric |  |  |
| 21 | `memo` | text |  |  |
| 22 | `created_at` | timestamp with time zone | ✓ | now() |
| 23 | `updated_at` | timestamp with time zone | ✓ | now() |

**FK out** (이 테이블 → 다른 테이블):
- `declaration_id` → `import_declarations.declaration_id`
- `product_id` → `products.product_id`

#### `incidental_expenses` (rows: 0)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `expense_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `bl_id` | uuid |  |  |
| 3 | `month` | character varying(7) |  |  |
| 4 | `company_id` | uuid | ✓ |  |
| 5 | `expense_type` | character varying(30) | ✓ |  |
| 6 | `amount` | numeric | ✓ |  |
| 7 | `vat` | numeric |  |  |
| 8 | `total` | numeric | ✓ |  |
| 9 | `vendor` | character varying(50) |  |  |
| 10 | `memo` | text |  |  |
| 11 | `created_at` | timestamp with time zone | ✓ | now() |
| 12 | `updated_at` | timestamp with time zone | ✓ | now() |
| 13 | `outbound_id` | uuid |  |  |
| 14 | `vehicle_type` | character varying(50) |  |  |
| 15 | `destination` | character varying(200) |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `bl_id` → `bl_shipments.bl_id`
- `company_id` → `companies.company_id`
- `outbound_id` → `outbounds.outbound_id`

**CHECK 제약:**
- `chk_bl_or_month`: `((bl_id IS NOT NULL) OR (month IS NOT NULL))`
- `chk_expense_target`: `((bl_id IS NOT NULL) OR (month IS NOT NULL) OR (outbound_id IS NOT NULL))`
- `incidental_expenses_expense_type_check`: `((expense_type)::text = ANY ((ARRAY['dock_charge'::character varying, 'shuttle'::character varying, 'customs_fee'::ch...`

### A.4 입고 / 재고 / FIFO


#### `inbounds` (rows: 117)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `inbound_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `inbound_date` | date | ✓ |  |
| 3 | `supplier_partner_id` | uuid |  |  |
| 4 | `product_id` | uuid | ✓ |  |
| 5 | `quantity` | integer | ✓ |  |
| 6 | `capacity_kw` | numeric |  |  |
| 7 | `warehouse_id` | uuid |  |  |
| 8 | `location` | text |  |  |
| 9 | `status` | text | ✓ | 'active'::text |
| 10 | `erp_inbound_no` | text |  |  |
| 11 | `erp_line_no` | integer |  |  |
| 12 | `currency` | text |  |  |
| 13 | `unit_price` | numeric |  |  |
| 14 | `unit_price_wp` | numeric |  |  |
| 15 | `supply_amount` | numeric |  |  |
| 16 | `vat_amount` | numeric |  |  |
| 17 | `total_amount` | numeric |  |  |
| 18 | `source_payload` | jsonb |  |  |
| 19 | `memo` | text |  |  |
| 20 | `created_at` | timestamp with time zone | ✓ | now() |
| 21 | `updated_at` | timestamp with time zone | ✓ | now() |

**FK out** (이 테이블 → 다른 테이블):
- `product_id` → `products.product_id`
- `supplier_partner_id` → `partners.partner_id`
- `warehouse_id` → `warehouses.warehouse_id`

**FK in** (다른 테이블 → 이 테이블):
- `fifo_matches.inbound_id` → `inbound_id`

#### `inventory_movements` (rows: 1855)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `movement_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `movement_date` | date | ✓ |  |
| 3 | `product_id` | uuid | ✓ |  |
| 4 | `warehouse_id` | uuid |  |  |
| 5 | `warehouse_code` | text |  |  |
| 6 | `warehouse_name` | text |  |  |
| 7 | `location_code` | text |  |  |
| 8 | `location_name` | text |  |  |
| 9 | `movement_type` | text |  |  |
| 10 | `movement_subtype` | text |  |  |
| 11 | `movement_type_code` | integer |  |  |
| 12 | `partner_partner_id` | uuid |  |  |
| 13 | `partner_code` | text |  |  |
| 14 | `partner_name` | text |  |  |
| 15 | `beginning_qty` | integer |  |  |
| 16 | `inbound_qty` | integer |  |  |
| 17 | `outbound_qty` | integer |  |  |
| 18 | `ending_qty` | integer |  |  |
| 19 | `unit_factor` | numeric |  |  |
| 20 | `unit` | text |  |  |
| 21 | `ending_qty_mgmt` | integer |  |  |
| 22 | `category_code` | text |  |  |
| 23 | `category_name` | text |  |  |
| 24 | `cat_l1_code` | text |  |  |
| 25 | `cat_l1_name` | text |  |  |
| 26 | `cat_l2_code` | text |  |  |
| 27 | `cat_l2_name` | text |  |  |
| 28 | `cat_l3_code` | text |  |  |
| 29 | `cat_l3_name` | text |  |  |
| 30 | `source` | text | ✓ | 'erp_balance_sheet'::text |
| 31 | `source_payload` | jsonb |  |  |
| 32 | `created_at` | timestamp with time zone | ✓ | now() |

**FK out** (이 테이블 → 다른 테이블):
- `partner_partner_id` → `partners.partner_id`
- `product_id` → `products.product_id`
- `warehouse_id` → `warehouses.warehouse_id`

#### `inventory_snapshots` (rows: 92)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `snapshot_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `snapshot_date` | date | ✓ |  |
| 3 | `product_id` | uuid | ✓ |  |
| 4 | `beginning_qty` | integer |  |  |
| 5 | `inbound_qty` | integer |  |  |
| 6 | `outbound_qty` | integer |  |  |
| 7 | `ending_qty` | integer |  |  |
| 8 | `safety_qty` | integer |  |  |
| 9 | `available_qty` | integer |  |  |
| 10 | `unit_factor` | numeric |  |  |
| 11 | `source` | text | ✓ | 'erp_export'::text |
| 12 | `source_payload` | jsonb |  |  |
| 13 | `created_at` | timestamp with time zone | ✓ | now() |

**FK out** (이 테이블 → 다른 테이블):
- `product_id` → `products.product_id`

#### `inventory_allocations` (rows: 0)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `alloc_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `company_id` | uuid | ✓ |  |
| 3 | `product_id` | uuid | ✓ |  |
| 4 | `quantity` | integer | ✓ |  |
| 5 | `capacity_kw` | numeric |  |  |
| 6 | `purpose` | character varying(30) | ✓ |  |
| 7 | `source_type` | character varying(20) | ✓ | 'stock'::character varying |
| 8 | `customer_name` | character varying(100) |  |  |
| 9 | `site_name` | character varying(200) |  |  |
| 10 | `notes` | text |  |  |
| 11 | `expected_price_per_wp` | numeric |  |  |
| 12 | `free_spare_qty` | integer | ✓ | 0 |
| 13 | `status` | character varying(20) | ✓ | 'pending'::character varying |
| 14 | `outbound_id` | uuid |  |  |
| 15 | `order_id` | uuid |  |  |
| 16 | `created_at` | timestamp with time zone | ✓ | now() |
| 17 | `updated_at` | timestamp with time zone | ✓ | now() |
| 18 | `group_id` | uuid |  |  |
| 19 | `site_id` | uuid |  |  |
| 20 | `bl_id` | uuid |  |  |
| 21 | `location_id` | uuid |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `bl_id` → `bl_shipments.bl_id`
- `company_id` → `companies.company_id`
- `location_id` → `warehouse_locations.location_id`
- `order_id` → `orders.order_id`
- `outbound_id` → `outbounds.outbound_id`
- `product_id` → `products.product_id`
- `site_id` → `construction_sites.site_id`

#### `fifo_matches` (rows: 3326)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `match_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `erp_inbound_no` | text |  |  |
| 3 | `erp_inbound_line_no` | integer |  |  |
| 4 | `inbound_id` | uuid |  |  |
| 5 | `inbound_date` | date |  |  |
| 6 | `inbound_kind` | text |  |  |
| 7 | `supplier_name` | text |  |  |
| 8 | `erp_outbound_no` | text |  |  |
| 9 | `outbound_id` | uuid |  |  |
| 10 | `outbound_date` | date |  |  |
| 11 | `customer_name` | text |  |  |
| 12 | `product_id` | uuid | ✓ |  |
| 13 | `lot_inbound_qty` | integer |  |  |
| 14 | `outbound_qty_origin` | integer |  |  |
| 15 | `allocated_qty` | integer |  |  |
| 16 | `wp_unit_price` | numeric |  |  |
| 17 | `ea_unit_cost` | numeric |  |  |
| 18 | `cost_amount` | numeric |  |  |
| 19 | `sales_unit_price_ea` | numeric |  |  |
| 20 | `sales_amount` | numeric |  |  |
| 21 | `profit_amount` | numeric |  |  |
| 22 | `profit_ratio` | numeric |  |  |
| 23 | `usage_category_raw` | text |  |  |
| 24 | `project` | text |  |  |
| 25 | `procurement_type` | text |  |  |
| 26 | `corporation` | text |  |  |
| 27 | `manufacturer_name_kr` | text |  |  |
| 28 | `manufacturer_name_en` | text |  |  |
| 29 | `declaration_id` | uuid |  |  |
| 30 | `declaration_number` | text |  |  |
| 31 | `bl_number` | text |  |  |
| 32 | `lc_number` | text |  |  |
| 33 | `category_no` | text |  |  |
| 34 | `po_number` | text |  |  |
| 35 | `source` | text | ✓ |  |
| 36 | `source_payload` | jsonb |  |  |
| 37 | `created_at` | timestamp with time zone | ✓ | now() |

**FK out** (이 테이블 → 다른 테이블):
- `declaration_id` → `import_declarations.declaration_id`
- `inbound_id` → `inbounds.inbound_id`
- `outbound_id` → `outbounds.outbound_id`
- `product_id` → `products.product_id`

### A.5 수주 / 출고


#### `orders` (rows: 602)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `order_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `order_number` | character varying(30) |  |  |
| 3 | `company_id` | uuid | ✓ |  |
| 4 | `customer_id` | uuid | ✓ |  |
| 5 | `order_date` | date | ✓ |  |
| 6 | `receipt_method` | character varying(20) | ✓ |  |
| 7 | `product_id` | uuid | ✓ |  |
| 8 | `quantity` | integer | ✓ |  |
| 9 | `capacity_kw` | numeric |  |  |
| 10 | `unit_price_wp` | numeric | ✓ |  |
| 11 | `site_name` | character varying(100) |  |  |
| 12 | `site_address` | character varying(200) |  |  |
| 13 | `site_contact` | character varying(50) |  |  |
| 14 | `site_phone` | character varying(20) |  |  |
| 15 | `payment_terms` | character varying(100) |  |  |
| 16 | `deposit_rate` | numeric |  |  |
| 17 | `delivery_due` | date |  |  |
| 18 | `shipped_qty` | integer |  | 0 |
| 19 | `remaining_qty` | integer |  |  |
| 20 | `status` | character varying(20) | ✓ |  |
| 21 | `spare_qty` | integer |  |  |
| 22 | `memo` | text |  |  |
| 23 | `created_at` | timestamp with time zone | ✓ | now() |
| 24 | `updated_at` | timestamp with time zone | ✓ | now() |
| 25 | `management_category` | character varying(20) | ✓ | 'sale'::character varying |
| 26 | `fulfillment_source` | character varying(20) | ✓ | 'stock'::character varying |
| 27 | `bl_id` | uuid |  |  |
| 28 | `site_id` | uuid |  |  |
| 29 | `unit_price_ea` | numeric |  |  |
| 30 | `source_payload` | jsonb |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `bl_id` → `bl_shipments.bl_id`
- `company_id` → `companies.company_id`
- `customer_id` → `partners.partner_id`
- `product_id` → `products.product_id`
- `site_id` → `construction_sites.site_id`

**FK in** (다른 테이블 → 이 테이블):
- `inventory_allocations.order_id` → `order_id`
- `outbounds.order_id` → `order_id`
- `sales.order_id` → `order_id`

**CHECK 제약:**
- `orders_fulfillment_source_check`: `((fulfillment_source)::text = ANY ((ARRAY['stock'::character varying, 'incoming'::character varying])::text[]))`
- `orders_management_category_check`: `((management_category)::text = ANY ((ARRAY['sale'::character varying, 'construction'::character varying, 'spare'::cha...`
- `orders_receipt_method_check`: `((receipt_method)::text = ANY ((ARRAY['purchase_order'::character varying, 'phone'::character varying, 'email'::chara...`
- `orders_status_check`: `((status)::text = ANY ((ARRAY['received'::character varying, 'partial'::character varying, 'completed'::character var...`

#### `outbounds` (rows: 3369)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `outbound_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `outbound_date` | date | ✓ |  |
| 3 | `company_id` | uuid | ✓ |  |
| 4 | `product_id` | uuid | ✓ |  |
| 5 | `quantity` | integer | ✓ |  |
| 6 | `capacity_kw` | numeric |  |  |
| 7 | `warehouse_id` | uuid | ✓ |  |
| 8 | `usage_category` | character varying(20) | ✓ |  |
| 9 | `order_id` | uuid |  |  |
| 10 | `site_name` | character varying(100) |  |  |
| 11 | `site_address` | character varying(200) |  |  |
| 12 | `spare_qty` | integer |  |  |
| 13 | `group_trade` | boolean |  | false |
| 14 | `target_company_id` | uuid |  |  |
| 15 | `erp_outbound_no` | character varying(20) |  |  |
| 16 | `memo` | text |  |  |
| 17 | `created_at` | timestamp with time zone | ✓ | now() |
| 18 | `updated_at` | timestamp with time zone | ✓ | now() |
| 19 | `status` | character varying(20) | ✓ | 'active'::character varying |
| 20 | `dispatch_route_id` | uuid |  |  |
| 21 | `tx_statement_ready` | boolean | ✓ | false |
| 22 | `inspection_request_sent` | boolean | ✓ | false |
| 23 | `approval_requested` | boolean | ✓ | false |
| 24 | `tax_invoice_issued` | boolean | ✓ | false |
| 25 | `source_payload` | jsonb |  |  |
| 26 | `bl_id` | uuid |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `bl_id` → `bl_shipments.bl_id`
- `company_id` → `companies.company_id`
- `dispatch_route_id` → `dispatch_routes.route_id`
- `order_id` → `orders.order_id`
- `product_id` → `products.product_id`
- `target_company_id` → `companies.company_id`
- `warehouse_id` → `warehouses.warehouse_id`

**FK in** (다른 테이블 → 이 테이블):
- `fifo_matches.outbound_id` → `outbound_id`
- `incidental_expenses.outbound_id` → `outbound_id`
- `intercompany_requests.outbound_id` → `outbound_id`
- `inventory_allocations.outbound_id` → `outbound_id`
- `outbound_bl_items.outbound_id` → `outbound_id`
- `receipt_matches.outbound_id` → `outbound_id`
- `sales.outbound_id` → `outbound_id`

**CHECK 제약:**
- `outbounds_status_check`: `((status)::text = ANY ((ARRAY['active'::character varying, 'cancel_pending'::character varying, 'cancelled'::characte...`
- `outbounds_usage_category_check`: `((usage_category)::text = ANY ((ARRAY['sale'::character varying, 'sale_spare'::character varying, 'construction'::cha...`

#### `outbound_bl_items` (rows: 505)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `outbound_bl_item_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `outbound_id` | uuid | ✓ |  |
| 3 | `bl_id` | uuid | ✓ |  |
| 4 | `quantity` | integer | ✓ |  |
| 5 | `created_at` | timestamp with time zone |  | now() |

**FK out** (이 테이블 → 다른 테이블):
- `bl_id` → `bl_shipments.bl_id`
- `outbound_id` → `outbounds.outbound_id`

**CHECK 제약:**
- `outbound_bl_items_quantity_check`: `(quantity > 0)`

### A.6 매출 / 수금


#### `sales` (rows: 3116)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `sale_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `outbound_id` | uuid |  |  |
| 3 | `customer_id` | uuid | ✓ |  |
| 4 | `unit_price_wp` | numeric | ✓ |  |
| 5 | `unit_price_ea` | numeric |  |  |
| 6 | `supply_amount` | numeric |  |  |
| 7 | `vat_amount` | numeric |  |  |
| 8 | `total_amount` | numeric |  |  |
| 9 | `tax_invoice_date` | date |  |  |
| 10 | `tax_invoice_email` | character varying(100) |  |  |
| 11 | `erp_closed` | boolean |  | false |
| 12 | `erp_closed_date` | date |  |  |
| 13 | `memo` | text |  |  |
| 14 | `created_at` | timestamp with time zone | ✓ | now() |
| 15 | `updated_at` | timestamp with time zone | ✓ | now() |
| 16 | `order_id` | uuid |  |  |
| 17 | `quantity` | integer |  |  |
| 18 | `capacity_kw` | numeric |  |  |
| 19 | `status` | text | ✓ | 'active'::text |
| 20 | `erp_sales_no` | text |  |  |
| 21 | `erp_line_no` | integer |  |  |
| 22 | `currency` | text |  |  |
| 23 | `source_payload` | jsonb |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `customer_id` → `partners.partner_id`
- `order_id` → `orders.order_id`
- `outbound_id` → `outbounds.outbound_id`

**FK in** (다른 테이블 → 이 테이블):
- `receipt_matches.sale_id` → `sale_id`

**CHECK 제약:**
- `sales_order_or_outbound_check`: `((order_id IS NOT NULL) OR (outbound_id IS NOT NULL))`
- `sales_quantity_positive_check`: `((quantity IS NULL) OR (quantity > 0))`
- `sales_status_check`: `(status = ANY (ARRAY['active'::text, 'cancelled'::text]))`

#### `receipts` (rows: 2637)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `receipt_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `customer_id` | uuid | ✓ |  |
| 3 | `receipt_date` | date | ✓ |  |
| 4 | `amount` | numeric | ✓ |  |
| 5 | `bank_account` | character varying(50) |  |  |
| 6 | `memo` | text |  |  |
| 7 | `created_at` | timestamp with time zone | ✓ | now() |
| 8 | `updated_at` | timestamp with time zone | ✓ | now() |
| 9 | `bank_account_id` | uuid |  |  |
| 10 | `company_id` | uuid |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `bank_account_id` → `bank_accounts.account_id`
- `company_id` → `companies.company_id`
- `customer_id` → `partners.partner_id`

**FK in** (다른 테이블 → 이 테이블):
- `receipt_matches.receipt_id` → `receipt_id`

#### `receipt_matches` (rows: ?)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `match_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `receipt_id` | uuid | ✓ |  |
| 3 | `outbound_id` | uuid |  |  |
| 4 | `matched_amount` | numeric | ✓ |  |
| 5 | `created_at` | timestamp with time zone | ✓ | now() |
| 6 | `sale_id` | uuid |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `outbound_id` → `outbounds.outbound_id`
- `receipt_id` → `receipts.receipt_id`
- `sale_id` → `sales.sale_id`

### A.7 가격


#### `partner_price_book` (rows: 0)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `price_id` | uuid | ✓ | gen_random_uuid() |
| 2 | `partner_id` | uuid | ✓ |  |
| 3 | `product_id` | uuid | ✓ |  |
| 4 | `unit_price_wp` | numeric | ✓ |  |
| 5 | `discount_pct` | numeric | ✓ | 0 |
| 6 | `effective_from` | date | ✓ | CURRENT_DATE |
| 7 | `effective_to` | date |  |  |
| 8 | `memo` | text |  |  |
| 9 | `tenant_scope` | text | ✓ | 'baro'::text |
| 10 | `created_by` | uuid |  |  |
| 11 | `created_at` | timestamp with time zone | ✓ | now() |
| 12 | `updated_at` | timestamp with time zone | ✓ | now() |

**FK out** (이 테이블 → 다른 테이블):
- `partner_id` → `partners.partner_id`
- `product_id` → `products.product_id`

#### `price_histories` (rows: 0)

| # | column | type | NN | default |
|--:|---|---|:-:|---|
| 1 | `price_history_id` | uuid | ✓ | uuid_generate_v4() |
| 2 | `product_id` | uuid |  |  |
| 3 | `manufacturer_id` | uuid | ✓ |  |
| 4 | `change_date` | date | ✓ |  |
| 5 | `previous_price` | numeric |  |  |
| 6 | `new_price` | numeric | ✓ |  |
| 7 | `reason` | character varying(50) |  |  |
| 8 | `related_po_id` | uuid |  |  |
| 9 | `memo` | text |  |  |
| 10 | `created_at` | timestamp with time zone | ✓ | now() |
| 11 | `updated_at` | timestamp with time zone | ✓ | now() |
| 12 | `company_id` | uuid |  |  |

**FK out** (이 테이블 → 다른 테이블):
- `company_id` → `companies.company_id`
- `manufacturer_id` → `manufacturers.manufacturer_id`
- `product_id` → `products.product_id`
- `related_po_id` → `purchase_orders.po_id`


## 부록 B — 전체 FK 매트릭스

운영 DB 의 모든 FK (127건). 데이터 흐름 추적/마이그 영향 분석용.


| src table | src col | → | dst table | dst col |
|---|---|:-:|---|---|
| `ai_attachment_rows` | `sheet_id` | → | `ai_attachment_sheets` | `sheet_id` |
| `ai_attachment_sheets` | `user_id` | → | `user_profiles` | `user_id` |
| `assistant_sessions` | `user_id` | → | `user_profiles` | `user_id` |
| `audit_logs` | `user_id` | → | `user_profiles` | `user_id` |
| `bank_accounts` | `bank_id` | → | `banks` | `bank_id` |
| `bank_accounts` | `company_id` | → | `companies` | `company_id` |
| `banks` | `company_id` | → | `companies` | `company_id` |
| `baro_credit_holds` | `partner_id` | → | `partners` | `partner_id` |
| `baro_driver_tokens` | `notice_id` | → | `baro_shipment_notices` | `notice_id` |
| `baro_quote_lines` | `product_id` | → | `products` | `product_id` |
| `baro_quote_lines` | `quote_id` | → | `baro_quotes` | `quote_id` |
| `baro_quotes` | `partner_id` | → | `partners` | `partner_id` |
| `baro_shipment_notices` | `partner_id` | → | `partners` | `partner_id` |
| `bl_line_items` | `bl_id` | → | `bl_shipments` | `bl_id` |
| `bl_line_items` | `product_id` | → | `products` | `product_id` |
| `bl_shipments` | `company_id` | → | `companies` | `company_id` |
| `bl_shipments` | `lc_id` | → | `lc_records` | `lc_id` |
| `bl_shipments` | `manufacturer_id` | → | `manufacturers` | `manufacturer_id` |
| `bl_shipments` | `po_id` | → | `purchase_orders` | `po_id` |
| `bl_shipments` | `warehouse_id` | → | `warehouses` | `warehouse_id` |
| `company_aliases` | `canonical_company_id` | → | `companies` | `company_id` |
| `cost_details` | `declaration_id` | → | `import_declarations` | `declaration_id` |
| `cost_details` | `product_id` | → | `products` | `product_id` |
| `cycle_count_items` | `cycle_count_id` | → | `cycle_counts` | `cycle_count_id` |
| `cycle_count_items` | `location_id` | → | `warehouse_locations` | `location_id` |
| `cycle_count_items` | `product_id` | → | `products` | `product_id` |
| `cycle_counts` | `warehouse_id` | → | `warehouses` | `warehouse_id` |
| `external_sync_sources` | `default_warehouse_id` | → | `warehouses` | `warehouse_id` |
| `fifo_matches` | `declaration_id` | → | `import_declarations` | `declaration_id` |
| `fifo_matches` | `inbound_id` | → | `inbounds` | `inbound_id` |
| `fifo_matches` | `outbound_id` | → | `outbounds` | `outbound_id` |
| `fifo_matches` | `product_id` | → | `products` | `product_id` |
| `import_declarations` | `bl_id` | → | `bl_shipments` | `bl_id` |
| `import_declarations` | `company_id` | → | `companies` | `company_id` |
| `import_declarations` | `product_id` | → | `products` | `product_id` |
| `inbounds` | `product_id` | → | `products` | `product_id` |
| `inbounds` | `supplier_partner_id` | → | `partners` | `partner_id` |
| `inbounds` | `warehouse_id` | → | `warehouses` | `warehouse_id` |
| `incidental_expenses` | `bl_id` | → | `bl_shipments` | `bl_id` |
| `incidental_expenses` | `company_id` | → | `companies` | `company_id` |
| `incidental_expenses` | `outbound_id` | → | `outbounds` | `outbound_id` |
| `integrity_check_runs` | `check_id` | → | `integrity_checks` | `check_id` |
| `intercompany_requests` | `outbound_id` | → | `outbounds` | `outbound_id` |
| `intercompany_requests` | `product_id` | → | `products` | `product_id` |
| `intercompany_requests` | `requester_company_id` | → | `companies` | `company_id` |
| `intercompany_requests` | `target_company_id` | → | `companies` | `company_id` |
| `inventory_allocations` | `bl_id` | → | `bl_shipments` | `bl_id` |
| `inventory_allocations` | `company_id` | → | `companies` | `company_id` |
| `inventory_allocations` | `location_id` | → | `warehouse_locations` | `location_id` |
| `inventory_allocations` | `order_id` | → | `orders` | `order_id` |
| `inventory_allocations` | `outbound_id` | → | `outbounds` | `outbound_id` |
| `inventory_allocations` | `product_id` | → | `products` | `product_id` |
| `inventory_allocations` | `site_id` | → | `construction_sites` | `site_id` |
| `inventory_movements` | `partner_partner_id` | → | `partners` | `partner_id` |
| `inventory_movements` | `product_id` | → | `products` | `product_id` |
| `inventory_movements` | `warehouse_id` | → | `warehouses` | `warehouse_id` |
| `inventory_snapshots` | `product_id` | → | `products` | `product_id` |
| `lc_line_items` | `lc_id` | → | `lc_records` | `lc_id` |
| `lc_line_items` | `po_line_id` | → | `po_line_items` | `po_line_id` |
| `lc_line_items` | `product_id` | → | `products` | `product_id` |
| `lc_records` | `bank_id` | → | `banks` | `bank_id` |
| `lc_records` | `company_id` | → | `companies` | `company_id` |
| `lc_records` | `po_id` | → | `purchase_orders` | `po_id` |
| `limit_changes` | `bank_id` | → | `banks` | `bank_id` |
| `module_demand_forecasts` | `company_id` | → | `companies` | `company_id` |
| `module_demand_forecasts` | `manufacturer_id` | → | `manufacturers` | `manufacturer_id` |
| `module_demand_forecasts` | `site_id` | → | `construction_sites` | `site_id` |
| `orders` | `bl_id` | → | `bl_shipments` | `bl_id` |
| `orders` | `company_id` | → | `companies` | `company_id` |
| `orders` | `customer_id` | → | `partners` | `partner_id` |
| `orders` | `product_id` | → | `products` | `product_id` |
| `orders` | `site_id` | → | `construction_sites` | `site_id` |
| `outbound_bl_items` | `bl_id` | → | `bl_shipments` | `bl_id` |
| `outbound_bl_items` | `outbound_id` | → | `outbounds` | `outbound_id` |
| `outbounds` | `bl_id` | → | `bl_shipments` | `bl_id` |
| `outbounds` | `company_id` | → | `companies` | `company_id` |
| `outbounds` | `dispatch_route_id` | → | `dispatch_routes` | `route_id` |
| `outbounds` | `order_id` | → | `orders` | `order_id` |
| `outbounds` | `product_id` | → | `products` | `product_id` |
| `outbounds` | `target_company_id` | → | `companies` | `company_id` |
| `outbounds` | `warehouse_id` | → | `warehouses` | `warehouse_id` |
| `partner_activities` | `author_user_id` | → | `user_profiles` | `user_id` |
| `partner_activities` | `follow_up_done_by` | → | `user_profiles` | `user_id` |
| `partner_activities` | `partner_id` | → | `partners` | `partner_id` |
| `partner_aliases` | `canonical_partner_id` | → | `partners` | `partner_id` |
| `partner_price_book` | `partner_id` | → | `partners` | `partner_id` |
| `partner_price_book` | `product_id` | → | `products` | `product_id` |
| `partners` | `owner_user_id` | → | `user_profiles` | `user_id` |
| `picking_list_items` | `location_id` | → | `warehouse_locations` | `location_id` |
| `picking_list_items` | `picking_list_id` | → | `picking_lists` | `picking_list_id` |
| `picking_list_items` | `product_id` | → | `products` | `product_id` |
| `picking_lists` | `partner_id` | → | `partners` | `partner_id` |
| `picking_lists` | `warehouse_id` | → | `warehouses` | `warehouse_id` |
| `po_line_items` | `po_id` | → | `purchase_orders` | `po_id` |
| `po_line_items` | `product_id` | → | `products` | `product_id` |
| `price_benchmarks` | `run_id` | → | `price_benchmark_runs` | `run_id` |
| `price_histories` | `company_id` | → | `companies` | `company_id` |
| `price_histories` | `manufacturer_id` | → | `manufacturers` | `manufacturer_id` |
| `price_histories` | `product_id` | → | `products` | `product_id` |
| `price_histories` | `related_po_id` | → | `purchase_orders` | `po_id` |
| `product_aliases` | `alias_product_id` | → | `products` | `product_id` |
| `product_aliases` | `canonical_product_id` | → | `products` | `product_id` |
| `product_package_items` | `child_product_id` | → | `products` | `product_id` |
| `product_package_items` | `package_id` | → | `products` | `product_id` |
| `products` | `manufacturer_id` | → | `manufacturers` | `manufacturer_id` |
| `purchase_orders` | `company_id` | → | `companies` | `company_id` |
| `purchase_orders` | `manufacturer_id` | → | `manufacturers` | `manufacturer_id` |
| `purchase_orders` | `parent_po_id` | → | `purchase_orders` | `po_id` |
| `receipt_matches` | `outbound_id` | → | `outbounds` | `outbound_id` |
| `receipt_matches` | `receipt_id` | → | `receipts` | `receipt_id` |
| `receipt_matches` | `sale_id` | → | `sales` | `sale_id` |
| `receipts` | `bank_account_id` | → | `bank_accounts` | `account_id` |
| `receipts` | `company_id` | → | `companies` | `company_id` |
| `receipts` | `customer_id` | → | `partners` | `partner_id` |
| `receiving_logs` | `location_id` | → | `warehouse_locations` | `location_id` |
| `receiving_logs` | `product_id` | → | `products` | `product_id` |
| `receiving_logs` | `warehouse_id` | → | `warehouses` | `warehouse_id` |
| `sales` | `customer_id` | → | `partners` | `partner_id` |
| `sales` | `order_id` | → | `orders` | `order_id` |
| `sales` | `outbound_id` | → | `outbounds` | `outbound_id` |
| `study_learning_plan_steps` | `domain_id` | → | `study_learning_domains` | `domain_id` |
| `study_learning_plan_steps` | `plan_id` | → | `study_learning_plans` | `plan_id` |
| `system_settings` | `updated_by` | → | `user_profiles` | `user_id` |
| `tt_remittances` | `po_id` | → | `purchase_orders` | `po_id` |
| `ui_configs` | `updated_by` | → | `user_profiles` | `user_id` |
| `user_profiles` | `company_id` | → | `companies` | `company_id` |
| `warehouse_locations` | `warehouse_id` | → | `warehouses` | `warehouse_id` |