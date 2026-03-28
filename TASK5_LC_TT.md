# 작업: LC/TT 핸들러 재작성
RULES.md를 반드시 따를 것.
마스터/PO와 동일한 패턴(model 구조체 + response 유틸리티 + 검증).
## 파일 1: internal/model/lc.go (신규 또는 재작성)
LCRecord 구조체:
- lc_id UUID PK
- po_id UUID(FK) 필수 (PO 연결)
- lc_number VARCHAR(30) 선택
- bank_id UUID(FK) 필수 (은행 마스터 연결)
- company_id UUID(FK) 필수 (개설 법인)
- open_date DATE 선택 (개설일)
- amount_usd DECIMAL(15,2) 필수 (개설금액 USD)
- target_qty INTEGER 선택 (대상 수량 장)
- target_mw DECIMAL(10,2) 선택 (대상 MW)
- usance_days INTEGER 선택 (Usance 일수, 기본 90)
- usance_type VARCHAR(20) 선택 (buyers/shippers)
- maturity_date DATE 선택 (만기일)
- settlement_date DATE 선택 (실제 결제일)
- status VARCHAR(20) 필수 (pending/opened/docs_received/settled)
- memo TEXT 선택
CreateLCRequest + Validate:
- po_id 필수
- bank_id 필수
- company_id 필수
- amount_usd 필수 + 양수
- status 필수 + "pending"/"opened"/"docs_received"/"settled"만 허용
- usance_type 있으면 "buyers"/"shippers"만 허용
- target_qty 있으면 양수
- target_mw 있으면 양수
UpdateLCRequest + Validate
## 파일 2: internal/model/tt.go (신규 또는 재작성)
TTRemittance 구조체:
- tt_id UUID PK
- po_id UUID(FK) 필수 (PO 연결)
- remit_date DATE 선택 (송금일)
- amount_usd DECIMAL(15,2) 필수 (송금액 USD)
- amount_krw DECIMAL(15,0) 선택 (원화 환산)
- exchange_rate DECIMAL(10,2) 선택 (적용 환율)
- purpose VARCHAR(50) 선택 (계약금1차/계약금2차/선적전잔금 등)
- status VARCHAR(20) 필수 (planned/completed)
- bank_name VARCHAR(50) 선택 (송금 은행)
- memo TEXT 선택
CreateTTRequest + Validate:
- po_id 필수
- amount_usd 필수 + 양수
- status 필수 + "planned"/"completed"만 허용
- amount_krw 있으면 양수
- exchange_rate 있으면 양수
UpdateTTRequest + Validate
## 파일 3: internal/handler/lc.go (재작성)
- model.LCRecord 구조체 사용
- response 패키지 사용
- List (po_id 필터, bank_id 필터, company_id 필터, status 필터), GetByID, Create, Update
- List 메서드에 주석 추가: // TODO: maturity_date 범위 필터 추가 (대시보드 "LC 만기 임박" 알림용)
- map[string]interface 금지
- json.Unmarshal 에러 반드시 처리
- Rust TODO 주석: // TODO: Rust 계산엔진 연동 — LC 만기일 계산 + 한도 복원 타임라인
- Rust TODO 주석: // TODO: Rust 계산엔진 연동 — LC 수수료 계산 (Invoice Value x 수수료율 x 일수/360 x 환율)
## 파일 4: internal/handler/tt.go (재작성)
- model.TTRemittance 구조체 사용
- response 패키지 사용
- List (po_id 필터, status 필터), GetByID, Create, Update
- map[string]interface 금지
- json.Unmarshal 에러 반드시 처리
## 완료 후
1. go build ./...
2. go vet ./...
3. 4개 파일 전체 코드 보여주기
4. RULES.md 체크리스트 보고
