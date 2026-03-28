# 작업: 나머지 4개 핸들러 일괄 재작성
RULES.md를 반드시 따를 것.
company, manufacturer와 동일한 패턴(model 구조체 + response 유틸리티 + 검증).
## 1. Products (가장 복잡 — 15개 필드)
model/product.go:
- Product 구조체:
  product_id UUID, product_code VARCHAR(30) 필수, product_name VARCHAR(100) 필수,
  manufacturer_id UUID(FK) 필수, spec_wp INTEGER 필수, wattage_kw DECIMAL(10,3) 필수,
  module_width_mm INTEGER 필수, module_height_mm INTEGER 필수,
  module_depth_mm INTEGER 선택, weight_kg DECIMAL(5,1) 선택,
  wafer_platform VARCHAR(30) 선택, cell_config VARCHAR(30) 선택,
  series_name VARCHAR(50) 선택, is_active BOOLEAN 필수, memo TEXT 선택
- CreateProductRequest + Validate: product_code 필수+30자, product_name 필수+100자,
  manufacturer_id 필수, spec_wp 필수+양수, wattage_kw 필수+양수,
  module_width_mm 필수+양수, module_height_mm 필수+양수
- UpdateProductRequest + Validate
handler/product.go 재작성:
- List (manufacturer_id 필터, active 필터 유지), GetByID, Create, Update
## 2. Partners
model/partner.go:
- Partner 구조체:
  partner_id UUID, partner_name VARCHAR(100) 필수, partner_type VARCHAR(20) 필수,
  erp_code VARCHAR(10) 선택, payment_terms VARCHAR(50) 선택,
  contact_name VARCHAR(50) 선택, contact_phone VARCHAR(20) 선택,
  contact_email VARCHAR(100) 선택, is_active BOOLEAN 필수
- CreatePartnerRequest + Validate: partner_name 필수+100자,
  partner_type 필수+"supplier"/"customer"/"both"만 허용
- UpdatePartnerRequest + Validate
handler/partner.go 재작성:
- List (type 필터 유지), GetByID, Create, Update
## 3. Warehouses
model/warehouse.go:
- Warehouse 구조체:
  warehouse_id UUID, warehouse_code VARCHAR(4) 필수, warehouse_name VARCHAR(50) 필수,
  warehouse_type VARCHAR(20) 필수, location_code VARCHAR(4) 필수,
  location_name VARCHAR(50) 필수, is_active BOOLEAN 필수
- CreateWarehouseRequest + Validate: warehouse_code 필수+4자,
  warehouse_name 필수+50자, warehouse_type 필수+"port"/"factory"/"vendor"만 허용,
  location_code 필수+4자, location_name 필수+50자
- UpdateWarehouseRequest + Validate
handler/warehouse.go 재작성:
- List (type 필터 유지), GetByID, Create, Update
## 4. Banks (company_id FK 있음)
model/bank.go:
- Bank 구조체:
  bank_id UUID, company_id UUID(FK) 필수, bank_name VARCHAR(50) 필수,
  lc_limit_usd DECIMAL(15,2) 필수, opening_fee_rate DECIMAL(5,4) 선택,
  acceptance_fee_rate DECIMAL(5,4) 선택, fee_calc_method VARCHAR(20) 선택,
  memo TEXT 선택, is_active BOOLEAN 필수
- CreateBankRequest + Validate: company_id 필수, bank_name 필수+50자,
  lc_limit_usd 필수+양수
- UpdateBankRequest + Validate
handler/bank.go 재작성:
- List (company_id 필터 유지), GetByID, Create, Update
## 공통 규칙
- map[string]interface 금지
- json.Unmarshal 에러 반드시 처리
- response 패키지 사용
- 주석 한국어
- 인증 체크는 "X - 미구현"으로 정직하게
## 완료 후
1. go build ./...
2. go vet ./...
3. 8개 파일(model 4개 + handler 4개) 전체 코드 보여주기
4. RULES.md 체크리스트 4개 각각 보고
