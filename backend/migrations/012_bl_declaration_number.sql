-- F20: 면장 별도 화면 삭제 — 면장번호를 bl_shipments에 직접 저장
-- 비유: 입고 서류에 "면장번호" 칸 추가 — 별도 면장 서류철을 두지 않음

ALTER TABLE bl_shipments
  ADD COLUMN IF NOT EXISTS declaration_number text;

NOTIFY pgrst, 'reload schema';
