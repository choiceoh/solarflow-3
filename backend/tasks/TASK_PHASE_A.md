# TASK: Phase A — PO->입고 자동채움 + PO 품목<->BL 품목 연결

**기준 문서**: harness/FINAL_DESIGN_PO_STRUCTURE.md
**GAP**: GAP-1 + GAP-2
**설계결정**: D-087

---

## 작업 범위

### 1. DB 변경 — 이미 완료 (Alex가 터미널 2에서 실행함)

bl_line_items에 po_line_id 컬럼 추가 완료.
시공자는 DB ALTER 실행하지 말 것. 컬럼 존재 확인만 할 것.

### 2. Go 백엔드 변경

#### 2-1. model/bl_line_item.go

BLLineItem 구조체에 필드 추가:
POLineID *string json:"po_line_id,omitempty" db:"po_line_id"

CreateBLLineItemRequest, UpdateBLLineItemRequest에도 동일 추가.
Validate()에서 po_line_id: 값이 있으면 UUID 형식 확인, 없으면 통과.

#### 2-2. handler/bl_line_item.go

기존 CRUD 핸들러의 SQL에 po_line_id 포함:
- INSERT: po_line_id 컬럼 추가
- UPDATE: po_line_id 업데이트 가능
- SELECT: po_line_id 응답에 포함

#### 2-3. 확인 — GET /api/v1/purchase-orders/{id} 응답

이 API가 아래 필드를 모두 반환하는지 확인:
- manufacturer_id
- company_id
- currency
- incoterms
- payment_terms

반환하지 않는 필드가 있으면 추가할 것.

#### 2-4. 확인 — PO 발주품목 조회 API

PO의 발주품목 목록이 API로 조회 가능한지 확인.
불가능하면 엔드포인트 추가: GET /api/v1/po-line-items?po_id={id}
응답에 product_id, quantity, unit_price_usd_wp, item_type, payment_type 포함.

### 3. 프론트엔드 변경

#### 3-1. 입고등록 폼 — PO 선택 드롭다운 추가

입고등록(새 BL 등록) 폼 최상단에 PO 선택 추가:
- Combobox (검색 가능, shadcn/ui Select 또는 Command)
- 표시: PO번호 | 제조사명 | 계약유형 | 계약량(MW)
- API: GET /api/v1/purchase-orders (활성 PO 목록)

#### 3-2. PO 선택 시 자동채움 동작

PO 선택 시:
1. GET /api/v1/purchase-orders/{po_id} 호출
2. 자동 채움:
   - manufacturer_id -> 제조사 (수정 불가)
   - company_id -> 법인 (수정 불가)
   - currency -> 통화 (수정 불가)
   - incoterms -> Incoterms (수정 가능)
   - payment_terms -> 결제조건 (수정 가능)
3. PO 발주품목 조회 -> BL 라인아이템 영역에 품목 목록 표시
   - 품번, 모델명, 규격, 단가, 계약수량, 잔여수량
   - 사용자가 이번 선적분 수량 입력

자동채움 필드는 배경색 구분(예: bg-muted)하여 자동 입력됨 표시.
PO 변경 시 자동채움 필드 전부 초기화 후 재채움.

#### 3-3. PO 잔여량 표시 (프론트 계산)

PO 총 계약량 - SUM(해당 PO의 모든 BL 라인아이템 수량) = 잔여
D-061 패턴: 프론트에서 계산.

#### 3-4. PO 없이 입고등록

PO 선택 비워두면 기존처럼 수동 입력.
BL 저장 시 po_id = NULL.

### 4. 테스트

Go 테스트:
- bl_line_items CRUD에 po_line_id 포함 (생성, 조회, 수정)
- po_line_id = NULL 생성 가능
- 존재하지 않는 UUID -> FK 에러

프론트 수동 테스트:
- PO 선택 -> 5개 필드 자동채움
- PO 변경 -> 초기화+재채움
- PO 미선택 -> 수동 입력
- BL 저장 후 po_id DB 저장 확인

### 5. 빌드 및 재시작

Go: cd ~/solarflow-3/backend && go build -o solarflow-go . && launchctl stop com.solarflow.go && launchctl start com.solarflow.go
프론트: cd ~/solarflow-3/frontend && npm run build

### 6. 범위 외 (하지 않는 것)

- outbound_fifo_details -> Phase C
- bl_shipments.outbound_status -> Phase B
- 모듈 크기(mm) 표시 -> Phase D
- 메뉴 재배치 -> Phase D
- Rust API 변경 -> Phase C
- 데이터 이관 -> Phase E

---

## 완료 기준

1. bl_line_items.po_line_id 컬럼 존재 확인 (nullable)
2. Go CRUD에서 po_line_id 정상 동작
3. 프론트 입고등록에서 PO 선택 -> 5개 필드 자동 채움
4. PO 발주품목이 BL 라인아이템 입력에 표시
5. 기존 기능 정상 (go test PASS)
