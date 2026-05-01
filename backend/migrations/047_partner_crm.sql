-- 046_partner_crm.sql
-- 거래처 CRM 1차 — 담당자 + 활동 로그
--   1) partners.owner_user_id — 영업 담당자 (NULL=미배정)
--   2) partner_activities — 통화/방문/메일/메모 로그 + 후속 필요 표시
--
-- 적용:
--   psql $SUPABASE_DB_URL -f backend/migrations/046_partner_crm.sql
--   psql $SUPABASE_DB_URL -c "NOTIFY pgrst, 'reload schema';"

-- 1) 거래처 담당자 (인바운드 전화 라우팅 + "내 거래처" 필터의 축)
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS owner_user_id uuid
    REFERENCES user_profiles(user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partners_owner ON partners(owner_user_id)
  WHERE owner_user_id IS NOT NULL;

COMMENT ON COLUMN partners.owner_user_id IS
  '영업 담당자(user_profiles.user_id). NULL=미배정. 인바운드 라우팅·내 거래처 뷰의 기준.';

-- 2) 활동 로그 (통화/방문/메일/메모 + 후속 필요 표시)
CREATE TABLE IF NOT EXISTS partner_activities (
  activity_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id  uuid NOT NULL REFERENCES partners(partner_id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES user_profiles(user_id) ON DELETE SET NULL,
  kind text NOT NULL,
  body text NOT NULL,
  follow_up_required boolean NOT NULL DEFAULT false,
  follow_up_due date,
  follow_up_done boolean NOT NULL DEFAULT false,
  follow_up_done_at timestamptz,
  follow_up_done_by uuid REFERENCES user_profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_activities_kind_check
    CHECK (kind IN ('call', 'visit', 'email', 'memo')),
  CONSTRAINT partner_activities_body_not_blank
    CHECK (length(btrim(body)) > 0),
  CONSTRAINT partner_activities_followup_consistency
    CHECK (NOT follow_up_done OR follow_up_required)
);

COMMENT ON TABLE partner_activities IS
  '거래처 활동 로그 — 통화·방문·메일·메모. follow_up_required=true는 미처리함에 노출됨.';

-- 거래처 상세 타임라인 (partner_id로 필터, 최신순)
CREATE INDEX IF NOT EXISTS idx_partner_activities_partner
  ON partner_activities(partner_id, created_at DESC);

-- "내 미처리 문의" — 작성자별 미완료 후속만 (부분 인덱스로 가볍게)
CREATE INDEX IF NOT EXISTS idx_partner_activities_open_followup
  ON partner_activities(author_user_id, follow_up_due NULLS LAST)
  WHERE follow_up_required = true AND follow_up_done = false;

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION sf_touch_partner_activity_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_partner_activities_updated_at ON partner_activities;
CREATE TRIGGER trg_partner_activities_updated_at
  BEFORE UPDATE ON partner_activities
  FOR EACH ROW EXECUTE FUNCTION sf_touch_partner_activity_updated_at();

-- PostgREST 권한
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE partner_activities TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE partner_activities TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE partner_activities TO service_role;
  END IF;
END $$;
