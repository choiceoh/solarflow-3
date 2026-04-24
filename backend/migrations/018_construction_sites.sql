-- 018_construction_sites.sql
-- 공사 현장 마스터 + 배정 연결
-- 목적: 자체 현장 vs 타사 EPC 현장 구분, 현장별 공급 이력 관리

-- 1. construction_sites 현장 마스터
CREATE TABLE IF NOT EXISTS construction_sites (
    site_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID        NOT NULL,
    name         TEXT        NOT NULL,        -- 발전소명 (예: "영광 갈동 태양광 1호기")
    location     TEXT,                        -- 지명    (예: "전남 영광군 갈동리")
    site_type    TEXT        NOT NULL         -- 'own'(자체) | 'epc'(타사)
                 CHECK (site_type IN ('own', 'epc')),
    capacity_mw  NUMERIC(10,3),              -- 발전소 설비용량 MW (선택)
    started_at   DATE,                        -- 착공일 (선택)
    completed_at DATE,                        -- 준공일 (선택)
    notes        TEXT,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 검색 성능을 위한 인덱스 (발전소명·지명 전문검색)
CREATE INDEX IF NOT EXISTS idx_construction_sites_company
    ON construction_sites(company_id);
CREATE INDEX IF NOT EXISTS idx_construction_sites_name
    ON construction_sites USING gin(to_tsvector('simple', name || ' ' || COALESCE(location, '')));

-- 2. inventory_allocations에 site_id FK 추가
--    (nullable — 판매·기타 배정은 현장 없음)
ALTER TABLE inventory_allocations
    ADD COLUMN IF NOT EXISTS site_id UUID
    REFERENCES construction_sites(site_id) ON DELETE SET NULL;

-- 3. purpose 컬럼: construction_own / construction_epc 를 신규 허용
--    기존 'construction' 값은 호환 유지 (Go 레벨에서 허용 목록 관리)
COMMENT ON COLUMN inventory_allocations.purpose IS
    'sale | construction | construction_own | construction_epc | other';
COMMENT ON COLUMN inventory_allocations.site_id IS
    'purpose=construction_own|construction_epc 시 연결되는 현장 FK';
