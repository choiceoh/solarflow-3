-- @auto-apply: yes
-- 090_study_learning_domain.sql
-- D-153: study.topworks.ltd 신입 교육 도메인.
--   페이지를 만들기 전에 학습 분야(domain), 온보딩 플랜(plan), 단계(step) 스키마를 먼저 둔다.
--
-- 적용:
--   psql -d solarflow -f backend/migrations/090_study_learning_domain.sql
--   launchctl stop com.solarflow.postgrest && launchctl start com.solarflow.postgrest

-- ============================================================================
-- 1. tenant check 확장 — study.topworks.ltd
-- ============================================================================

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_tenant_scope_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_tenant_scope_check
  CHECK (tenant_scope IN ('topsolar', 'cable', 'baro', 'study'));

COMMENT ON COLUMN user_profiles.tenant_scope IS
  '사용자가 속한 앱 테넌트(topsolar/cable/baro/study). study는 study.topworks.ltd 신입 교육 전용이며 ERP 운영 API를 상속하지 않는다.';

ALTER TABLE tenant_features
  DROP CONSTRAINT IF EXISTS tenant_features_tenant_check;

ALTER TABLE tenant_features
  ADD CONSTRAINT tenant_features_tenant_check
  CHECK (tenant IN ('topsolar', 'cable', 'baro', 'study'));

ALTER TABLE tenant_data_scopes
  DROP CONSTRAINT IF EXISTS tenant_data_scopes_tenant_check;

ALTER TABLE tenant_data_scopes
  ADD CONSTRAINT tenant_data_scopes_tenant_check
  CHECK (tenant IN ('topsolar', 'cable', 'baro', 'study'));

-- ============================================================================
-- 2. 학습 분야(domain)
-- ============================================================================

CREATE TABLE IF NOT EXISTS study_learning_domains (
  domain_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_scope text NOT NULL DEFAULT 'study',
  domain_key text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  owner_role text NOT NULL DEFAULT '교육담당',
  display_order integer NOT NULL DEFAULT 100 CHECK (display_order >= 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_learning_domains_tenant_check
    CHECK (tenant_scope = 'study'),
  CONSTRAINT study_learning_domains_key_check
    CHECK (domain_key ~ '^[a-z0-9][a-z0-9_-]{0,59}$'),
  CONSTRAINT study_learning_domains_title_check
    CHECK (char_length(title) BETWEEN 1 AND 140),
  CONSTRAINT study_learning_domains_summary_check
    CHECK (char_length(summary) <= 1000),
  CONSTRAINT study_learning_domains_owner_role_check
    CHECK (char_length(owner_role) BETWEEN 1 AND 80),
  UNIQUE (tenant_scope, domain_key)
);

CREATE INDEX IF NOT EXISTS idx_study_learning_domains_status_order
  ON study_learning_domains (tenant_scope, status, display_order, created_at);

COMMENT ON TABLE study_learning_domains IS
  'D-153 study.topworks.ltd 학습 분야. 신입 교육 플랜의 step이 어느 업무/지식 분야인지 묶는다.';

-- ============================================================================
-- 3. 온보딩 학습 플랜(plan)
-- ============================================================================

CREATE TABLE IF NOT EXISTS study_learning_plans (
  plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_scope text NOT NULL DEFAULT 'study',
  plan_key text NOT NULL,
  title text NOT NULL,
  audience text NOT NULL,
  objective text NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days BETWEEN 1 AND 365),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'retired')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_learning_plans_tenant_check
    CHECK (tenant_scope = 'study'),
  CONSTRAINT study_learning_plans_key_check
    CHECK (plan_key ~ '^[a-z0-9][a-z0-9_-]{0,59}$'),
  CONSTRAINT study_learning_plans_title_check
    CHECK (char_length(title) BETWEEN 1 AND 140),
  CONSTRAINT study_learning_plans_audience_check
    CHECK (char_length(audience) BETWEEN 1 AND 120),
  CONSTRAINT study_learning_plans_objective_check
    CHECK (char_length(objective) BETWEEN 1 AND 1600),
  UNIQUE (tenant_scope, plan_key)
);

CREATE INDEX IF NOT EXISTS idx_study_learning_plans_status_created
  ON study_learning_plans (tenant_scope, status, created_at DESC);

COMMENT ON TABLE study_learning_plans IS
  'D-153 신입/직무별 학습 플랜 헤더. 화면 없이도 커리큘럼 계약을 먼저 고정한다.';

-- ============================================================================
-- 4. 플랜 단계(step)
-- ============================================================================

CREATE TABLE IF NOT EXISTS study_learning_plan_steps (
  step_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES study_learning_plans(plan_id) ON DELETE CASCADE,
  domain_id uuid REFERENCES study_learning_domains(domain_id) ON DELETE RESTRICT,
  line_no integer NOT NULL CHECK (line_no > 0),
  title text NOT NULL,
  description text NOT NULL,
  expected_minutes integer NOT NULL CHECK (expected_minutes BETWEEN 1 AND 1440),
  required boolean NOT NULL DEFAULT true,
  assessment_kind text NOT NULL DEFAULT 'none'
    CHECK (assessment_kind IN ('none', 'quiz', 'checklist', 'submission', 'manager_review')),
  resource_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_learning_plan_steps_title_check
    CHECK (char_length(title) BETWEEN 1 AND 140),
  CONSTRAINT study_learning_plan_steps_description_check
    CHECK (char_length(description) BETWEEN 1 AND 2400),
  CONSTRAINT study_learning_plan_steps_resource_url_check
    CHECK (resource_url IS NULL OR char_length(resource_url) <= 500),
  UNIQUE (plan_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_study_learning_plan_steps_plan
  ON study_learning_plan_steps (plan_id, line_no);
CREATE INDEX IF NOT EXISTS idx_study_learning_plan_steps_domain
  ON study_learning_plan_steps (domain_id);

COMMENT ON TABLE study_learning_plan_steps IS
  'D-153 학습 플랜의 실제 단계. 분야(domain), 설명, 예상 시간, 평가 방식을 가진다.';

-- ============================================================================
-- 5. starter curriculum — 페이지보다 먼저 쓸 수 있는 기본 플랜
-- ============================================================================

INSERT INTO study_learning_domains (tenant_scope, domain_key, title, summary, owner_role, display_order, status)
VALUES
  ('study', 'company_basics', '회사·보안 기본', '계정, 보안, 조직, 내부 커뮤니케이션 기본 규칙', '경영지원', 10, 'active'),
  ('study', 'solarflow_map', 'SolarFlow 업무 지도', '재고, 수주, 출고, 수금, 마스터 데이터의 큰 흐름', '운영관리', 20, 'active'),
  ('study', 'module_import_flow', '수입·통관 흐름', 'P/O, L/C, B/L, 면장, 부대비용, Landed Cost의 연결 구조', '구매/무역', 30, 'active'),
  ('study', 'baro_sales_flow', 'BARO 영업 흐름', '단가표, 인바운드 응대, 그룹내 매입, 배차, 채권 관리', '영업관리', 40, 'active'),
  ('study', 'data_hygiene', '데이터 품질', 'Excel Import Hub, 마스터 정합성, 중복/누락 방지 원칙', '시스템관리', 50, 'active'),
  ('study', 'field_basics', '태양광 제품·현장 기초', '모듈 Wp/kW, 인버터, 현장 납품, 물류 용어 기본', '기술영업', 60, 'active')
ON CONFLICT (tenant_scope, domain_key) DO NOTHING;

INSERT INTO study_learning_plans (
  tenant_scope, plan_key, title, audience, objective, duration_days, status
)
VALUES (
  'study',
  'new_employee_10_day',
  '신입사원 10일 온보딩',
  'TopWorks/SolarFlow 신규 입사자',
  '회사 기본 규칙을 익힌 뒤 SolarFlow의 운영 흐름과 핵심 도메인 용어를 설명할 수 있게 만든다.',
  10,
  'active'
)
ON CONFLICT (tenant_scope, plan_key) DO NOTHING;

WITH plan AS (
  SELECT plan_id
  FROM study_learning_plans
  WHERE tenant_scope = 'study' AND plan_key = 'new_employee_10_day'
),
domain_map AS (
  SELECT domain_key, domain_id
  FROM study_learning_domains
  WHERE tenant_scope = 'study'
)
INSERT INTO study_learning_plan_steps (
  plan_id, domain_id, line_no, title, description, expected_minutes, required, assessment_kind, resource_url
)
SELECT
  plan.plan_id,
  domain_map.domain_id,
  seed.line_no,
  seed.title,
  seed.description,
  seed.expected_minutes,
  true,
  seed.assessment_kind,
  seed.resource_url
FROM plan
JOIN (
  VALUES
    (1, 'company_basics', '계정·보안·업무 채널 세팅', '로그인, 2단계 인증, 메일/메신저, 권한 요청 절차를 점검한다.', 45, 'checklist', NULL),
    (2, 'solarflow_map', 'SolarFlow 큰 지도 읽기', '재고 → 수주 → 출고/판매 → 수금 흐름과 마스터 데이터의 역할을 한 장으로 정리한다.', 60, 'manager_review', NULL),
    (3, 'data_hygiene', '마스터 데이터 입력 원칙', '거래처/품번/창고/은행 마스터에서 중복이 왜 문제인지 사례로 학습한다.', 45, 'quiz', NULL),
    (4, 'module_import_flow', 'P/O에서 B/L까지', '해외 발주, L/C, 선적, B/L 라인이 어떻게 이어지는지 샘플 문서로 따라간다.', 75, 'manager_review', NULL),
    (5, 'module_import_flow', '면장·부대비용·원가 감각', '면장 환율, CIF, Landed Cost, 부대비용 배분이 매출 마진에 미치는 영향을 학습한다.', 75, 'quiz', NULL),
    (6, 'baro_sales_flow', 'BARO 인바운드 응대 흐름', '단가표, 입고예정, 견적, 배차, 미수금/한도 보드를 고객 문의 순서로 연결해 본다.', 60, 'manager_review', NULL),
    (7, 'field_basics', '태양광 제품과 현장 용어', 'Wp/kW/MW, 모듈 장수, 인버터, 현장 납품, B/L/컨테이너 용어를 기본 수준으로 익힌다.', 60, 'quiz', NULL),
    (8, 'data_hygiene', 'Excel Import Hub 실습 전 점검', '운영 데이터 생성은 웹 폼보다 검증된 import 흐름을 우선한다는 원칙을 확인한다.', 45, 'checklist', NULL)
) AS seed(line_no, domain_key, title, description, expected_minutes, assessment_kind, resource_url)
  ON domain_map.domain_key = seed.domain_key
ON CONFLICT (plan_id, line_no) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON study_learning_domains TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON study_learning_plans TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON study_learning_plan_steps TO authenticated';
  END IF;
END $$;
