-- 040_tenant_scope.sql
-- D-108: 단일 DB + URL 기반 테넌트 분기 + 코드 레벨 정보 마스킹
--   탑솔라 SolarFlow와 바로 SolarFlow가 같은 DB·같은 코드베이스를 공유하되,
--   user_profiles.tenant_scope으로 사용자가 어느 앱(URL)에 속하는지 못박는다.
--   격리는 1단계로 한정: 바로 사용자는 탑솔라의 수입원가/LC/면장/T/T/부대비용/마진 등
--   금융·원가 응답을 받지 못한다(미들웨어 차단). 공유 거래/재고/마스터는
--   같은 계열사로서 그대로 공유한다.
--
-- 적용 절차 (CLAUDE.md "Go 모델 필드 변경 시 필수 절차" 참조):
--   psql -d solarflow -f backend/migrations/040_tenant_scope.sql
--   launchctl stop com.solarflow.postgrest && launchctl start com.solarflow.postgrest
--   cd backend && ./scripts/check_schema.sh

-- 1. 바로(주) 법인 시드 — 유통 계열사
INSERT INTO companies (company_name, company_code, is_active)
VALUES ('바로(주)', 'BR', true)
ON CONFLICT (company_code) DO NOTHING;

-- 2. user_profiles.tenant_scope — 사용자가 속한 앱 테넌트
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS tenant_scope text NOT NULL DEFAULT 'topsolar';

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_tenant_scope_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_tenant_scope_check
  CHECK (tenant_scope IN ('topsolar', 'baro'));

COMMENT ON COLUMN user_profiles.tenant_scope IS
  'D-108: 사용자가 속한 앱 테넌트(topsolar/baro). baro 사용자는 baro.topworks.ltd에서만 접속하고 탑솔라의 수입원가/LC/면장/T/T/한도/단가 이력/부대비용/마진 등 1단계 차단 엔드포인트의 응답을 받지 못한다. 공유 거래/재고는 계열사로서 그대로 공유한다.';
