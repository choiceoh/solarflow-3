# SolarFlow Data Sources (External Reference Catalog)

**목적**: 운영자가 사용하는 외부 엑셀/자료 파일이 DB의 어느 테이블·컬럼에 매핑되는지, 어떤 자료가 백필 소스인지, 무엇이 아직 갭으로 남았는지 한 곳에 정리.

`db-connectivity-report.md` 가 **DB 내부** 정본이라면, 이 문서는 **DB 바깥 (운영자의 엑셀·회계장부·발주서 아카이브)** 의 정본 인덱스다.

본 문서는 `db-connectivity-report.md` 처럼 **누적 reference (Living document)** 다. 외부 자료 형식이 바뀌거나 새 자료가 들어올 때 같은 PR 에서 갱신한다.

생성: 2026-05-15

## 0-bis. 운영 DB 현재 상태 (2026-05-15 기준, gx10 직접 쿼리)

`db-connectivity-report.md § 9` 의 "빈 도메인" 표가 일부 stale 함을 정정:

| 테이블 | 행수 | 비고 |
|---|---:|---|
| `bl_shipments` | **150** | 면장 있음 100 / 없음 50 |
| `import_declarations` | **101** | cost_details 있음 100 / 없음 1 |
| `cost_details` | **100** | CIF 합 1,049억 / landed 1,172억 |
| `cost_details.incidental_cost` (NOT NULL) | **47 / 100** | M130/M131 백필분, 합계 18.3억 |
| `cost_details.customs_fee` | **0 / 100** | ❌ 전체 미백필 |
| `incidental_expenses` | **0** | ⚠️ M130/M131 은 신규 행이 아니라 `cost_details.incidental_cost` 컬럼에 직접 update — 회계 추적성 위해선 별도 백필 필요 |
| `purchase_orders` | **62** | 탑솔라 47 / 디원 11 / 화신 4. 41 / 62 가 LC 연결됨 |
| `po_line_items` | **111** | |
| `lc_records` | **49** | 탑솔라 37 / 디원 9 / 화신 3 |
| `lc_line_items` | **0** | ❌ 미백필 |
| `fifo_matches` | 3326 | |
| `outbounds` / `sales` | 3369 / 3116 | |

**2025 매출/원가**:
- 매출 (sale + sale_spare): 376.4억
- FIFO 원가: 294.1억
- 매출총이익 (시스템): 82.3억 (21.9%)
- **회계 vs 시스템 갭 ≈ 17억** — 회계 매출원가에 부대비용 가산 후 차이

---

## 0. 자료 위치

원본 자료는 모두 Dropbox `8. 코딩/솔라플로우 참고 자료/` 아래에 있다 (운영자 PC 동기화).

```
C:\Users\user\Dropbox (개인용)\8. 코딩\솔라플로우 참고 자료\
├── solarflow 자료.xlsx                            ─── ERP raw 통합본 (출고/매출/입고/수불/재고/FIFO/면장)
├── 탑솔라 그룹 모듈 출고현황.xlsx                  ─── 세금계산서 발행 트래커 (탑/디원/화신)
├── (수입) BL별 출고현황리스트.xlsx                 ─── 제조사별 BL별 출고 현황
├── 2025년, 2026년 모듈 부대비용, 운송료 내역.xlsx  ─── 회계 전표 (선진/블루오션/스마일)
├── 수입진행상황(module)-2025년도.xlsx (191MB)      ─── 25년도 발주~선적~통관 stage 트래커
├── 수입진행상황(module)-2026년도.xlsx              ─── 26년도 동일
├── 바로 모듈판매현황_이익률_26년1Q.xlsx             ─── baro 테넌트 모듈 판매 이익률
├── 2024년 모듈발주.zip   (663MB, 1057 entries)     ─── 24년 발주 아카이브
├── 2025년 모듈 발주.zip  (956MB, 1329 entries)     ─── 25년 발주 아카이브
├── 2026년 모듈 발주.zip  (1.1GB,  639 entries)     ─── 26년 발주 아카이브
├── 2025년 운송료/                                  ─── 25년 운송료 청구서 (BL별)
└── (스크린샷·PDF·수입필증 단건들)
```

회사 매핑 (`db-connectivity-report.md § 1` 의 4개 테넌트):

| 자료상 표기 | code | company_id | DB 매핑 |
|---|---|---|---|
| 탑솔라 / 탑솔라(주) / 광주공장 / 광주 | TS | `99f0fc15-…` | 탑솔라(주) |
| 디원 / ㈜디원 | DW | `84e646b9-…` | 디원 |
| 화신 / 화신이엔지 | HS | `a9c3c675-…` | 화신이엔지 |
| 바로 / 바로(주) | BR | `e41f100b-…` | 바로(주) |

---

## 1. 자료 카탈로그 (한눈에)

| # | 파일 | 성격 | 주기 | 주요 DB 매핑 | 백필 상태 |
|---|---|---|---|---|---|
| A | `solarflow 자료.xlsx` | ERP raw 통합본 | 수시 | outbounds / sales / inbounds / fifo_matches / import_declarations | ✅ 운영 DB 가 정본 (이 엑셀이 export 결과) |
| B | `탑솔라 그룹 모듈 출고현황.xlsx` | 세금계산서 워크플로우 트래커 | 월/주 | outbounds.workflow_flags + sales | 🟡 워크플로우 플래그 매핑 검토 필요 |
| C | `(수입) BL별 출고현황리스트.xlsx` | BL별 출고 분배 (수기) | 수시 | bl_shipments + outbound_bl_items | ✅ M113~M115 백필 완료 |
| D | `2025/26년 모듈 부대비용 운송료 내역.xlsx` | 회계 전표 (외상매입금·미지급비용) | 월말 | incidental_expenses + cost_details.incidental_cost | 🟢 M130(부대비용) + M131(BL별 9건) 완료, 잔여분 백필중 |
| E1 | `수입진행상황(module)-2025년도.xlsx` (191MB, **8 시트**) | 발주~선적~통관 + **외환 LC 현황 + BL별 CIF·운송료 품의서 + 차량 적재 매트릭스** | 주 | bl_shipments + import_declarations + lc_records / cost_details + incidental_expenses | 🟡 LC/품의서 미백필 — 1순위 |
| E2 | `수입진행상황(module)-2026년도.xlsx` (110KB, 6 시트, 제조사별 분리) | 발주~선적~통관 stage (E1 의 경량판) | 주 | 동일 | 🟡 LC/PO 미백필 |
| F | `2024년 모듈발주.zip` 안 발주서·FR·CI·PL | PO/PI/BL/FR 원본 (PDF+xlsx) | 발주 단위 | purchase_orders / po_line_items / lc_records (빈테이블) | ❌ 미백필 (raw 아카이브) |
| G | `2025/26년` zip 안 동일 구조 | 동일 | 동일 | 동일 | ❌ |
| H | `2024년 재고/2024.12.26 - 탑솔라 - 재고현황.xls` (24년 zip 안) | BL별 컨테이너·팔레트 단위 기말재고 스냅샷 | 연말 1회 | fifo_matches.usage_category_raw='기초재고' 행의 출처 | ✅ 운영 DB 에 반영됨 |
| I | `자재 2024년/발전시공일정.xlsx` (24년 zip 안) | 발전소별 모듈·인버터 발주 일정 | 분기 | (영업 자료, DB 매핑 없음) | ❌ orders/projects 정합 검토 가능 |
| J | `운송료 청구자료/...탑솔라 보관료 청구내역` (zip + 25년 운송료 폴더) | BL·컨테이너별 보관료/운송료 청구서 | 월 | incidental_expenses (expense_type=storage / transport) | 🟢 M131 9건, 나머지 50+건 미백필 |
| K | `클레임/...정리.xlsx` (26년 zip 안) | 모듈 데미지 클레임 | 사고 시 | (DB 매핑 없음 — 신규 도메인 후보) | ❌ |
| L | `바로 모듈판매현황_이익률_26년1Q.xlsx` | baro 테넌트 매출/이익률 | 분기 | sales (company_id=baro) | ✅ DB 에서 동일 집계 가능 (`bp/sales_dashboard`) |

범례: ✅ DB 가 정본 · 🟢 부분 백필됨 · 🟡 부분 매핑됨 · ❌ 미백필

---

## 2. 자료별 상세

### A. `solarflow 자료.xlsx` — ERP raw 통합본

**성격**: ERP 시스템에서 export 한 raw 데이터를 시트별로 모아둔 분석용 통합본. 운영 DB 의 mirror 이므로 **DB 가 정본**, 이 엑셀은 분석 용도.

| 시트 | 행수 | 컬럼 | DB 매핑 | 비고 |
|---|---:|---|---|---|
| `DB-3` | 116 | 50 | `import_declarations` + `cost_details` (집계) | 면장 원본 + 유상/무상 분리 + FIFO 단가. 사람 분석용 보고서. |
| `디원화신fifo` | 728 | 40 | `fifo_matches` (corporation IN ('디원','화신')) | ERP 출고 ↔ 입고 FIFO 매칭. 40 컬럼 다 매핑됨. |
| `탑솔라Fifo_복사본` | 2,615 | 40 | `fifo_matches` (corporation='탑솔라') | 동일 |
| `수불` | 1,857 | 29 | `inventory_movements` + `inbounds` + `outbounds` | 품목별 일별 수불 (창고/장소 단위) |
| `재고` | 94 | 13 | `inventory_snapshots` (또는 view) | 품번별 기말재고 |
| `출고` | 2,446 | 52 | `outbounds` + `sales` + `fifo_matches` 합본 | 한 출고 = 한 행 (sale_unit_price, supply_amount 포함) |
| `매출` | 2,418 | 41 | `sales` | 세금계산서 단위 (마감번호=`SCxxxxxxxxxxx`) |
| `입고` | 119 | 35 | `inbounds` | DOMESTIC 입고만 (수입 입고는 `import_declarations` 경유) |

#### A.1 fifo 시트의 40 컬럼 → fifo_matches/import_declarations 매핑

```
품번 → products.product_code
품명 → products.product_name
규격 → products.spec_wp (e.g. "635Wp")
입고구분 → inbounds.inbound_type ('DOMESTIC' / 'IMPORT' / '기초재고')
입고일자/번호/순번 → inbounds.inbound_date / erp_inbound_no
공급처 → partners.partner_name (또는 manufacturers.name_kr)
Wp단가 / EA원가 / LOT입고수량 → inbounds (단가는 fifo_matches.ea_unit_cost 와 다를 수 있음 — 재고 정산 후)
출고일자/번호 → outbounds.outbound_date / erp_outbound_no
고객 → partners (customer)
관리구분 → outbounds.usage_category (한글 raw)
프로젝트 → outbounds.site_name
출고수량원본 / 배분수량 → fifo_matches.allocated_qty (배분수량 = 분할 출고 후 매칭된 수량)
원가금액 → fifo_matches.cost_amount  (= 배분수량 × ea_unit_cost)
판매단가 / 판매금액 / 이익금액 / 이익률 → fifo_matches.sales_unit_price_ea / sales_amount / profit_amount
수입면장번호 / B/L No. / L/C No. → import_declarations.declaration_number / bl_shipments.bl_number / lc_records.lc_number(빈테이블)
조달구분 → '국내매입' / '수입' / '기초재고'
법인 → fifo_matches.corporation (한글, 'TS'=탑솔라 / 'DW'=디원 / 'HS'=화신)
제조사명(한글/영문) → manufacturers.name_kr / name_en
입항일 → bl_shipments.actual_arrival
계약단가(USD/Wp) / 계약총액_안분 / 가격조건(Incoterms) / 적용환율(원/USD) / 면장CIF_안분(원) → import_declarations
구매ID → (외부 키 — DB 에는 없음)
수입법인구분 → bl_shipments.inbound_type (import / domestic / domestic_foreign / group)
판매Wp단가 → fifo_matches.sales_unit_price_ea × 1000 / spec_wp (계산값)
```

**함정 (참조: db-connectivity-report.md § 6)**:
- `법인` 컬럼은 한글 자유 텍스트 ↔ DB 의 `fifo_matches.corporation` 도 한글 (uuid 아님)
- `구매ID` 같은 `TS-JK-2501-01` 형식은 운영자의 정리 키 — DB 에는 컬럼 없음. 필요시 import_declarations 에 보조 컬럼 추가 가능

#### A.2 출고/매출 시트의 52/41 컬럼

`출고` 시트 = `outbounds` + `sales` + `fifo_matches` LEFT JOIN 의 ERP 표현. 핵심 매핑:

```
거래구분 → outbounds (DOMESTIC vs IMPORT — bl_shipments.inbound_type 와 연동)
출고일자 → outbounds.outbound_date
출고번호 → outbounds.erp_outbound_no (e.g. 'IS2501000024')
고객 → partners.partner_name
관리구분 → outbounds.usage_category_raw (한글: '상품판매' / '공사사용' / ...)
프로젝트 / 비고(건/내역) → outbounds.site_name / memo
단가 / 공급가 / 부가세 / 합계액 → sales.unit_price_ea / supply_amount / vat_amount / total_amount
출고창고 / 출고장소 → warehouses.warehouse_name
LOT No. → bl_shipments.bl_number (간접)
FIFO매칭키 → fifo_matches 의 자연키 (`erp_outbound_no | product_code | qty | category`)
```

`매출` 시트 = `sales` 직접 dump. 마감번호 (`SC2501000032`) 가 PK 역할.

---

### B. `탑솔라 그룹 모듈 출고현황.xlsx` — 세금계산서 워크플로우 트래커

**성격**: 탑/디원/화신 3법인 통합 출고에서 거래명세서 → 인수검수요청서 → 결재요청 → 계산서발행 4단계 워크플로우 체크리스트.

**시트**: `세금계산서 발행(탑, 디원, 화신)` (1148행 × 27열)

**컬럼**:

```
구분 → 법인 + 월 (e.g. '탑솔라 (1월)')
납품일자 → outbounds.outbound_date
업체명 → partners.partner_name (customer)
발전소명 / 주소 → outbounds.site_name / site_address
모델명 → products.product_name
수량 → outbounds.quantity
용량 → outbounds.capacity_kw
출고잔량 → orders.remaining_qty (계산값)
단가 / 공급가액 / 세액 / 합계 → sales.unit_price_ea / supply_amount / vat_amount / total_amount
거래명세서 → outbounds.tx_statement_ready (D-055)
인수검수요청서 → outbounds.inspection_request_sent (D-055)
결재요청 → outbounds.approval_requested (D-055)
계산서발행 → outbounds.tax_invoice_issued (D-055)
```

**상태**: outbounds 워크플로우 플래그 4개는 DB 에 이미 있음 (D-055). 본 엑셀의 True/False 가 DB 의 boolean 과 일치하는지 정기 정합 검증 권장.

---

### C. `(수입) BL별 출고현황리스트.xlsx` — BL × 출고 분배

**성격**: 한 BL 의 수입 모듈이 어느 출고로 분할 출고되었는지 운영자가 수기 정리. **운영자가 작성하는 정본 출처** — `outbound_bl_items` 백필의 원본.

**시트별 구조**:

| 시트 | 행수 | 핵심 컬럼 | 비고 |
|---|---:|---|---|
| `진코솔라` (mainly 24년) | 1,796 | 발주처/B/L/항구/포워더/ETD/ETA/모델명/모듈수량/용량/출고일/출고지/지역/WP/출고수량 | 24년물 |
| `진코솔라 (2)` (25년) | 321 | 동일 + 분할 출고 컬럼 (블루↔씨앤아이) | 25년 일부 BL 은 한 컨테이너 분배가 복잡 (3개 출고지로 분할 → 한 BL 행에 가로로 stack) |
| `JA솔라` | 58 | 동일 | |
| `트리나솔라` | 234 | 동일 | |
| `라이젠에너지` | 84 | 동일 | |
| `론지솔라` | 454 | 동일 | |

**DB 매핑**:

```
B/L → bl_shipments.bl_number
ETD / ETA → bl_shipments.etd / eta
항구 → bl_shipments.port
포워더 → bl_shipments.forwarder
모델명 → products.product_name (via bl_line_items.product_id)
모듈수량 / 용량 → bl_line_items.quantity / bl_line_items.capacity_kw
출고일 / 출고지 / 출고수량 → outbounds + outbound_bl_items.quantity
```

**현재 상태**: M111~M115 마이그로 `bl_shipments` / `bl_line_items` / `outbound_bl_items` 백필 완료 (`db-connectivity-report.md § 10`).

---

### D. `2025년, 2026년 모듈 부대비용, 운송료 내역.xlsx` — 회계 전표

**성격**: 회계팀이 ERP 에서 export 한 거래처별 외상매입금/미지급비용 원장. 한 행 = 한 분개.

**시트** (6개, 거래처×연도):

| 시트 | 행수 | 거래처 | 계정과목 | 내용 |
|---|---:|---|---|---|
| `선진로지스틱스(25년)` | 80 | 선진로지스틱스(주) 광주지점 | 외상매입금 | 보관료/통관/CFS |
| `선진로지스틱스 (26년)` | 45 | 동일 | 동일 | |
| `블루오션에어(25년)` | 92 | (주)블루오션에어 | 외상매입금 | CFS CHARGE/통관 |
| `블루오션에어 (26년)` | 56 | 동일 | 동일 | |
| `스마일로지스 (25년)` | 17 | 스마일로지스 | 미지급비용 | 광주공장 운송료 |
| `스마일로지스 (26년)` | 14 | 동일 | 동일 | |

**컬럼**: `거래처코드 / 거래처명 / 회계단위코드 / 회계단위명 / 계정과목명 / 승인일 / 승인번호 / 적요 / 차변 / 대변 / 잔액 / [기준잔액 분리] / 전표번호`

**핵심**: **`적요` 컬럼**에 BL 번호가 들어있음:
- `SHACYR14644(LR7-72HGD-615M * 8` → BL `SHACYR14644`
- `C.F.S CHARGE` → BL 정보 없음 (별도 청구서 필요)
- `B/L : EASED2539LK006 CUSTOMS C` → BL `EASED2539LK006`
- `8월 모듈 운송료` → 월별 운송료 (특정 BL 미연결)

**DB 매핑**:

```
승인일 → incidental_expenses.expense_date
대변 (지급금액) → incidental_expenses.amount
거래처명 → incidental_expenses.partner_id (via partners.partner_name)
적요 → incidental_expenses.memo  +  bl_id 추출
계정과목 → expense_type (외상매입금/미지급비용 → transport/storage/customs_fee 등 분류)
전표번호 → incidental_expenses.erp_voucher_no
```

**현재 상태**: M130 (부대비용 백필) + M131 (BL별 정밀 보강 9건) 완료. **잔여 50+건**은 적요에서 BL 번호 못 뽑은 케이스 — 운영자가 BL별 청구서 (Section J) 와 대조해야 매칭 가능.

---

### E. `수입진행상황(module)-{2025|2026}년도.xlsx` — 발주~선적 stage 트래커

**성격**: 매주 운영자가 갱신하는 발주 파이프라인 마스터 시트. 한 행 = 한 PO/BL. **25년 파일과 26년 파일이 구조가 다르다** — 25년은 외환·품의서·차량까지 통합된 광범한 마스터, 26년은 제조사별 발주 트래커 위주.

#### E.1 2025년도 파일 (191MB, 8 시트) — **광범한 운영 마스터**

| 시트 | 행수 | 열수 | 내용 | DB 후보 |
|---|---:|---:|---|---|
| `2024` | 799 | 53 | 24년 발주~선적~통관~현장배송 마스터 (한 행 = 한 PO/BL) | purchase_orders + lc_records + bl_shipments + import_declarations |
| `2025` | 1,214 | 55 | 25년 동일 + **발주처 컬럼** (탑솔라/디원/화신) | 동일 + outbounds.company_id 매핑 |
| `외환` | 114 | 28 | **탑솔라(주) LC 현황** — 개설한도/사용금액/잔액/결제예정/스페어/수수료 | **lc_records 백필 1순위** |
| `품의서 서식1` | 105 | 14 | **징코솔라 BL별 CIF 비용 + 현장 운송료 품의서** (PI No / B/L / 품명·수량 / ETD·ETA / 컨테이너·PLT / CIF / 운송료) | **cost_details + incidental_expenses 백필 1순위** (BL 매칭 명확) |
| `Sheet1 (4)` | 63 | 13 | KNK에너지 BL별 동일 (Contract: LGi-L-Sal-2203-0361-A012) | 동일 |
| `차량` | 14 | 7 | **580Wp 1PLT 차량별 적재 매트릭스** (5톤·5톤장축·11톤·25톤 × 블루·성강·진선·씨엔아이) | (운송료 단가 root) |
| `디원 외환` | 21 | 18 | 디원 LC 현황 (외환 시트의 디원 버전) | lc_records (company_id=DW) |
| `조건` | 52 | 20 | 결재 양식 (담당/팀장/회장) | (워크플로우 메타) |

**왜 25년 파일이 핵심**: 26년 파일이 단순 트래커라면, 25년 파일은 **운영 마스터** — 발주(2024/2025), 자금(외환/디원외환), 정산(품의서/Sheet1(4)), 운송 단가(차량) 가 한 통에 들어있다.

#### E.2 2026년도 파일 (110KB, 6 시트) — **경량 트래커**

| 시트 | 행수 | 열수 | 내용 |
|---|---:|---:|---|
| `Sheet1` | 32 | 10 | 발주 진행 요약 (발주처별 계약물량/잔량) |
| `Sheet2` | 33 | 9 | 진행상태/발주번호/공급처/L/C번호/ETD/ETA/서류구비/창고입고/출고처 |
| `징코` | 183 | 46 | 징코 모듈 상세 트래커 |
| `론지솔라` | 159 | 48 | 동일 |
| `트리나` | 87 | 47 | 동일 |
| `라이젠` | 29 | 46 | 동일 |

**제조사별 시트 (46-48열) 주요 stage 컬럼**:

```
No. / 업체 / P/O No. / 품명 / Q'ty(pcs/F/M/Wp) / Unit price / Amount
LC: 은행 / 개설일 / L/C No. / 수량 / F/M / W.P / 개설금액 / 만기일 / 유산스 / 금액
선적 / 입항 / 수량(F/M包) / PLT / 1PLT 수량 / 포장 40"
반출기한 / L/G 발행 / 통관 / 포워더 / B/L No / 현장배송
입고일 / 현장 / 품명 / 수량
IN / PK / BL / 면장 (서류 보관 여부)
운송/창고료(VAT포함가)
발주서 PI
```

#### E.1.b 25년도 파일 `품의서 서식1` 컬럼 (cost_details 백필 결정 소스)

BL 단위 정산 양식. 한 BL = 3열 차지 (PI/B/L/품명·수량/ETD·ETA/컨테이너·PLT/...CIF/운송료/... 총 14열에 BL 4-5개씩 가로로 stack):

```
PI No. / B/L / 품명 및 수량 / ETD·ETA / 컨테이너 및 PLT
[이후 CIF 비용 / 부대비용 / 현장 운송료 / 합계 등 14열 안에 정산 흐름]
```

D 회계 전표 (적요로 BL 추출) 보다 본 시트가 **BL 매칭이 명확** — `cost_details.incidental_cost` 백필 시 본 시트를 1순위 참조하면 매칭 정확도 ↑.

#### E.1.c 25년도 파일 `외환` 시트 컬럼 (lc_records 백필 1순위)

탑솔라(주) LC 마스터:

```
No. / 은행명 / 1.개설한도 / 개설일 / 개설금액 / 4.결제예정(USD) / 2.사용금액 / 3.잔액(1-2) / 비고
... 우측에 제조사별 통계 (징코/론지/트리나 누적 사용금액)
```

`lc_records` 필요 컬럼이 거의 1:1 매칭됨. M133 작성 시 본 시트가 결정 소스.

**DB 매핑** (여러 빈 테이블 채울 후보):

```
P/O No. → purchase_orders.po_number (현재 빈)
L/C No. / 개설일 / 만기일 / 개설금액 → lc_records (현재 빈)
B/L No / 선적 / 입항 / 포워더 → bl_shipments (이미 사용 중)
면장 → import_declarations
운송/창고료 → incidental_expenses
현장배송 / 입고일 → inbounds + outbounds
```

**현재 상태**: bl_shipments / import_declarations / inbounds 는 운영 중 ✅. `purchase_orders` / `lc_records` 는 0건 ❌ — 본 시트가 두 빈테이블 백필의 1순위 소스.

#### E.2 2025년도 파일 (191MB)

크기가 191MB 인 이유: 시트 다수에 이미지 (BL 스캔본·면장 캡처) 가 embed 됨. 데이터만 추출하려면 별도 처리 필요.

---

### F/G. zip 아카이브 — PO/PI/LC/BL/FR 원본

**성격**: 운영자의 이메일·결재 첨부 파일 아카이브. 발주 한 건당 PDF 5-10개 + xlsx 1-2개. **DB 의 백필 소스가 아니라 감사용 아카이브**.

#### 디렉토리 구조 (공통)

```
{연도} 모듈 발주.zip
├── {제조사}/               ─── 징코 / 론지 / JA / 트리나 / 라이젠 / KNK 등
│   └── {계약/PO 단위}/     ─── e.g. "170MW 계약 진행건 - 완료"
│       └── {차수}/         ─── e.g. "170MW - 1차 개설 20MW(2025.03.14)"
│           ├── PO/PI/LC PDF
│           ├── CI / PL xlsx                ─── Commercial Invoice / Packing List
│           ├── FR (Flash Report) xlsx      ─── BL 단위 시리얼 번호 전수
│           └── 부속 서류 (위임장/품의서/계약서)
├── 수입면장/               ─── 24년만 — 면장 PDF
├── 수입신고필증/           ─── 25년만 — 면장 PDF (24년 zip 의 '수입면장' 과 같은 역할)
├── 운송료(_청구자료)/      ─── 운송료/CFS/통관 청구서 (BL별)
├── 클레임/                ─── 26년만 — 모듈 데미지 정리
├── 공정진행현황/           ─── 24년만 — 발전소 시공 진행
├── 자재 2024년/            ─── 24년만 — 시공 일정
├── 출고현황/               ─── 24년만 — 출고 추적 (C 와 중복)
├── 2024년 재고/            ─── 24년만 — 기말 재고 스냅샷 (H 참조)
├── 모듈 입찰/              ─── 24년만 — 입찰 자료
└── 포워더 견적비교(제주).xlsx ─── 단건
```

#### 파일 종류별 분포

| 확장자 | 2024 | 2025 | 2026 | 의미 |
|---|--:|--:|--:|---|
| `.pdf` | 697 | 791 | 259 | BL/면장/PO/PI/위임장 스캔본 |
| `.xlsx` | 99 | 133 | 44 | FR/CI/PL/정리시트 (다수) |
| `.xls` | 30 | 53 | 18 | 구형 FR (제조사 템플릿) |
| `.zip` | 39 | 91 | 54 | 중첩 zip (PO 단위) |
| `.doc/.docx` | 19 | 19 | 6 | PO/PI 원본 워드 |
| `.jpg/.png` | 6 | 15 | 141 | BL 사진 / 컨테이너 사진 |
| `.hwp` | 5 | 5 | 1 | 한글 (계약서) |
| `.dwg` | 2 | 1 | 0 | 도면 |

#### FR (Flash Report) 파일 패턴

`FR_{pcs}pcs.XLS` / `Flash Report.xlsx` 형식. 한 BL 의 모듈 시리얼 번호 전수 리스트 (수천 행). 시리얼 단위 추적이 필요할 때만 참조 (현재 DB 에 모듈 시리얼 도메인 없음).

운영자 사용 패턴: BL 입항 → FR 받음 → 검수 → 통관 → 입고 시 FR 의 시리얼이 발전소별로 어떻게 분배되는지는 별도 추적 안 함 (수량만 추적).

---

### H. `2024년 재고/2024.12.26 - 탑솔라 - 재고현황.xls` — 기말재고 스냅샷

**성격**: 24년말 BL 단위 컨테이너·팔레트 잔량. **운영 DB 의 fifo_matches 에 `입고구분='기초재고'` 행으로 들어가있음** — 25년 1월 이후 출고가 매칭되는 출발점.

**구조**: 한 시트 = 한 BL.
시트명 예시: `진코-JWSH24080102 08.26 입항`, `NPSELHT246019 - 09.08 입항`

**컬럼 (시트별 동일)**:

```
[제조사+규격]    BL No. + 입항일 + 도착항
모듈 (CNTR No. SEAL No. PALLETS) 배송지(발전소 주소) 창고반출(일자) 출고PALLET(개수)
```

**참조 키**: BL No. ↔ bl_shipments.bl_number ↔ fifo_matches.declaration_id (한 BL 에 면장 1+)

**DB 매핑**: 25년 1월 1일 기준 fifo_matches.usage_category_raw='기초재고' 또는 입고구분='기초재고' 인 행이 본 스냅샷의 잔량과 일치해야 함. 정합 검증 SQL (db-connectivity-report.md § 13 식으로 추가 가능).

---

### I. `자재 2024년/발전시공일정.xlsx` — 발전소별 발주 일정

**성격**: PM/영업이 발전소 시공 일정 + 모듈/인버터/수배전반 발주를 한 줄에 묶어 관리. 외부 인덱스.

**시트** (903행, 185컬럼인 시트 + 9개 보조 시트):

```
태양광 현장(탑)       ─── 탑솔라 시공 발전소 78개
태양광 현장(디원)     ─── 디원 시공 발전소 다수
건물임대사업          ─── 건물 PV 78건
화신이엔지            ─── 화신 시공 71건
모듈 판매 (탑)        ─── 탑솔라 모듈 판매 1326건
모듈 판매 (디원)      ─── 디원 모듈 판매 257건
제주탑                ─── 제주 현장
영암 은곡리/동호리    ─── 지역별 발주
일양산업(영암/신안/해남) ─── 일양산업 패키지 발주
탑인프라 신안          ─── 탑인프라 신안 패키지
사용전검사 완료         ─── 운영 전환 완료 발전소 누적
```

**DB 매핑**: 일부는 `orders` / `projects` / `sites` 도메인과 대응 가능하나, 영업 자료라 운영 DB 와 1:1 매핑은 안 됨. 신규 도메인 (`projects` / `installation_schedules`) 추가 시 본 시트가 후보 소스.

---

### J. `운송료 청구자료/...` 및 `2025년 운송료/` — BL별 운송료/보관료 청구서

**성격**: 거래처(블루오션·선진·스마일)가 발급한 BL 단위 청구서. 한 파일 = 한 청구.

#### J.1 청구서 종류

| 파일명 패턴 | 거래처 | 내용 | 단위 |
|---|---|---|---|
| `작업료 청구서(BL - {bl_no}).xlsx` | 블루오션 | CFS CHARGE / 통관비 | BL |
| `청구서(BL - {bl_no}).xlsx` | 블루오션 | 동일 (다른 양식) | BL |
| `탑솔라 보관료 청구내역 ({yymm}).xlsx` | 선진로지스틱스 | 컨테이너별 보관일×보관료 | 월 |
| `탑솔라 운송 내역서 ({yymm}).xlsx` | 선진로지스틱스 | 발전소별 차량×운송단가 | 월 |
| `탑솔라 잔여수량 확인.xlsx` | 선진로지스틱스 | 컨테이너별 잔여 | 월 |
| `운송료 - 블루오션(2025년).xlsx` | 블루오션 | 25년 운송료 합계 | 연 |

#### J.2 보관료 청구내역 구조 (선진로지스틱스)

```
시트 = BL 번호 (e.g. SHADFC71415 / ESZX2502432 / SELYIT256012 / SELYIT256013)
컬럼: CONTAINER NO. / PALLET 수량 / 반출일자 / 프리타임 종료일 / 출고일 / 수량 / 도착지 / 보관일 / 보관료
```

**DB 매핑**: `incidental_expenses` 의 `expense_type='storage' + bl_id`. 행 단위로 컨테이너 보관료 적재 가능.

#### J.3 운송 내역서 구조

```
시트 = BL 번호 (또는 BL+발전소)
컬럼: 납품일 / 상세 주소 / 차량(톤수) / 댓수 / 운송 단가 / 운송료 / 부가세 / 합계
```

**DB 매핑**: `incidental_expenses` 의 `expense_type='transport' + outbound_id` (또는 bl_id 단위 합계).

#### J.4 25년 운송료 폴더 파일 인벤토리

`Dropbox/.../2025년 운송료/` 에 BL별 청구서 약 20개:

| BL | 청구 파일 |
|---|---|
| HDMUSHAA28081200 | `FN_작업료_청구서(BL_-_HDMUSHAA28081200).xlsx` |
| SNKO03K250302336 | `FN_작업료_청구서(BL_-_SNKO03K250302336).xlsx` |
| SNKO03K250302826 | `REVISED__작업료_청구서(BL_-_SNKO03K250302826).xlsx` + `작업료 청구서` |
| SNKO03K250201371 | `작업료 청구서(BL - SNKO03K250201371).xlsx` |
| SNKO03K250201374 | `작업료 청구서(BL - SNKo03K250201374).xlsx` |
| JWSH25030014 | `최종본청구서(BL - JWSH25030014).xlsx` |
| SHKWA25009166 | `청구서(BL_-_SHKWA25009166).xlsx` |
| SNKO03K250302342 | `청구서(BL_-_SNKO03K250302342).xlsx` |
| SNKO03K250302344 | `청구서(BL_-_SNKO03K250302344).xlsx` |
| JWSH25070017 외 | `출고리스트  JWSH25070017외 .xlsx` |

**현재 백필 상태**: M131 에서 9건 정밀 보강 완료. 25년 운송료 폴더 + 25년 zip 안 `운송료/` + 26년 zip 안 `운송료 청구자료/` 의 BL 청구서가 합쳐서 50+건 — 잔여분은 BL별 청구서 → cost_details 백필 이후 작업.

---

### K. `클레임/...` — 모듈 데미지 클레임

**성격**: 입항·하역 중 손상된 모듈 사진+정리 파일. 26년 zip 에 최초 등장.

```
2026.02.24 블루오션  645WP.xlsx (23MB — 사진 임베드)
2026.03.30  선진.xlsx
2026.04.18 블루오션 650Wp.xlsx
론지 클레임 1차/* (5개 BL: DFS815002441/2442-{1,2,3})
블루오션 2026.04.18~20 론지 모듈 데미지 정리.xlsx
```

**DB 매핑**: 현재 신규 도메인 (`claims` / `damage_records` 등 미정의). 향후 `outbounds.usage_category='construction_damage'` 와 연동될 수 있음.

---

### L. `바로 모듈판매현황_이익률_26년1Q.xlsx` — baro 테넌트

**성격**: baro(바로(주)) 테넌트의 26년 1분기 판매 이익률. 자체 DB 와 동일 집계 가능.

**DB 매핑**: `sales` + `fifo_matches` (company_id = baro). `bp/sales_dashboard` RPC 와 결과 일치 여부 검증 가능.

---

## 3. 백필 진행 매트릭스

`db-connectivity-report.md § 10` 의 마이그 시리즈 보완.

| 마이그 | 효과 | 소스 자료 |
|---|---|---|
| M111+M112 | bl_shipments.cif_amount_krw + bl_line_items 백필 | C (BL별 출고현황) + 면장 PDF |
| M113 | outbound_bl_items 18%→74% | C + A.수불/출고 |
| M114 | obi ↔ outbound.bl_id 동기화 트리거 | (구조) |
| M115 | outbounds.bl_id 컬럼 DROP | (구조) |
| M116 | cost_details 백필 100건 | A.DB-3 + 면장 PDF |
| M117 | bl_shipments 4컬럼 (decl_no/inv/xr/arrival) 보강 | A.DB-3 + E.수입진행상황 |
| M118 | outbounds.site_name 17건 보강 | C + 영업 자료 |
| M130 | cost_details.incidental_cost 부대비용 백필 | D (회계 전표) |
| M131 | BL별 운송료/작업료 청구서 9개 정밀 보강 | J (BL별 청구서) |

**다음 백필 후보**:

| 후보 | 임팩트 | 자료 | 난이도 |
|---|---|---|---|
| `incidental_expenses` 잔여 50+건 백필 | 매출원가 정확도 → 17억 갭 축소 | J (전체 BL 청구서) | 중 — BL 매칭 |
| `purchase_orders` / `po_line_items` 백필 | 발주 추적 부활 | E.수입진행상황 + F/G.PO PDF | 중 — 명명 정합 |
| `lc_records` 백필 | LC 추적 | E.수입진행상황 (LC 컬럼 16개) | 낮음 — E 의 LC 컬럼 직접 매핑 |
| 클레임 도메인 추가 | 클레임 회계 추적 | K | 신규 도메인 — 설계부터 |
| 시리얼 추적 도메인 | 발전소별 모듈 시리얼 매핑 | F/G.FR (Flash Report) | 높음 — 수천 건 × 수십 BL |

---

## 4. zip 아카이브 가이드

세 zip 의 핵심 디렉토리 (어디에 뭐가 있는지):

### 2024년 모듈발주.zip (663MB)

```
2024년 재고/2024.12.26 - 탑솔라 - 재고현황.xls  ← H. 기초재고 (정합 검증 소스)
공정진행현황/                                 ← I 와 유사 (분기 스냅샷)
자재 2024년/발전시공일정 및 자재 발주 일정.xlsx  ← I. 발전소별 발주
자재 2024년/진코 발주현황 및 출고예정현장 리스트VER3.xlsx
수입면장/수입면장/수입신고필증 리스트.xlsx     ← 면장 PDF 리스트 (메타)
론지모듈/론지정산.xlsx                         ← T/T 정산 0.1/0.9 분배
징코모듈/.../발주서 정리.xlsx + 정리.xlsx + 225MW 진행의 건.xlsx  ← PO 진행
KNK에너지(CIS)/                                ← 24년 KNK 발주서 (수십 개)
포워더 견적비교(제주).xlsx                     ← 포워더 단가 비교 (제주向 48MW)
```

### 2025년 모듈 발주.zip (956MB)

```
JA솔라 모듈/JA솔라.xlsx + KNK정산.xlsx + KNK/개설자료.xlsx + 발주 계산.xlsx
론지솔라/발주서 내용 정리.xlsx
징코모듈/PO정리.xlsx + 디원/디원 개설물량 정리.xlsx
징코모듈/탑솔라/170MW 계약 진행건 - 완료/  ← 170MW 6차 개설
징코모듈/탑솔라/400MW 계약서 - 350MW 변경/  ← 350MW 진행
수입신고필증/다운로드 면장/수입진행상황(module)-2025년도.xlsx  ← E 와 동일 (zip 안 사본)
운송료/{블루/선진} {11월/8월/...} 청구서/  ← J. BL별 청구서 (20+개)
라이젠/라이젠 40WM/640WP 10MW 진행/RSPN251920  flash data/  ← BL별 FR (24개 컨테이너)
```

### 2026년 모듈 발주.zip (1.1GB)

```
KNK에너지/발주 조건.xlsx                       ← 26년 신규 발주 조건
라이젠에너지/라이젠 635W 90MW LC 개설 일정_260420.xlsx  ← 90MW LC 일정
라이젠에너지/수입진행상황(module)-2025년도.xlsx  ← 라이젠 슬라이스
운송료 청구자료/{1월~3월}/  ← 26년 BL별 청구서
클레임/  ← 26년 클레임 5건 (블루/선진/론지)
징코솔라/선적서류/CIPLBL_*/  ← 26년 징코 17~24차 선적
론지솔라/탑솔라/경량모듈 20MW/  ← 540Wp 경량모듈
트리나솔라/720WP 30MW/  ← 1차/2차 선적
```

---

## 5. 갭 분석

운영 자료가 있지만 아직 DB 에 안 들어간 도메인:

| 자료 | DB 후보 테이블 | 임팩트 |
|---|---|---|
| 발주서 (PO PDF) | purchase_orders / po_line_items (현재 0건) | 발주 → 입항 → 정산 흐름 불완전 |
| LC 개설 자료 | lc_records / lc_line_items (현재 0건) | LC 추적, 만기 알림 불가 |
| 운송/보관료 청구서 (50+건) | incidental_expenses 추가 | 매출원가 17억 갭 |
| 클레임 자료 | (신규 도메인) | 손실/회수 추적 불가 |
| 모듈 시리얼 (FR) | (신규 도메인) | 발전소별 시리얼 추적 불가 |
| 시공 일정 (발전소별) | projects + installation_schedules (미정의) | PM 자동화 불가 |
| 모듈 발주 단가 협상 이력 | partner_price_book / price_histories (현재 0건) | 협상 인사이트 부재 |
| 포워더 견적 비교 | (신규 도메인) | 포워더 선정 자동화 불가 |

---

## 6. 자료 수집 운영

운영자가 자료를 받는 채널·주기:

| 자료 | 발신 | 채널 | 주기 |
|---|---|---|---|
| 발주서 (PO) | 운영자 → 제조사 | 이메일 (워드/PDF) | 발주 시 |
| 선적서류 (CI/PL/BL/FR) | 제조사 → 운영자 | 이메일 (zip 첨부) | 선적 단위 |
| 면장 | 통관사 → 운영자 | 이메일 (PDF) | 통관 단위 |
| 운송료/보관료 청구서 | 거래처 (블루/선진/스마일) → 운영자 | 이메일 (xlsx) | 월말 |
| 회계 전표 export (D) | 운영자 → AI | ERP export | 월말/분기 |
| 수입진행상황 (E) | 운영자 수기 작성 | Dropbox | 매주 |
| BL별 출고현황 (C) | 운영자 수기 작성 | Dropbox | 출고 단위 |
| 탑솔라 그룹 출고현황 (B) | 운영자 수기 | Dropbox | 월 |
| 기말재고 (H) | ERP export + 수기 보정 | 연 1회 | |

**정합 운영 권장**:
1. 회계 전표 (D) 가 갱신될 때마다 → `incidental_expenses` 추가 백필 PR
2. 새 BL 추가 시 (C 갱신) → `bl_shipments` + `bl_line_items` + `outbound_bl_items` 정합 검증
3. 월말 → B 시트의 워크플로우 플래그 ↔ `outbounds.{tx_statement_ready, ...}` 정합 검증
4. 본 문서는 새 자료 형식이 들어올 때마다 §2 에 카드 추가

---

## 7. SQL 템플릿 — 백필 / 정합 검증

### 7.1 BL ↔ E1 정합 검증 (외부 자료 ↔ DB)

```sql
-- E1.2025 시트의 BL 번호 (운영자 수기 입력) 가 DB 에 있는지
WITH e1_bls AS (
  SELECT unnest(ARRAY[
    'JWSH25030014', 'SNKO03K250201370', 'SNKO03K250201371', -- ...
    -- (E1.2025 시트 distinct B/L No 컬럼 추출, 통합 xlsx 시트 10 참조)
    NULL
  ]) AS bl
)
SELECT e.bl,
       CASE WHEN b.bl_id IS NULL THEN '❌ DB missing' ELSE '✅ found' END,
       b.inbound_type, b.eta::date, b.status
FROM e1_bls e
LEFT JOIN bl_shipments b ON b.bl_number = e.bl
WHERE e.bl IS NOT NULL
ORDER BY 2 DESC;
```

### 7.2 PO/LC 누락 검증

```sql
-- DB 의 PO 중 LC 없는 21건 — E1.외환 시트와 대조
SELECT po.po_number, c.company_name, m.name_kr AS manufacturer,
       po.contract_date::date, po.total_qty, po.total_mw, po.status
FROM purchase_orders po
LEFT JOIN companies c ON c.company_id = po.company_id
LEFT JOIN manufacturers m ON m.manufacturer_id = po.manufacturer_id
WHERE NOT EXISTS (SELECT 1 FROM lc_records lc WHERE lc.po_id = po.po_id)
ORDER BY po.contract_date DESC;
```

### 7.3 cost_details 갭 BL 후보 (incidental_cost NULL)

```sql
-- M133 후보: incidental_cost 미백필된 53건
SELECT cd.cost_id, id.declaration_number, b.bl_number,
       cd.cif_total_krw, cd.incidental_cost, cd.customs_fee,
       cd.landed_total_krw
FROM cost_details cd
JOIN import_declarations id ON id.declaration_id = cd.declaration_id
JOIN bl_shipments b ON b.bl_id = id.bl_id
WHERE cd.incidental_cost IS NULL
ORDER BY b.eta::date DESC;
```

### 7.4 매출 vs FIFO 갭 검증 (회사·연도별)

```sql
-- 회사별·연도별 매출 / FIFO 원가 비교
SELECT EXTRACT(YEAR FROM o.outbound_date) AS yr,
       fm.corporation,
       SUM(s.supply_amount)         AS sales_krw,
       SUM(fm.cost_amount)           AS fifo_cost_krw,
       SUM(s.supply_amount) - SUM(fm.cost_amount) AS gross_margin_krw,
       ROUND(100.0 * (SUM(s.supply_amount) - SUM(fm.cost_amount))
                   / NULLIF(SUM(s.supply_amount), 0), 2) AS margin_pct
FROM fifo_matches fm
JOIN outbounds o ON o.outbound_id = fm.outbound_id
LEFT JOIN sales s ON s.outbound_id = o.outbound_id AND s.status != 'cancelled'
WHERE o.usage_category IN ('sale', 'sale_spare')
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
```

### 7.5 incidental_expenses 신규 행 백필 SKELETON (M134 후보)

```sql
-- D 회계 전표 각 분개를 incidental_expenses 행으로 변환
-- BL 적요 추출 후 bl_id 매칭, BL 없으면 (month, vendor) 단위로 적재
BEGIN;

WITH ledger AS (
  -- D 시트 raw 를 staging 테이블 (또는 CTE) 로 적재
  SELECT '...' AS memo, '2025-08-31'::date AS approved_at,
         6721000::numeric AS credit_amount, '스마일로지스' AS vendor
  -- ...
)
INSERT INTO incidental_expenses
  (bl_id, month, company_id, expense_type, amount, vat, total, vendor, memo, vehicle_type, destination)
SELECT
  (SELECT bl_id FROM bl_shipments WHERE bl_number = substring(l.memo FROM 'BL[\s:-]*([A-Z0-9]+)')),
  date_trunc('month', l.approved_at)::date,
  '99f0fc15-0555-4a41-a025-8bf3630a7947'::uuid, -- TS
  CASE WHEN l.vendor LIKE '%스마일%' THEN 'transport'
       WHEN l.vendor LIKE '%블루오션%' THEN 'customs_fee'
       WHEN l.vendor LIKE '%선진%' THEN 'storage'
       ELSE 'other' END,
  l.credit_amount,
  NULL, l.credit_amount,
  l.vendor, l.memo,
  NULL, NULL
FROM ledger l;

-- dry-run 검증
SELECT 'BEFORE 0건' UNION ALL SELECT COUNT(*)::text || ' inserted' FROM incidental_expenses;

ROLLBACK; -- 검증 후 COMMIT 으로 교체
```

---

## 부록 — 추출 도구

zip 안 특정 파일 추출은 Python 으로 직접 가능:

```python
import zipfile
src = 'C:/Users/user/Dropbox (개인용)/8. 코딩/솔라플로우 참고 자료/2025년 모듈 발주.zip'
with zipfile.ZipFile(src) as zf:
    for n in zf.namelist():
        if 'BL번호' in n:
            print(n)
            zf.extract(n, 'C:/Users/user/Downloads/sf_temp/')
```

`Dropbox/.../{년도} 모듈 발주.zip` 의 디렉토리 인덱스는 [§4](#4-zip-아카이브-가이드) 참조.
