# 작업: PO(발주/계약) 핸들러 재작성
RULES.md를 반드시 따를 것.
마스터 핸들러와 동일한 패턴(model 구조체 + response 유틸리티 + 검증).
## 파일 1: internal/model/po.go (신규 또는 재작성)
PurchaseOrder 구조체 (설계문서 기준 전체 필드):
- po_id UUID PK
- po_number VARCHAR(30) 선택 (NULL 가능 — 25년 데이터는 PO번호 없을 수 있음)
- company_id UUID(FK) 필수 (발주 법인)
- manufacturer_id UUID(FK) 필수 (제조사)
- contract_type VARCHAR(20) 필수 (general/exclusive/annual/spot)
- contract_date DATE 선택
- incoterms VARCHAR(10) 선택 (CIF/FOB/BAFCA 등)
- payment_terms TEXT 선택 (자유 기재: T/T 5%, LC 90일 등)
- total_qty INTEGER 선택 (총 수량 장)
- total_mw DECIMAL(10,2) 선택 (총 MW)
- contract_period_start DATE 선택 (독점/연간 계약 시작)
- contract_period_end DATE 선택 (독점/연간 계약 종료)
- status VARCHAR(20) 필수 (draft/contracted/shipping/completed)
- memo TEXT 선택
CreatePurchaseOrderRequest + Validate:
- company_id 필수
- manufacturer_id 필수
- contract_type 필수 + "general"/"exclusive"/"annual"/"spot"만 허용
- status 필수 + "draft"/"contracted"/"shipping"/"completed"만 허용
- total_qty 있으면 양수 검증
- total_mw 있으면 양수 검증
UpdatePurchaseOrderRequest + Validate
## 파일 2: internal/model/po_line.go (신규 또는 재작성)
POLineItem 구조체 (규격 혼합 대응):
- po_line_id UUID PK
- po_id UUID(FK) 필수
- product_id UUID(FK) 필수 (품번)
- quantity INTEGER 필수 (수량 장)
- unit_price_usd DECIMAL(10,6) 선택 (USD/Wp 단가)
- total_amount_usd DECIMAL(15,2) 선택 (총액 USD)
- memo TEXT 선택
CreatePOLineRequest + Validate:
- po_id 필수
- product_id 필수
- quantity 필수 + 양수
UpdatePOLineRequest + Validate
## 파일 3: internal/handler/po.go (재작성)
기존 코드 완전 삭제 후 새로 작성.
- model.PurchaseOrder 구조체 사용
- response 패키지 사용
- List (company_id 필터, manufacturer_id 필터, status 필터), GetByID, Create, Update
- map[string]interface 금지
- json.Unmarshal 에러 반드시 처리
- 인증 미들웨어 적용 전제 (핸들러 내부에서 별도 인증 체크 불필요)
## 파일 4: internal/handler/po_line.go (재작성)
- model.POLineItem 구조체 사용
- List (po_id 필터 필수), Create, Update, Delete
- po_id 기반으로 해당 PO의 라인아이템만 조회
## Rust 관련 주의
- PO 입고현황 집계(계약량/LC개설/선적완료/입고완료/미착품/잔여량)는 Rust 담당
- 핸들러에 해당 기능 필요한 곳에 주석 남길 것:
  // TODO: Rust 계산엔진 연동 — PO 입고현황 집계 (계약량 vs LC개설 vs 선적 vs 입고)
## 완료 후
1. go build ./...
2. go vet ./...
3. 4개 파일 전체 코드 보여주기
4. RULES.md 체크리스트 보고
