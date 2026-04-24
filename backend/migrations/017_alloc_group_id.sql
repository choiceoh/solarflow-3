-- 017: inventory_allocations에 group_id 추가
-- 동일 배정 등록에서 생성된 stock+incoming 레코드를 그룹으로 묶기 위한 컬럼
ALTER TABLE inventory_allocations ADD COLUMN IF NOT EXISTS group_id uuid;
CREATE INDEX IF NOT EXISTS idx_alloc_group_id ON inventory_allocations(group_id);
