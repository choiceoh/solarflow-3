-- @auto-apply: yes
-- 059_disable_rls_alias_sync.sql
-- Supabase 기본 RLS 활성화 때문에 PR 2-6의 alias 테이블·external_sync_sources 가
-- anon key 백엔드에서 SELECT 0건이 되는 문제. 다른 마스터 테이블(companies/products/
-- partners) 패턴과 동일하게 RLS 비활성으로 통일.

ALTER TABLE company_aliases       DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_aliases       DISABLE ROW LEVEL SECURITY;
ALTER TABLE partner_aliases       DISABLE ROW LEVEL SECURITY;
ALTER TABLE external_sync_sources DISABLE ROW LEVEL SECURITY;
