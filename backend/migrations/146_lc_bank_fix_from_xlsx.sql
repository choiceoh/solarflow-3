-- M146: lc_records.bank_id 정정 — 수입진행상황 xlsx 마스터 기준
-- @auto-apply: yes
-- 출처: 수입진행상황(module)-2025/2026년도.xlsx (운영자 관리 LC 마스터)
-- 정정 대상: 25행 (M119/M124/M134 백필 시 prefix 추정 매핑 오류)
-- 정정 패턴 (DB → xlsx):
--   M12MK ×18: 신한 → 하나
--   M100R ×5:  광주/하나 → 국민
--   M04NG ×1:  신한 → 기업
--   M34PD ×1:  신한 → 광주

BEGIN;
-- M04NG2506NU00032 2025-07-24 신한은행 → 기업은행
UPDATE lc_records SET bank_id=(SELECT bank_id FROM banks WHERE bank_name='기업은행' LIMIT 1), memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→기업은행)', updated_at=now() WHERE lc_id='444a7fd8-0c5d-4b72-bbc9-5c577dfd0134'::uuid;
-- M100R2509NU00040 2025-10-20 광주은행 → 국민은행
UPDATE lc_records SET bank_id='eab8d757-524e-427f-87bb-7c749cbfaf3a'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 광주은행→국민은행)', updated_at=now() WHERE lc_id='5f458643-9794-4f22-a3cf-946280d3239a'::uuid;
-- M100R2512NU00025 2025-12-25 광주은행 → 국민은행
UPDATE lc_records SET bank_id='eab8d757-524e-427f-87bb-7c749cbfaf3a'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 광주은행→국민은행)', updated_at=now() WHERE lc_id='8a6c4dd8-f30b-4852-940b-e63599c934b4'::uuid;
-- M100R2602NU00107 2026-04-16 광주은행 → 국민은행
UPDATE lc_records SET bank_id='eab8d757-524e-427f-87bb-7c749cbfaf3a'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 광주은행→국민은행)', updated_at=now() WHERE lc_id='e3a1ecb7-73d6-4c18-943e-afc252633785'::uuid;
-- M100R2602NU00107 2026-04-16 광주은행 → 국민은행
UPDATE lc_records SET bank_id='eab8d757-524e-427f-87bb-7c749cbfaf3a'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 광주은행→국민은행)', updated_at=now() WHERE lc_id='cc789cb5-51cd-4a34-bf3f-0ceba75fcdc8'::uuid;
-- M100R2602NU00114 2026-02-01 하나은행 → 국민은행
UPDATE lc_records SET bank_id='eab8d757-524e-427f-87bb-7c749cbfaf3a'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 하나은행→국민은행)', updated_at=now() WHERE lc_id='08f7803b-3c55-450b-b27f-32dae5bec855'::uuid;
-- M12MK2502NU00018 2025-03-01 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='dc977669-a243-4088-8d6e-c1fc71f80c0d'::uuid;
-- M12MK2502NU00032 2025-03-10 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='4b7445ec-dae6-44e6-80b2-7a2b15673389'::uuid;
-- M12MK2503NU00025 2025-04-30 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='0a32b9cd-834f-4fd1-aac2-5532f2bb87f6'::uuid;
-- M12MK2503NU00032 2025-04-19 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='cd769393-9dcc-4b82-a7c9-4ae71fd1e5a6'::uuid;
-- M12MK2503NU00040 2025-04-08 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='87700c53-2977-4fab-9b10-26a4aff5181a'::uuid;
-- M12MK2504NU00018 2025-04-20 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='4712dbe5-f7ad-465e-9e85-9a327f636821'::uuid;
-- M12MK2504NU00025 2025-06-04 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='e6566d18-77c4-4f9c-ba40-07ab33a0f019'::uuid;
-- M12MK2504NU00032 2025-05-26 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='05662029-96ff-4451-8418-db97899f2684'::uuid;
-- M12MK2507NU00025 2025-08-10 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='44a648ac-7324-4a4b-9b4c-2fa8535f801d'::uuid;
-- M12MK2508NU00025 2025-09-05 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='63b78ad8-cae1-4940-a812-e2216aefdc76'::uuid;
-- M12MK2508NU00032 2025-09-29 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='44dc7489-f353-440e-9fd0-30c5a2d7d723'::uuid;
-- M12MK2508NU00057 2025-09-30 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='f91d0f06-57fa-40f7-9788-15dd93b8a048'::uuid;
-- M12MK2510NU00025 2025-11-03 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='87c2b871-d1a6-4e0d-be47-815af3f1289b'::uuid;
-- M12MK2510NU00040 2025-11-18 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='61961e91-c90e-4cf2-87ac-938416f04b00'::uuid;
-- M12MK2511NU00032 2025-12-23 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='70521070-aaa5-4192-b5db-da114aca336f'::uuid;
-- M12MK2601NU00040 2026-02-24 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='e46608b1-fe45-4483-9edf-25c4fed7d8d8'::uuid;
-- M12MK2602NU00018 2026-03-17 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='df5b87cf-c208-4a55-b5f4-dafc604bf22f'::uuid;
-- M12MK2602NU00025 2026-04-16 신한은행 → 하나은행
UPDATE lc_records SET bank_id='ef4f9d00-6622-4070-ada3-c878aa02522b'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→하나은행)', updated_at=now() WHERE lc_id='f8e2d5a3-7c5d-44ae-9afd-d167cf4b6032'::uuid;
-- M34PD2601NU00018 2026-02-21 신한은행 → 광주은행
UPDATE lc_records SET bank_id='38c0f484-e145-4ed0-bba0-0a0a1b44a907'::uuid, memo=COALESCE(memo,'')||E'\n'||'M146: bank 정정 (xlsx 마스터 기준 신한은행→광주은행)', updated_at=now() WHERE lc_id='af58b595-f21d-4452-b0c4-b96f7f585b32'::uuid;
COMMIT;