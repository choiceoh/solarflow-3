-- 042_intercompany_requests.sql
-- BARO Phase 2 — 그룹내 매입 요청 (탑솔라→바로)
--   바로(주) 사용자가 "탑솔라에서 N장 받고 싶다"는 요청을 등록하면,
--   탑솔라 측에서 inbox에서 보고 출고로 이행.
--   탑솔라 측 group_trade 출고가 생기면 status='shipped' + outbound_id 연결,
--   바로 측에서 입고 확인하면 status='received'.
--
-- 격리:
--   - BARO만 INSERT/취소/입고확인 (RequireTenantScope("baro"))
--   - 탑솔라만 inbox 조회/거부/출고연결 (RequireTenantScope("topsolar"))
--   둘 다 미들웨어로 차단하므로 RLS는 추가하지 않는다.
--
-- 적용:
--   psql $SUPABASE_DB_URL -f backend/migrations/042_intercompany_requests.sql
--   psql $SUPABASE_DB_URL -c "NOTIFY pgrst, 'reload schema';"

CREATE TABLE IF NOT EXISTS intercompany_requests (
  request_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_company_id  uuid NOT NULL REFERENCES companies(company_id),
  target_company_id     uuid NOT NULL REFERENCES companies(company_id),
  product_id            uuid NOT NULL REFERENCES products(product_id),
  quantity              integer NOT NULL,
  desired_arrival_date  date,
  status                text NOT NULL DEFAULT 'pending',
  note                  text,
  outbound_id           uuid REFERENCES outbounds(outbound_id) ON DELETE SET NULL,
  requested_by          uuid,
  requested_by_email    text,
  responded_by          uuid,
  responded_by_email    text,
  responded_at          timestamptz,
  received_at           timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intercompany_requests_status_check
    CHECK (status IN ('pending', 'shipped', 'received', 'rejected', 'cancelled')),
  CONSTRAINT intercompany_requests_quantity_positive
    CHECK (quantity > 0),
  CONSTRAINT intercompany_requests_companies_distinct
    CHECK (requester_company_id <> target_company_id)
);

COMMENT ON TABLE intercompany_requests IS
  'BARO Phase 2: 그룹내 매입 요청. 바로(주)→탑솔라 라인이 1단계. status: pending→shipped→received (취소/거부 분기).';
COMMENT ON COLUMN intercompany_requests.outbound_id IS
  '탑솔라가 group_trade=true 출고를 만들어 연결되면 채워짐. status=shipped로 자동 전환.';

CREATE INDEX IF NOT EXISTS idx_intercompany_requests_requester
  ON intercompany_requests(requester_company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intercompany_requests_target
  ON intercompany_requests(target_company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intercompany_requests_outbound
  ON intercompany_requests(outbound_id) WHERE outbound_id IS NOT NULL;

DROP TRIGGER IF EXISTS intercompany_requests_updated_at ON intercompany_requests;
CREATE TRIGGER intercompany_requests_updated_at
  BEFORE UPDATE ON intercompany_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE intercompany_requests TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE intercompany_requests TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE intercompany_requests TO service_role;
  END IF;
END $$;
