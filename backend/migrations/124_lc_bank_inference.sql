-- M124: lc_records 발급은행 prefix 매핑 (LC# 패턴 기반 best-effort)
BEGIN;

-- M12* → 신한 (현재 default 와 동일, no-op)
UPDATE lc_records SET bank_id = 'e13be7f2-d835-4893-9a87-3e0581a96eab', memo = 'M124: LC# prefix 기반 추정 (M02→산업)' WHERE lc_number LIKE 'M02%';
UPDATE lc_records SET bank_id = '38c0f484-e145-4ed0-bba0-0a0a1b44a907', memo = 'M124: LC# prefix 기반 추정 (M100→광주)' WHERE lc_number LIKE 'M100%';
UPDATE lc_records SET bank_id = 'ef4f9d00-6622-4070-ada3-c878aa02522b', memo = 'M124: LC# prefix 기반 추정 (M01→하나)' WHERE lc_number ~ '^M01[^0-9]';
UPDATE lc_records SET bank_id = 'eab8d757-524e-427f-87bb-7c749cbfaf3a', memo = 'M124: LC# prefix 기반 추정 (M03→국민)' WHERE lc_number LIKE 'M03%';
UPDATE lc_records SET memo = 'M124: LC# prefix 미인식 (M04/M34/M42) — 운영자 발급은행 확인 필요. 임시 신한 default 유지' WHERE lc_number ~ '^(M04|M34|M42)';

INSERT INTO schema_migrations(filename) VALUES ('124_lc_bank_inference.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
