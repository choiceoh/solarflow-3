-- M148: lc_records.target_qty NULL 보강 — xlsx 마스터 Q'ty
-- @auto-apply: yes
-- 출처: 수입진행상황(module)-2025/2026년도.xlsx 의 Q'ty 컬럼
-- NULL/0 인 target_qty 만 보강: 51건
-- amount 는 분할 인출/합계 혼동 가능성으로 본 마이그 제외 (운영자 검토)

BEGIN;
UPDATE lc_records SET target_qty=39960, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (39960 PCS)', updated_at=now() WHERE lc_id='0e859791-e8d8-4af6-ade4-69bb53512207'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=15984, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (15984 PCS)', updated_at=now() WHERE lc_id='669deb74-5dae-4253-994f-3a6c725e6ee1'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=8784, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (8784 PCS)', updated_at=now() WHERE lc_id='9545ed06-873c-43bf-98f3-be9731917729'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=17568, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (17568 PCS)', updated_at=now() WHERE lc_id='e4b322ca-5c09-4586-baff-d0babec4a697'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=15876, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (15876 PCS)', updated_at=now() WHERE lc_id='893c6ffe-b41d-4d2a-a05c-ba31b0a0d8a6'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=79380, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (79380 PCS)', updated_at=now() WHERE lc_id='c368b8fd-1872-4d9f-9910-fefa91c3bb70'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=53334, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (53334 PCS)', updated_at=now() WHERE lc_id='8388cb93-7db8-4b4a-8f89-fc8a2ea70f31'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=7812, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (7812 PCS)', updated_at=now() WHERE lc_id='3011ace1-4acb-478e-a344-48c15f102200'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=38202, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (38202 PCS)', updated_at=now() WHERE lc_id='a6c586b9-263e-42b6-9f23-8b8f1a2345e0'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=21852, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (21852 PCS)', updated_at=now() WHERE lc_id='6385b0ac-aad2-4236-b35b-db65eb617b2f'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=28182, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (28182 PCS)', updated_at=now() WHERE lc_id='8a2b5a5f-a7ae-4724-9cc8-8a40de46f695'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=94500, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (94500 PCS)', updated_at=now() WHERE lc_id='4631861e-884c-44ee-b770-0bbdbb13ba61'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=188660, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (188660 PCS)', updated_at=now() WHERE lc_id='63fea165-24b3-41a0-8151-94b255f90583'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=1588, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (1588 PCS)', updated_at=now() WHERE lc_id='5ac34aa0-1fd5-4d8f-bdbc-d9f53fb9763b'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=63000, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (63000 PCS)', updated_at=now() WHERE lc_id='9c44a69d-0465-440a-9f54-686c28b5a07b'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=81900, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (81900 PCS)', updated_at=now() WHERE lc_id='716352c1-f2ca-4cf9-8037-2360d5665327'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=1656, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (1656 PCS)', updated_at=now() WHERE lc_id='b6900849-f7bf-48d5-89a1-ef0d4510a0b6'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=18701, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (18701 PCS)', updated_at=now() WHERE lc_id='7bca13c2-6cbc-45f8-9ffb-fa7cffae83ee'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=53074, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (53074 PCS)', updated_at=now() WHERE lc_id='aa6bfedd-743c-49a2-8cb8-b5517118a8e9'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=46524, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (46524 PCS)', updated_at=now() WHERE lc_id='5ab52595-13e3-4484-8d30-5f70f2320bbf'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=46524, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (46524 PCS)', updated_at=now() WHERE lc_id='5acf68ec-5205-4854-9122-bb143f521d9b'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=13524, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (13524 PCS)', updated_at=now() WHERE lc_id='08256554-4d64-4ff7-86c5-c437d2e9d5ac'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=23622, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (23622 PCS)', updated_at=now() WHERE lc_id='444a7fd8-0c5d-4b72-bbc9-5c577dfd0134'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=27522, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (27522 PCS)', updated_at=now() WHERE lc_id='5f458643-9794-4f22-a3cf-946280d3239a'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=17280, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (17280 PCS)', updated_at=now() WHERE lc_id='8a6c4dd8-f30b-4852-940b-e63599c934b4'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=510, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (510 PCS)', updated_at=now() WHERE lc_id='e3a1ecb7-73d6-4c18-943e-afc252633785'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=510, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (510 PCS)', updated_at=now() WHERE lc_id='cc789cb5-51cd-4a34-bf3f-0ceba75fcdc8'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=3468, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (3468 PCS)', updated_at=now() WHERE lc_id='08f7803b-3c55-450b-b27f-32dae5bec855'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=23616, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (23616 PCS)', updated_at=now() WHERE lc_id='dc977669-a243-4088-8d6e-c1fc71f80c0d'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=46620, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (46620 PCS)', updated_at=now() WHERE lc_id='4b7445ec-dae6-44e6-80b2-7a2b15673389'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=15768, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (15768 PCS)', updated_at=now() WHERE lc_id='0a32b9cd-834f-4fd1-aac2-5532f2bb87f6'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=36, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (36 PCS)', updated_at=now() WHERE lc_id='cd769393-9dcc-4b82-a7c9-4ae71fd1e5a6'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=4879, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (4879 PCS)', updated_at=now() WHERE lc_id='87700c53-2977-4fab-9b10-26a4aff5181a'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=49536, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (49536 PCS)', updated_at=now() WHERE lc_id='e6566d18-77c4-4f9c-ba40-07ab33a0f019'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=8640, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (8640 PCS)', updated_at=now() WHERE lc_id='05662029-96ff-4451-8418-db97899f2684'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=3096, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (3096 PCS)', updated_at=now() WHERE lc_id='44a648ac-7324-4a4b-9b4c-2fa8535f801d'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=85938, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (85938 PCS)', updated_at=now() WHERE lc_id='d81953db-e9c8-4934-b40d-945ffe72773d'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=2946, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (2946 PCS)', updated_at=now() WHERE lc_id='63b78ad8-cae1-4940-a812-e2216aefdc76'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=7128, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (7128 PCS)', updated_at=now() WHERE lc_id='44dc7489-f353-440e-9fd0-30c5a2d7d723'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=668, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (668 PCS)', updated_at=now() WHERE lc_id='f91d0f06-57fa-40f7-9788-15dd93b8a048'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=15552, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (15552 PCS)', updated_at=now() WHERE lc_id='87c2b871-d1a6-4e0d-be47-815af3f1289b'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=31464, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (31464 PCS)', updated_at=now() WHERE lc_id='61961e91-c90e-4cf2-87ac-938416f04b00'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=6699, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (6699 PCS)', updated_at=now() WHERE lc_id='70521070-aaa5-4192-b5db-da114aca336f'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=13508, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (13508 PCS)', updated_at=now() WHERE lc_id='076314a6-a405-4816-8004-48e708b4eaf4'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=13508, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (13508 PCS)', updated_at=now() WHERE lc_id='e46608b1-fe45-4483-9edf-25c4fed7d8d8'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=71543, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (71543 PCS)', updated_at=now() WHERE lc_id='df5b87cf-c208-4a55-b5f4-dafc604bf22f'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=24875, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (24875 PCS)', updated_at=now() WHERE lc_id='26b99726-6d7d-468a-9287-d575e025f084'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=24875, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (24875 PCS)', updated_at=now() WHERE lc_id='f8e2d5a3-7c5d-44ae-9afd-d167cf4b6032'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=41679, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (41679 PCS)', updated_at=now() WHERE lc_id='8e3c2a18-121c-4781-8281-773044111565'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=41679, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (41679 PCS)', updated_at=now() WHERE lc_id='af58b595-f21d-4452-b0c4-b96f7f585b32'::uuid AND (target_qty IS NULL OR target_qty=0);
UPDATE lc_records SET target_qty=47460, memo=COALESCE(memo,'')||E'\n'||'M148: xlsx qty 보강 (47460 PCS)', updated_at=now() WHERE lc_id='b296fa2a-51e6-4ea0-aef2-b59ceaa4843b'::uuid AND (target_qty IS NULL OR target_qty=0);
COMMIT;