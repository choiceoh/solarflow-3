-- 041_partner_price_book.sql
-- BARO Phase 1 — 거래처별 단가표
--   바로(주) 영업/내근직이 partner × product 표준단가/할인율을 등록해두면,
--   수주 입력 시 단가가 자동으로 채워지고 마진이 보호된다.
--   백엔드 미들웨어 RequireTenantScope("baro")로 차단하므로 RLS는 추가하지 않는다.
--
-- 적용 절차:
--   psql $SUPABASE_DB_URL -f backend/migrations/041_partner_price_book.sql
--   psql $SUPABASE_DB_URL -c "NOTIFY pgrst, 'reload schema';"
--   cd backend && ./scripts/check_schema.sh

CREATE TABLE IF NOT EXISTS partner_price_book (
  price_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      uuid NOT NULL REFERENCES partners(partner_id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  unit_price_wp   numeric(12, 3) NOT NULL,
  discount_pct    numeric(5, 2) NOT NULL DEFAULT 0,
  effective_from  date NOT NULL DEFAULT CURRENT_DATE,
  effective_to    date,
  memo            text,
  tenant_scope    text NOT NULL DEFAULT 'baro',
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_price_book_tenant_scope_check
    CHECK (tenant_scope = 'baro'),
  CONSTRAINT partner_price_book_unit_price_positive
    CHECK (unit_price_wp >= 0),
  CONSTRAINT partner_price_book_discount_range
    CHECK (discount_pct >= 0 AND discount_pct <= 100),
  CONSTRAINT partner_price_book_effective_range
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE partner_price_book IS
  'BARO Phase 1: 거래처별 품번 표준단가/할인율 (수주 입력 시 자동 prefill 용도). RequireTenantScope("baro")로 격리.';
COMMENT ON COLUMN partner_price_book.unit_price_wp IS '단가(원/Wp)';
COMMENT ON COLUMN partner_price_book.discount_pct IS '할인율(%) 0~100';
COMMENT ON COLUMN partner_price_book.effective_from IS '적용 시작일(포함)';
COMMENT ON COLUMN partner_price_book.effective_to IS '적용 종료일(포함, NULL이면 무기한)';

-- (partner, product, effective_from) 동일 시작일 중복 등록 방지
CREATE UNIQUE INDEX IF NOT EXISTS partner_price_book_partner_product_from_unique
  ON partner_price_book(partner_id, product_id, effective_from);

-- lookup 최적화: partner+product 인덱스
CREATE INDEX IF NOT EXISTS idx_partner_price_book_lookup
  ON partner_price_book(partner_id, product_id, effective_from DESC);

-- updated_at 자동 갱신 트리거 (다른 테이블과 동일 패턴)
DROP TRIGGER IF EXISTS partner_price_book_updated_at ON partner_price_book;
CREATE TRIGGER partner_price_book_updated_at
  BEFORE UPDATE ON partner_price_book
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE partner_price_book TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE partner_price_book TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE partner_price_book TO service_role;
  END IF;
END $$;
