# 작업: B/L(입고) 핸들러 재작성
RULES.md를 반드시 따를 것.
PO/LC/TT와 동일한 패턴(model 구조체 + response 유틸리티 + 검증).
## 파일 1: internal/model/bl.go (신규 또는 재작성)
BLShipment 구조체:
- bl_id UUID PK
- bl_number VARCHAR(30) 필수
- po_id UUID(FK) 선택 (없을 수 있음, 25년 데이터)
- lc_id UUID(FK) 선택
- company_id UUID(FK) 필수 (수입 법인)
- manufacturer_id UUID(FK) 필수 (공급사/제조사)
- inbound_type VARCHAR(20) 필수 (import/domestic/domestic_foreign/group)
- currency VARCHAR(3) 필수 (USD/KRW)
- exchange_rate DECIMAL(10,2) 선택
- etd DATE 선택 (출항일)
- eta DATE 선택 (입항일)
- actual_arrival DATE 선택 (실제 입항일)
- port VARCHAR(20) 선택 (광양항/부산항/평택항)
- forwarder VARCHAR(50) 선택 (블루오션에어/선진로지스틱스)
- warehouse_id UUID(FK) 선택 (입고 창고)
- invoice_number VARCHAR(30) 선택
- status VARCHAR(20) 필수 (scheduled/shipping/arrived/customs/completed/erp_done)
- erp_registered BOOLEAN 선택
- memo TEXT 선택
CreateBLRequest + Validate:
- bl_number 필수 + 30자 이내
- company_id 필수
- manufacturer_id 필수
- inbound_type 필수 + "import"/"domestic"/"domestic_foreign"/"group"만 허용
- currency 필수 + "USD"/"KRW"만 허용
- status 필수 + "scheduled"/"shipping"/"arrived"/"customs"/"completed"/"erp_done"만 허용
- exchange_rate 있으면 양수
UpdateBLRequest + Validate
## 파일 2: internal/model/bl_line.go (신규 또는 재작성)
BLLineItem 구조체:
- bl_line_id UUID PK
- bl_id UUID(FK) 필수
- product_id UUID(FK) 필수
- quantity INTEGER 필수 (수량 장)
- capacity_kw DECIMAL(10,3) 필수 (용량 kW = 수량 x Wp/1000)
- item_type VARCHAR(10) 필수 (main/spare)
- payment_type VARCHAR(10) 필수 (paid/free)
- invoice_amount_usd DECIMAL(15,2) 선택 (무상도 금액 있음)
- unit_price_usd_wp DECIMAL(10,6) 선택 (USD/Wp 단가)
- unit_price_krw_wp DECIMAL(10,2) 선택 (원/Wp 단가, 국내 구매 시)
- usage_category VARCHAR(20) 필수 (sale/construction/spare/replacement/repowering/transfer/adjustment)
- memo TEXT 선택
CreateBLLineRequest + Validate:
- bl_id 필수
- product_id 필수
- quantity 필수 + 양수
- capacity_kw 필수 + 양수
- item_type 필수 + "main"/"spare"만 허용
- payment_type 필수 + "paid"/"free"만 허용
- usage_category 필수 + "sale"/"construction"/"spare"/"replacement"/"repowering"/"transfer"/"adjustment"만 허용
- invoice_amount_usd 있으면 양수
- unit_price_usd_wp 있으면 양수
- unit_price_krw_wp 있으면 양수
UpdateBLLineRequest + Validate
## 파일 3: internal/handler/bl.go (재작성)
- model.BLShipment 구조체 사용
- response 패키지 사용
- List (po_id 필터, company_id 필터, manufacturer_id 필터, status 필터), GetByID, Create, Update
- List 메서드에 주석: // TODO: eta 범위 필터 추가 (대시보드 "입항 예정" 알림용)
- map[string]interface 금지
- json.Unmarshal 에러 반드시 처리
## 파일 4: internal/handler/bl_line.go (재작성)
- model.BLLineItem 구조체 사용
- response 패키지 사용
- List (bl_id 필터 필수), Create, Update, Delete
- bl_id 기반으로 해당 B/L의 라인아이템만 조회
## Rust 관련 주의 (주석으로 명시)
- 재고 집계는 Rust 담당: // TODO: Rust 계산엔진 연동 — 재고 집계 (물리적→가용→총확보량)
- capacity_kw = quantity x spec_wp / 1000은 단순 필드 계산이므로 Go에서 Create/Update 시 자동 계산 허용
- 그룹 내 거래 자동 연동: // TODO: 그룹 내 거래 자동 연동 — 출고 시 상대 법인 입고 자동 생성
## 완료 후
1. go build ./...
2. go vet ./...
3. 4개 파일 전체 코드 보여주기
4. RULES.md 체크리스트 보고
