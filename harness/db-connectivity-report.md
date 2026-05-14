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

머지 순서: 마이그 번호순 (111 → 118)

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
