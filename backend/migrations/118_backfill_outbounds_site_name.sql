-- 118_backfill_outbounds_site_name.sql
-- xlsx [solarflow 자료.xlsx][출고] 의 프로젝트 컬럼 → outbounds.site_name 백필

-- 배경:
--   outbounds.site_name 이 798/2157 (37%) 만 채워져 있어 출고 추적 정확도
--   미흡. xlsx [출고] 시트의 프로젝트 컬럼이 발전소명을 일부 보유 (324건)
--   하므로 erp_outbound_no 매칭 후 site_name 이 비어있는 행만 보강.
--
-- 멱등성: 이미 site_name 있는 행은 건너뜀.

BEGIN;

WITH src (outbound_id, site_name) AS (VALUES
  ('fc19d900-3cc5-49de-916a-b2ddc96677db'::uuid, '영광 두우리 영백염전1차(10MW)'),
  ('576dcb88-bf65-4bca-a101-7836647ffdb6'::uuid, '영광 두우리 영백염전2차(35.15MW)'),
  ('8009ebac-1b03-46ef-bab1-81a93f22791d'::uuid, '영광 두우리 영백염전2차(35.15MW)'),
  ('3ed529a8-efa4-476a-87b1-8a0771542ef4'::uuid, '영광 두우리 영백염전2차(35.15MW)'),
  ('3095ed54-f736-4cf3-a0ad-ae2b180695ea'::uuid, '신안 비금태양광 EPC 공사'),
  ('4ff45078-60d6-4f18-8477-35e757ae548c'::uuid, '신안 비금태양광 EPC 공사'),
  ('bb418ba0-5ed3-4d34-bc42-431512ad10e8'::uuid, '신안 비금태양광 EPC 공사'),
  ('c3b60a09-8e9f-4540-85a0-3b53e5d1089a'::uuid, '신안 비금태양광 EPC 공사'),
  ('cdeee69a-cab6-4a86-9fc8-6fbf50015e77'::uuid, '신안 비금태양광 EPC 공사'),
  ('abcfce1d-1a24-4d89-86ae-8b484b9c4eee'::uuid, '남원 내척동(661번지-(유)송탄,(유)영통)'),
  ('bfbd08ce-5c21-49f4-9294-7a350b9df037'::uuid, '남원 내척동(661번지-(유)송탄,(유)영통)'),
  ('6d3b4d87-9f10-4b90-9dd0-bd65c1fc901b'::uuid, '신안 비금태양광 EPC 공사'),
  ('5f2de3c0-9d4c-439c-8bc5-69b919682aac'::uuid, '리파워링_나주 남창리((주)온누리 1.8MW)'),
  ('cfc1ff48-4b04-415c-bef7-70619b58a799'::uuid, '신안 비금태양광 EPC 공사'),
  ('1cbd0e3f-1a39-4e78-9830-1734208b317e'::uuid, '신안 비금태양광 EPC 공사'),
  ('fa5159d0-721b-42f6-9541-66c016f4a5ef'::uuid, '신안 비금태양광 EPC 공사'),
  ('90c5e7a0-43b7-4f5c-a378-082987098f25'::uuid, '신안 비금태양광 EPC 공사')
)
UPDATE outbounds o
SET site_name = src.site_name, updated_at = now()
FROM src
WHERE o.outbound_id = src.outbound_id
  AND (o.site_name IS NULL OR o.site_name = '');

-- 검증
SELECT 'site_name_filled' AS metric, COUNT(*) FILTER (WHERE site_name <> '' AND site_name IS NOT NULL) AS value, COUNT(*) AS total
FROM outbounds WHERE company_id = '99f0fc15-0555-4a41-a025-8bf3630a7947';

COMMIT;