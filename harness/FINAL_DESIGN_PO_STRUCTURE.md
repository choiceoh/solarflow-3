# SolarFlow 3.0 — PO 기준 전체 구조 최종 확정 설계서

**확정일**: 2026-04-08
**승인**: Alex(도메인), 감리자(설계검증), 재이(코디네이터)
**용도**: Claude Code 실행 기준 문서. 이 문서에 없는 변경은 금지.

---

## 1. 확정된 설계 결정 (D-087 ~ D-091)

### D-087: PO 기준 전체 데이터 자동 연결
- PO가 모든 데이터의 출발점. 가상 PO라도 반드시 생성.
- 입고등록 시 PO 선택 필수 → 제조사, 법인, 통화, Incoterms, 결제조건 자동 채움.
- company_id 자동 채움 반드시 포함.

### D-088: BL 출고마감 상태 — outbound_status 별도 컬럼
- 기존 status(입고 과정)와 별도로 outbound_status 컬럼 신규 추가.
- 입고 상태와 출고 상태는 독립적으로 관리.
- status = completed (입고 완료) + outbound_status = partial (출고 진행중) 동시 가능.
- 허용값: NULL(미출고) | partial(일부출고) | closed(전량출고) | sales_closed(매출마감)
- 상태 전환: partial/closed = 시스템 자동, sales_closed = 실무자 수동 확정.

### D-089: FIFO 원가 매칭 — Rust 계산 → Go 저장
- outbound_fifo_details 테이블 신규 생성.
- Rust가 FIFO 계산 결과를 응답으로 반환 → Go가 DB INSERT (D-025 패턴).
- Rust가 DB에 직접 WRITE하지 않음.

### D-090: 스페어 출고 원가 — 판매원가에 포함
- 스페어 무상 출고분의 원가를 판매원가에 포함하여 정확한 이익 계산.
- 매출=0, 원가=있음 → 이익 감소 요인으로 반영.

### D-091: 메뉴 구조 업무흐름 기반 재배치
- 면장/원가는 별도 유지 (입고와 통합하지 않음).
- 입고 상세에서 "면장 등록" 버튼으로 연결 (기존 구현 유지).
- 실사용 후 메뉴 순서 확정.

---

## 2. 무상출고 vs 스페어 — 치명적 구분 (반드시 준수)

### 엑셀 데이터 기준 정확한 매핑

| 엑셀 구분 | 실제 의미 | SolarFlow usage_category | 이익분석 포함 |
|----------|---------|--------------------------|-------------|
| 상품판매 | 거래처에 유상 판매 (본품) | sale | 매출-원가=이익 |
| 상품판매 내 스페어 | 판매 시 함께 나가는 무상분 | sale (item_type=spare) | 매출=0, 원가 포함 |
| 무상출고 | 공사현장 사용 등 비판매 출고 | construction 등 | 사용처 추적만 |

### 혼동하면 안 되는 것
- 엑셀 "무상출고" 765건 → construction (공사사용) O
- 엑셀 "무상출고" 765건 → spare (스페어) X 절대 아님
- 스페어는 "상품판매" 건 안에서 본품과 함께 소량으로 나가는 것

### outbound_fifo_details에서의 구분

| item_type | 의미 | 이익분석 |
|-----------|------|---------|
| main | 본품 출고 (판매 또는 공사) | 판매: 매출-원가, 공사: 원가만 기록 |
| spare | 상품판매 시 함께 나가는 스페어 무상분 | 매출=0, 원가는 판매원가에 합산 |

공사사용 출고는 outbound의 usage_category로 구분하지,
outbound_fifo_details의 item_type으로 구분하지 않음.

---

## 3. 모듈 크기 필수 표시 원칙

모듈이 표시되는 모든 화면에 물리적 크기(mm x mm) 필수 표시.
같은 Wp라도 크기가 다르면 별도 행으로 표시.

### 적용 대상 화면
- 재고현황 (제조사별 목록)
- 입고관리 (BL 목록, BL 라인아이템)
- 출고/판매 (출고 목록)
- 발주/결제 (PO 발주품목)
- 수급전망
- 가용재고 드릴다운

### 데이터 출처
품번 마스터: module_width_mm, module_height_mm (이미 존재)
DB 변경 없음. 프론트에서 product_id JOIN 시 크기 포함하여 표시.

### 표시 형식
2465x1134 (가로x세로, mm 단위, 단위 생략)

---

## 4. DB 변경 사항 — 최종 확정

### 4.1 신규 테이블: outbound_fifo_details

CREATE TABLE outbound_fifo_details (
  outbound_fifo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbound_id      UUID NOT NULL REFERENCES outbounds(outbound_id) ON DELETE CASCADE,
  bl_line_id       UUID NOT NULL REFERENCES bl_line_items(bl_line_id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  item_type        VARCHAR(10) NOT NULL CHECK (item_type IN ('main', 'spare')),
  unit_cost_krw_wp DECIMAL(10,2),
  landed_cost_krw_wp DECIMAL(10,2),
  created_at       TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_fifo_outbound ON outbound_fifo_details(outbound_id);
CREATE INDEX idx_fifo_bl_line ON outbound_fifo_details(bl_line_id);

### 4.2 컬럼 추가: bl_line_items.po_line_id

ALTER TABLE bl_line_items
ADD COLUMN po_line_id UUID REFERENCES po_line_items(po_line_id);
-- nullable. 과거 데이터는 NULL 허용. 신규 데이터부터 정확히 연결.

### 4.3 컬럼 추가: bl_shipments.outbound_status

ALTER TABLE bl_shipments
ADD COLUMN outbound_status VARCHAR(20)
CHECK (outbound_status IN ('partial', 'closed', 'sales_closed'));
-- NULL = 미출고 (기본값)
-- partial = 일부 출고됨
-- closed = 전량 출고 완료 (입고수량 = 출고수량)
-- sales_closed = 매출마감 완료 (실무자 수동 확정)

### 4.4 변경 없는 테이블 (확인)
- purchase_orders: 변경 없음
- po_line_items: 변경 없음
- outbounds: 변경 없음 (기존 spare_qty 유지)
- sales: 변경 없음
- declarations, declaration_costs: 변경 없음
- 그 외 전체: 변경 없음

---

## 5. Go API 변경 사항

### 5.1 입고등록 — PO 자동채움 지원

기존 GET /api/v1/purchase-orders/{id} 응답에 포함되어야 하는 필드 확인:
- manufacturer_id -> 제조사
- company_id -> 법인 (반드시 포함)
- currency
- incoterms
- payment_terms
- po_line_items (품목 목록: product_id, quantity, unit_price 등)

프론트에서 PO 선택 시 이 API 호출 -> 응답으로 자동채움.
Go 백엔드 변경: 없음 또는 최소 (기존 API가 이미 반환하는지 확인 필요).

### 5.2 outbound_fifo_details CRUD

신규 핸들러:
- POST /api/v1/outbound-fifo — FIFO 매칭 결과 저장
- GET /api/v1/outbound-fifo?outbound_id={id} — 출고 건의 FIFO 상세 조회
- GET /api/v1/outbound-fifo?bl_line_id={id} — BL 라인아이템의 출고 현황 조회

### 5.3 BL outbound_status 자동 전환

출고 등록/수정/삭제 시 Go outbound 핸들러에서:
1. 해당 outbound의 FIFO details에서 참조하는 모든 bl_line_id 추출
2. 각 BL에 대해: SUM(FIFO quantity) vs BL 라인아이템 입고수량 비교
3. 합계 < 입고수량 -> outbound_status = partial
4. 합계 = 입고수량 -> outbound_status = closed
5. 합계 > 입고수량 -> 에러 (과출고 방지)

sales_closed는 별도 API: PUT /api/v1/bl-shipments/{id}/sales-close (실무자 수동)

### 5.4 Go 구조체 변경

model/bl_shipment.go에 추가:
OutboundStatus *string json:"outbound_status,omitempty" db:"outbound_status"

model/outbound_fifo.go 신규:
OutboundFIFODetail struct with fields:
OutboundFIFOID, OutboundID, BLLineID, Quantity, ItemType,
UnitCostKRWWp, LandedCostKRWWp, CreatedAt

model/bl_line_item.go에 추가:
POLineID *string json:"po_line_id,omitempty" db:"po_line_id"

---

## 6. Rust API 변경 사항

### 6.1 신규 API: FIFO 자동 매칭

POST /api/calc/fifo-match
Request: company_id, product_id, quantity, spare_quantity, outbound_date
Response: matches array with bl_line_id, available_qty, allocated_main, allocated_spare,
unit_cost_krw_wp, landed_cost_krw_wp, arrival_date
Plus total_main, total_spare, weighted_avg_cost, weighted_avg_landed

FIFO 로직:
1. 해당 product_id + company_id의 BL 라인아이템 조회
2. BL의 actual_arrival 오래된 순 정렬 (선입선출)
3. 각 BL의 잔여수량 = BL입고수량 - SUM(기존 FIFO details 수량)
4. 잔여수량에서 본품/스페어 순서대로 배분
5. 스페어도 같은 BL에서 나감 (본품과 같은 FIFO 순서)

### 6.2 기존 API 수정

margin-analysis: outbound_fifo_details JOIN하여 BL별 실제 원가 적용.
customer-analysis: FIFO 원가 기반 거래처별 실제 이익률 계산.
inventory: 응답에 module_width_mm, module_height_mm 포함.

---

## 7. 프론트엔드 변경 사항

### 7.1 입고등록 폼 — PO 선택 자동채움

PO 선택 드롭다운 (검색 가능):
PO번호 | 제조사명 | 계약유형 | 계약량(MW)

PO 선택 시 자동채움:
- 제조사 (수정 불가)
- 법인 (수정 불가)
- 통화 (수정 불가)
- Incoterms (기본값, 수정 가능)
- 결제조건 (기본값, 수정 가능)

PO 발주품목 -> BL 라인아이템 초기값:
- 품번 (PO 품목에서 선택)
- 단가 (PO에서 복사)
- 수량 (사용자 입력 - 분할선적분)
- 본품/스페어, 유상/무상 (PO 품목에서 복사)

사용자 직접 입력 (BL마다 다른 것):
- BL번호, ETD, ETA, 실제입항일, 항구, 포워더, 창고
- 환율 (BL마다 다름)
- Invoice No.
- 수량 (분할선적분, PO 잔량 이내)

### 7.2 모듈 크기 표시 — 전체 화면

모든 모듈 표시 목록에 크기 컬럼 추가.
표시 형식: 2465x1134
데이터 출처: products.module_width_mm, module_height_mm

### 7.3 BL 상세 — 출고추적 탭 추가

탭: [기본정보] [라인아이템] [면장] [출고추적]
출고추적: BL 입고수량, 출고합계, 잔여수량, outbound_status 배지,
출고 건 목록 (FIFO details 기준)

### 7.4 이익분석 — BL 원가 기준

FIFO 원가 표시, 가중평균 원가, 판매가, 이익률

---

## 8. 이익분석 계산 공식 — 최종 확정

### BL 단위
판매 매출 = SUM(본품수량 x 판매가 x kW환산), 스페어 매출 = 0
판매 원가 = SUM(FIFO 본품수량 x BL면장원가 x kW) + SUM(FIFO 스페어수량 x BL면장원가 x kW)
이익 = 매출 - 원가, 이익률 = 이익 / 매출 x 100
공사 비용은 별도 표기 (이익분석 미포함)

### 거래처별 = GROUP BY customer_id
### 월별 = GROUP BY MONTH(outbound_date)
### PO별 = GROUP BY po_id (계약량, LC, 입고, 미착, 출고, 잔여, 이익)

---

## 9. GAP 구현 순서 — 확정

Phase A: GAP-1+2 (PO->입고 자동채움 + 품목 연결)
Phase B: GAP-3 (BL 출고마감 상태)
Phase C: GAP-4+5 (FIFO 원가 매칭 + 스페어 원가)
Phase D: 모듈 크기 표시 + 메뉴 재배치
Phase E: 데이터 이관

---

## 10. 감리자 특별 주의 9건

1. 무상출고 = construction. 스페어는 판매 건 내부
2. 모듈 크기 mm x mm 필수 표시
3. outbound_status 별도 컬럼
4. Rust 계산 -> Go 저장 (D-025 패턴)
5. po_line_id nullable
6. company_id 자동 채움 포함
7. 면장 별도 유지
8. 미출고 잔여 446K장 검증
9. 엑셀 무상출고 -> 공사사용 매핑 확인
