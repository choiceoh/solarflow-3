-- 단가이력에 법인(company_id) 컬럼 추가
-- price_histories 테이블에 company_id가 없어 INSERT가 실패하던 문제 수정
ALTER TABLE price_histories ADD COLUMN company_id UUID REFERENCES companies(company_id);
CREATE INDEX idx_price_company ON price_histories(company_id);
