-- 016_po_line_item_type.sql
-- po_line_items: item_type / payment_type / unit_price_usd_wp 컬럼 추가
-- Go 모델(CreatePOLineRequest, UpdatePOLineRequest)이 이 컬럼들을 D-087부터 참조하는데
-- 마이그레이션 파일이 누락되어 PGRST204 (schema cache miss) 로 INSERT/UPDATE 500 에러 발생.
-- 원인: 모델 코드 변경 시 마이그레이션 파일을 빠뜨리면 PostgREST가 컬럼을 찾지 못함.

ALTER TABLE po_line_items
  ADD COLUMN IF NOT EXISTS item_type         text,           -- 'main' | 'spare'
  ADD COLUMN IF NOT EXISTS payment_type      text,           -- 'paid'  | 'free'
  ADD COLUMN IF NOT EXISTS unit_price_usd_wp numeric(10,6); -- $/Wp 단가 (자동채움 캐시용)
