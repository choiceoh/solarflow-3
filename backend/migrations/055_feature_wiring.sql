-- @auto-apply: yes
-- 055_feature_wiring.sql
-- D-120: 테넌트 격리를 feature 카탈로그 + 배선 매트릭스 두 축으로 재구성한다.
--   - tenant_features: (tenant, feature_id) → enabled. 카탈로그 default 를 admin 이 override 하는 테이블.
--   - tenant_data_scopes: (tenant, feature_id) → row_filter, column_mask. 같은 feature 안에서
--     테넌트별로 어느 행/컬럼만 보여줄지 결정. 이번 마이그레이션은 스키마만 두고 enforcement 는
--     후속 작업(쿼리 레이어 통합)에서 도입한다.
--
-- 기본 정책(D-120):
--   - 두 테이블이 비어 있으면 카탈로그(internal/feature/catalog.go) 의 DefaultTenants 가 그대로 쓰인다.
--     즉 본 마이그레이션 적용만으로는 기존 동작(D-108/D-119) 이 그대로 유지된다.
--   - admin 이 메타 편집기에서 tenant_features 행을 추가/수정하면 그 행이 default 를 덮어쓴다.
--   - fail-closed 스위치(빈 카탈로그 = 0 tenants 동작)는 모든 라우트가 RequireFeature 로
--     마이그레이션되고 검증된 후 별도 D-NNN 으로 결정한다.
--
-- 적용:
--   psql $SUPABASE_DB_URL -f backend/migrations/055_feature_wiring.sql
--   psql $SUPABASE_DB_URL -c "NOTIFY pgrst, 'reload schema';"

-- =====================================================================
-- 1. tenant_features — 기능 배선 (capability)
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenant_features (
  tenant       text NOT NULL,
  feature_id   text NOT NULL,
  enabled      boolean NOT NULL,
  -- 설명/메모: admin 이 메타 편집기에서 "왜 켰는지/껐는지" 한 줄.
  note         text,
  -- 변경 추적
  updated_by   text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant, feature_id),
  -- D-119 까지 정의된 테넌트 집합. 새 테넌트 추가 시 이 CHECK 를 갱신한다.
  CONSTRAINT tenant_features_tenant_check
    CHECK (tenant IN ('topsolar', 'cable', 'baro'))
);

COMMENT ON TABLE tenant_features IS
  'D-120 기능 배선: (tenant, feature_id) → enabled. 카탈로그(internal/feature/catalog.go) 의 DefaultTenants 를 admin 이 override 한다. 행이 없으면 default 가 그대로 쓰인다.';
COMMENT ON COLUMN tenant_features.feature_id IS
  '카탈로그(internal/feature/catalog.go)에 등록된 feature_id. 미정의 ID 는 startup 시 panic.';

-- =====================================================================
-- 2. tenant_data_scopes — 데이터 배선 (scope)
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenant_data_scopes (
  tenant       text NOT NULL,
  feature_id   text NOT NULL,
  -- row_filter: 같은 feature 가 켜진 두 테넌트가 서로 다른 행만 보게 하는 필터.
  -- 형식(D-120):
  --   { "field": { "$op": value }, ... }
  --   예: { "company_code": { "$in": ["TS","D1","HS"] } }
  -- SQL fragment 직접 입력은 금지(injection). 새 연산자 필요 시 카탈로그에 명시 추가.
  row_filter   jsonb,
  -- column_mask: 응답에서 가릴 컬럼 목록(D-116 패턴 일반화).
  -- 형식: ["unit_price", "amount", ...]
  column_mask  jsonb,
  -- 메모/변경 추적
  note         text,
  updated_by   text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant, feature_id),
  CONSTRAINT tenant_data_scopes_tenant_check
    CHECK (tenant IN ('topsolar', 'cable', 'baro'))
);

COMMENT ON TABLE tenant_data_scopes IS
  'D-120 데이터 배선: (tenant, feature_id) → row_filter / column_mask. 같은 feature 가 켜진 테넌트들이 서로 다른 행/컬럼만 보게 한다. 이번 마이그레이션은 스키마만 두고 실제 쿼리 강제는 후속 작업.';
COMMENT ON COLUMN tenant_data_scopes.row_filter IS
  'JSON DSL — 예: {"company_code": {"$in": ["TS","D1","HS"]}}. SQL fragment 직접 입력 금지(injection 방지).';
COMMENT ON COLUMN tenant_data_scopes.column_mask IS
  '가릴 컬럼 목록 — 예: ["unit_price","amount"]. D-116 BARO 입고예정 sanitized 가 첫 사례.';

-- =====================================================================
-- 3. feature_wiring_audit — 배선 변경 이력
-- =====================================================================
-- admin 이 메타 편집기에서 매트릭스를 바꿀 때마다 한 행씩 쌓는다.
-- 누가 언제 어느 (tenant, feature) 셀을 어떻게 바꿨는지 추적.

CREATE TABLE IF NOT EXISTS feature_wiring_audit (
  id            bigserial PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor         text,
  -- 'feature' = tenant_features 변경, 'data_scope' = tenant_data_scopes 변경
  axis          text NOT NULL CHECK (axis IN ('feature', 'data_scope')),
  tenant        text NOT NULL,
  feature_id    text NOT NULL,
  -- 변경 내용은 before/after 를 jsonb 로 담아 두 축 모두 동일 스키마.
  before_value  jsonb,
  after_value   jsonb,
  note          text
);

CREATE INDEX IF NOT EXISTS feature_wiring_audit_lookup_idx
  ON feature_wiring_audit (tenant, feature_id, occurred_at DESC);

COMMENT ON TABLE feature_wiring_audit IS
  'D-120 배선 변경 이력. tenant_features / tenant_data_scopes 의 모든 변경이 여기 한 행씩 쌓인다.';

-- =====================================================================
-- PostgREST 노출
-- =====================================================================
-- 메타 편집기(admin 화면) 가 PostgREST 경유로 직접 읽고 쓸 수 있도록 그랜트.
-- (운영에서는 RoleMiddleware 가 추가로 admin 만 통과시킨다 — D-070 참조)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_features TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_data_scopes TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT ON feature_wiring_audit TO authenticated';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE feature_wiring_audit_id_seq TO authenticated';
  END IF;
END $$;
