# DB 정합성 검증 4종 회귀 — 원인 분석 보고서 (2026-05-18)

`/admin/db-integrity` 에서 `주의` 라벨이 붙은 4개 검증의 원인을 prod DB 에 직접 쿼리해 식별하고, 자동 정정 가능한 2건은 마이그 M166/M167 로 동봉.

| # | 검증 | 현재 | 자동 정정 | 마이그 |
|---|---|---|---|---|
| 1 | `inbounds: supply+vat=total` | 50 | 가능 | M166 |
| 2 | `v_product_qty_balance: 출고>입고+초기 1.05` | 12 | **운영자 dedup** | — |
| 3 | `v_product_qty_balance: balance < 0` | 13 | **운영자 dedup** | — |
| 4 | `fifo allocated 합 ≠ outbound qty + spare` | 589 | 가능 | M167 |
| 5 | `면장 사후신고 (low)` baseline 노후 | 86 (43→) | 가능 | M169 |
| — | `v_product_qty_balance` 마이그 정본 누락 | — | 가능 | M168 |

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

## 13-product 후속 조사 (2026-05-18 follow-up)

운영자 자동 정정 가능성을 확인하기 위해 prod 데이터로 두 가설 검증.

### 가설 1 — outbound 중복 (date/qty 동일 그룹)

음수재고 product 별로 `(product_id, outbound_date, quantity)` 동일 그룹의 dup 행을 1순위로 남기고 나머지를 제거하면 balance 어디까지 회복되는가:

| product_code | 현 balance | dedup 후 balance | 평가 |
|---|---:|---:|---|
| JKM635N-78HL4-BDV-S | -239,019 | **-93,101** | 절반 회복, 잔존 |
| LR7-72HYD-650M | -34,216 | -32,661 | 거의 변동 없음 |
| LR7-72HYD-655M | -7,091 | -6,278 | 거의 변동 없음 |
| Q.TRON XL-G2.7 BFG CFP2 625 | -3,253 | -1,662 | 절반 회복, 잔존 |
| HS500XC-GHE20 | -2,058 | -2,058 | dedup 0건 (가설 2 케이스) |
| CS7N-655MB-AG | -889 | -889 | dedup 0건 |
| CS7N-660MB-AG | -730 | -730 | dedup 0건 |
| LR8-66HYD-650M | -655 | -655 | dedup 0건 |
| LG285S1W-L4 | -285 | -285 | dedup 0건 |
| **JAM72D42-640LB** | **-203** | **+126** | **dedup 으로 해소** ✓ |
| HIS-T640NJ-ES | -156 | -156 | dedup 0건 |
| CS6U-320P | -24 | -24 | dedup 0건 |
| Q.PEAK L-G4.4 365 | -1 | -1 | dedup 0건 |

JAM72D42-640LB 만 dedup 으로 완전 해소. JKM 과 Q.TRON 은 부분 해소.

### 가설 2 — '월말 erp_no NULL' 중복 (HS500XC 패턴)

가설 1 에서 0건이지만 실제로는 중복인 케이스. HS500XC-GHE20 의 outbound 타임라인:

| date | qty | erp_outbound_no |
|---|---:|---|
| 2025-03-14 | 480 | IS2503000294 |
| 2025-03-20 | 288 | IS2503000293 |
| **2025-03-31** | **288** | **(none)** ← #2 중복 의심 |
| **2025-03-31** | **480** | **(none)** ← #1 중복 의심 |
| 2025-04-28 | 994 | IS2504000353 |
| **2025-04-30** | **994** | **(none)** ← #5 중복 의심 |
| 2025-05-01 | 296 | IS2505000256 |
| **2025-05-31** | **296** | **(none)** ← #7 중복 의심 |

월말(30/31) + erp_no NULL + 같은 달의 erp_no 있는 행과 qty 일치 → 별도 채널 (예: 수불 시트) 에서 같은 출고를 재입력한 것으로 추정. 합 288+480+994+296 = **2058 EA = 정확히 shortage**.

13 product 별 '월말 erp_no NULL' 수량:

| product_code | 월말 NULL qty | 현 balance |
|---|---:|---:|
| HS500XC-GHE20 | 2,058 | -2,058 (= 정확히 일치) |
| CS7N-660MB-AG | 1,058 | -730 |
| JKM635N-78HL4-BDV-S | 231,528 | -239,019 |
| Q.TRON XL-G2.7 BFG CFP2 625 | 12,507 | -3,253 |
| HIS-T640NJ-ES | 156 | -156 (정확히 일치) |
| LG285S1W-L4 | 299 | -285 |
| Q.PEAK L-G4.4 365 | 1 | -1 (정확히 일치) |
| CS6U-320P | 56 | -24 |
| 나머지 5종 | 0 ~ 327 | 다양 |

7종이 '월말 NULL' 패턴으로 설명됨. 단, **자동 dedup 마이그는 위험**:
- 같은 (product, date, qty) 가 진짜 두 번 출고된 케이스 (예: 같은 거래처에 같은 모델 두 번)
- 월말 NULL 이 진짜 ERP 별도 채널에서 들어온 정당한 출고일 가능성

→ 운영자가 product 별로 ERP 원본 (`수불 시트` + `출고 시트`) 을 대조해 dedup 후보 outbound 를 직접 cancel 또는 inactive 처리하는 것이 정공법. 본 보고서가 그 작업의 입력 자료.

### Cluster B (면장 없음) 의 추가 관찰

HS500XC-GHE20 의 outbound 는 source_payload 에 `erp_code` 가 없지만 (출고 시트 path), inbound 에 `erp_model='HS500XC-GHE20', erp_code='M-HS0500-04'` 로 2,050 EA 가 들어와 있음. 즉 inbound 와 outbound 모두 같은 product_id 를 가리키고 있어 코드 매핑 문제는 아님. shortage 2,058 EA 는 위 dedup 후보 4건이 정확히 설명.

---

## 후속 작업 (이 PR 범위 밖)

1. **운영자 dedup 결정** (위 7종 + JAM72D42) — ERP 원본 대조 후 중복 outbound 를 status='cancelled' 또는 isactive=false 처리
2. **inbound 행 백필** — LR7-72HYD-650M/655M 처럼 dedup 으로도 안 풀리는 4종은 면장→inbound 변환의 부분 실패 가능. 면장 declared qty 가 outbound 를 충분히 커버하는 경우 ERP 입고 시트 reimport
3. **M126 가드 강화** — 향후 신규 inbound 가 같은 패턴으로 들어올 때 차단하려면 `CHECK (abs(supply+vat-total) <= 5)` constraint 검토

---

## 검증 (운영 반영 후)

```sql
SELECT name, baseline, actual, status FROM v_integrity_check
WHERE status='fail'
ORDER BY severity, name;
-- 기대 (M166 + M167 + M168 + M169 적용 후):
--   inbounds: supply+vat=total                     → 0       (M166)
--   fifo allocated 합 ≠ outbound qty + spare       → 0       (M167)
--   v_product_qty_balance: 출고>입고+초기 1.05     → 12      (변동 없음, 운영자 dedup 대기)
--   v_product_qty_balance: balance < 0             → 13      (변동 없음, 운영자 dedup 대기)
--   면장 사후신고 (declaration > arrival)          → pass    (M169: baseline 43→86)
```

## 마이그 멱등성 메모

- **M168** `v_product_qty_balance_canonical`: 본문이 prod 의 현재 view 정의와 동일. CREATE OR REPLACE 라 멱등.
- **M169** `integrity_baseline_decl_after_arrival_refresh`: 이미 baseline=86 인 경우 no-op (match 카운트 분기). 정상 적용 시 정확히 1 매치 보장, 그 외엔 RAISE EXCEPTION.
  - ⚠️ 본 마이그는 **운영 DB 에 수동 적용된 상태로 출발**한다 (조사 중 실수로 commit 모드 실행됨, 멱등 가드가 cron-deploy 재실행 시 안전하게 no-op 처리). schema_migrations 에는 cron-deploy 가 정상 적용 후 등록.
