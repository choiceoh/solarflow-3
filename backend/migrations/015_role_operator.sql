-- 역할 체계 개편: staff → operator, executive 추가
-- 화면 표시: admin=시스템관리자, operator=운영팀, executive=경영진, manager=본부장, viewer=조회

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('admin', 'executive', 'operator', 'manager', 'viewer'));

-- 기존 staff → operator
UPDATE user_profiles SET role = 'operator' WHERE role = 'staff';
