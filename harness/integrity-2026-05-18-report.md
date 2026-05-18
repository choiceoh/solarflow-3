# DB 정합성 검증 4종 회귀 — 원인 분석 보고서 (2026-05-18)

`/admin/db-integrity` 에서 `주의` 라벨이 붙은 4개 검증의 원인을 prod DB 에 직접 쿼리해 식별하고, 자동 정정 가능한 2건은 마이그 M166/M167 로 동봉.

| # | 검증 | 현재 | 자동 정정 | 마이그 |
|---|---|---|---|---|
| 1 | `inbounds: supply+vat=total` | 50 | 가능 | M166 |
| 2 | `v_product_qty_balance: 출고>입고+초기 1.05` | 12 | **불가능 (데이터 갭)** | — |
| 3 | `v_product_qty_balance: balance < 0` | 13 | **불가능 (데이터 갭)** | — |
| 4 | `fifo allocated 합 ≠ outbound qty + spare` | 589 | 가능 | M167 |

---

## 1. `inbounds: supply+vat=total` (50건)

**검증식**: `count(*) FROM inbounds WHERE abs(supply + vat - total) > 5`

### 측정 분포
- 통화: KRW **50** / USD 0
- 부호: 전부 `supply + vat > total` (50/50). diff = vat 정확히.
- 패턴: `supply_amount == total_amount`, `vat_amount = round(supply × 0.1)` (50/50)

### 원인
[M126 `inbounds_supply_derive`](../backend/migrations/126_inbounds_supply_derive.sql) 의 3-step UPDATE 가 triplet 을 깨뜨림:

```sql
-- (1) supply 도출 — 정상
UPDATE inbounds SET supply_amount = ROUND(unit × spec × qty)
  WHERE supply_amount IS NULL OR supply_amount = 0;

-- (2) vat 도출 — supply × 10% 강제 (문제 1)
UPDATE inbounds SET vat_amount = ROUND(supply * 0.1)
  WHERE vat_amount IS NULL OR vat_amount = 0;

-- (3) total 도출 — total 이 이미 채워져 있으면 SKIP (문제 2)
UPDATE inbounds SET total_amount = supply + vat
  WHERE total_amount IS NULL OR total_amount = 0;
```

이미 import 단계에서 `total_amount = supply_amount` (= `erp_supply` 값) 로 잘못 적재된 행에는 (3) 의 가드가 걸려 total 이 갱신 안 됐다. 결과: `total = supply, vat = supply × 0.1`.

### 두 분기 (source_payload.erp_vat 로 판별)
- **A: `erp_vat > 0` (30건, KRW)** — ERP 원본 triplet 정상, DB 의 `total_amount` 적재 오류.
  - 예: inbound 0fbcd20b — `erp_supply=21,494,970, erp_vat=2,149,497, erp_total=23,644,467`. DB total=21,494,970 → 23,644,467 로 수정.
- **B: `erp_vat = 0` (20건, USD 면장 기반)** — ERP 원본 VAT 없음. M126 (2) 가 잘못 추가.
  - 예: inbound baa521da — USD 구매승인서, `erp_vat=0`. DB vat=91,991,808 → 0 으로 정정.

### 정정
M166 마이그가 두 분기를 자동 적용. dry-run: 30+20 = 50, 잔존 0.

---

## 2 / 3. `v_product_qty_balance` 누계 검증 (12 + 13건)

**검증식**:
- `count(*) FROM v_product_qty_balance WHERE outbound_qty > (initial_qty + inbound_qty) × 1.05` → 12
- `count(*) FROM v_product_qty_balance WHERE balance_qty < 0` → 13

### `v_product_qty_balance` 정의 (참고)
[`scripts/fix_data_integrity.py:150`](../scripts/fix_data_integrity.py) 에서 생성됨 (정본 마이그 없음 — 별도 follow-up 필요):

```sql
CREATE OR REPLACE VIEW v_product_qty_balance AS
WITH initial_stock AS (
  SELECT product_id, sum(beginning_qty) FROM inventory_movements
  WHERE movement_subtype = '기초' GROUP BY product_id
), inbound_sum AS (
  SELECT product_id, sum(quantity) FROM inbounds GROUP BY product_id
), outbound_sum AS (
  SELECT product_id, sum(quantity) FROM outbounds
  WHERE status='active' GROUP BY product_id
)
SELECT p.product_id, p.product_code, p.spec_wp,
  COALESCE(i.initial_qty, 0) AS initial_qty,
  COALESCE(ib.in_qty, 0) AS inbound_qty,
  COALESCE(ob.out_qty, 0) AS outbound_qty,
  COALESCE(i.initial_qty, 0) + COALESCE(ib.in_qty, 0) - COALESCE(ob.out_qty, 0) AS balance_qty
FROM products p ...
```

### 13개 음수 product 전체 (※ 12개는 5% 초과분의 부분집합)

| product_code | initial | inbound | outbound | balance | decl_qty | inbound 행수 |
|---|---:|---:|---:|---:|---:|---:|
| JKM635N-78HL4-BDV-S | 62,886 | 604,232 | 906,137 | **-239,019** | 3,547,854 | 49 |
| LR7-72HYD-650M | 80 | 4,795 | 39,091 | **-34,216** | 57,291 | 1 |
| LR7-72HYD-655M | 0 | 0 | 7,091 | **-7,091** | 8,797 | 0 |
| Q.TRON XL-G2.7 BFG CFP2 625 | 17,600 | 13,810 | 34,663 | -3,253 | — | 2 |
| HS500XC-GHE20 | 0 | 2,058 | 4,116 | -2,058 | — | 2 |
| CS7N-655MB-AG | 665 | 0 | 1,554 | -889 | — | 0 |
| CS7N-660MB-AG | 1,387 | 0 | 2,117 | -730 | — | 0 |
| LR8-66HYD-650M | 0 | 0 | 655 | -655 | — | 0 |
| LG285S1W-L4 | 313 | 0 | 598 | -285 | — | 0 |
| JAM72D42-640LB | 34 | 7,812 | 8,049 | -203 | 7,812 | 1 |
| HIS-T640NJ-ES | 0 | 552 | 708 | -156 | — | 2 |
| CS6U-320P | 88 | 0 | 112 | -24 | — | 0 |
| Q.PEAK L-G4.4 365 | 1 | 0 | 2 | -1 | — | 0 |

### 두 클러스터로 분리됨

**Cluster A — 면장 (import_declarations) 은 충분한데 inbounds 누락** (4종)
- JKM, LR7-72HYD-650M, LR7-72HYD-655M, JAM72D42-640LB
- 예: LR7-72HYD-650M 은 면장 57,291 EA 등록됐는데 inbound 는 1행 (4,795 EA) 만 생성됨. 면장→inbound 변환이 부분 실패.
- 정정 경로: 누락된 inbound 행을 면장 기준 백필 (별도 PR).

**Cluster B — 면장도 없음** (9종)
- Q.TRON, HS500XC, CS7N-655MB, CS7N-660MB, LR8-66HYD, LG285S1W, HIS-T640NJ, CS6U-320P, Q.PEAK
- 대부분 inbound 행수도 0 또는 1~2 → 국내 도매/이관/제품 코드 매핑 오류 후보.
- 예: HS500XC-GHE20 outbound 4,116 EA 인데 inbound 2행, 면장 0 — 그러나 outbound 의 `M-HS0500-04` ERP 코드가 별도 inbound (RV2502000005, 2,050 EA, 246M KRW supply) 에 등장. 제품 코드 매핑(M-HS0500-04 → HS500XC-GHE20) 확인 필요.

### 자동 정정 불가능
- inbound 행을 만들려면 단가/공급사/면장 매핑/입고일 등 비즈니스 데이터 필요.
- → 운영자 검토 후 ERP 입고 시트 reimport 또는 수기 입력으로 해결.
- 본 PR 에는 정정 포함 안 함. 위 표가 follow-up TASK 의 입력 자료.

---

## 4. `fifo allocated 합 ≠ outbound qty + spare` (589건)

**검증식**:
```sql
WITH t AS (
  SELECT o.outbound_id, o.quantity, COALESCE(o.spare_qty, 0) AS sp,
    (SELECT sum(allocated_qty) FROM fifo_matches WHERE outbound_id=o.outbound_id) AS fm_sum
  FROM outbounds o
  WHERE o.usage_category IN ('sale', 'sale_spare') AND o.status='active'
) SELECT count(*) FROM t WHERE fm_sum IS NOT NULL AND fm_sum != quantity + sp
```

### 측정 분포

| usage_category | mismatch | over | under | no_fifo | ok |
|---|---:|---:|---:|---:|---:|
| sale | 571 | 0 | 571 | 184 | 1225 |
| sale_spare | 18 | 0 | 18 | 133 | 661 |

전부 `fm_sum < quantity + spare_qty` (under). over 0건. 그리고 모든 589 건에서 `fm_sum = quantity` (메인 FIFO 가 출고수량과 정확히 일치하고, spare FIFO 만 누락).

### 원인 — orphan spare_qty
[M097-100 의 fifo realign / pattern split](../backend/migrations/097_fifo_realign_overalloc.sql) 시리즈가 over-allocated outbound 의 `상품판매(스페어)` fifo_matches 를 별도 sale_spare outbound 로 분리했지만, **원본 outbound 의 `spare_qty` 컬럼은 갱신하지 않았다**. [M137](../backend/migrations/137_synthesize_orders_from_outbound.sql) + M138 의 construction 전환에서도 같은 패턴 발생.

예 — IS2509000118:
- sale outbound (d74024dc): `qty=72, spare_qty=36,698, fm_sum=72` ← 589 mismatch 행
- construction outbound (24e1132a, 같은 erp_no, 2026-05-04 M137 생성): `qty=36,698, spare_qty=NULL, fm_sum=36,698` ✓
- → 36,698 EA 의 spare 는 construction 으로 이미 옮겨갔는데, 원본 sale 의 `spare_qty=36,698` 가 잔재로 남음.

검증: 589건 중 **452건 (76.7%)** 의 `spare_qty` 가 같은 `erp_outbound_no` 의 sibling outbound `quantity` 합과 정확히 일치. 나머지 137건도 같은 erp_no 의 다른 outbound (586/589) 가 존재하거나 정리 후 잔여 (3건).

### 정정
M167 마이그가 `spare_qty := GREATEST(0, fm_sum - quantity)` 로 재계산.
- dry-run: 589건 → 0건. 589행 변경, 순 -79,624 EA phantom spare 제거.
- 부작용 분석:
  - **engine grep 결과 spare_qty 참조 0건** — Rust margin/cost 산식은 fifo_matches 직접 사용
  - frontend `OutboundDetailView` 에 무상 수량이 더 정확하게 표시됨 (72 EA 매출에 36,698 spare → 0)
  - 모든 589 outbound 에 sales 행이 존재 (orphan 매출 아님)

### 추가 관찰 — `outbounds.spare_qty 음수` 검증과의 관계
M091 의 `outbounds.negative_spare_qty` 검증은 `spare_qty < 0` 만 보지만, prod 에는 `spare_qty > quantity` 행이 99건 있음 (합계 68,172 EA). M167 의 GREATEST(0, ...) 가 동시 해소.

---

## 후속 작업 (이 PR 범위 밖)

1. **inbound 행 백필** (Cluster A 4종 + Cluster B 9종) — 운영자가 ERP 원본 재확인
2. **`v_product_qty_balance` 정본 마이그** — 현재 `scripts/fix_data_integrity.py` 가 런타임에 CREATE OR REPLACE. 마이그로 옮겨야 schema_migrations 추적 가능
3. **M126 가드 강화** — 향후 신규 inbound 가 같은 패턴으로 들어올 때 차단하려면 `CHECK (abs(supply+vat-total) <= 5)` constraint 검토

---

## 검증 (운영 반영 후)

```sql
SELECT name, actual FROM v_integrity_check
WHERE name IN (
  'inbounds: supply+vat=total',
  'v_product_qty_balance: 출고>입고+초기 1.05',
  'v_product_qty_balance: balance < 0',
  'fifo allocated 합 ≠ outbound qty + spare'
);
-- 기대:
--   inbounds: supply+vat=total                     → 0   (M166)
--   fifo allocated 합 ≠ outbound qty + spare       → 0   (M167)
--   v_product_qty_balance: 출고>입고+초기 1.05     → 12  (변동 없음, 운영자 검토 대기)
--   v_product_qty_balance: balance < 0             → 13  (변동 없음, 운영자 검토 대기)
```
