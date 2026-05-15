-- M120: po_line_items 백필 — DB-3 모델명+규격 → products 매핑
BEGIN;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '9529d2e2-9ec8-405d-a5c0-f7ac17eef3b3', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 11520, 0.085000, 53.975000, 621792.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2502' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '1a6ef019-5bf9-43b9-a965-d5a337d39e26', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 12096, 0.085000, 53.975000, 652881.60, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2502' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'db9c437a-b399-4f0d-a049-7a8d4ce053a6', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 11520, 0.085000, 53.975000, 621792.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2503' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '3450b7b7-2502-413a-9c57-991e8e3594b6', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 11520, 0.085000, 53.975000, 621792.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2503' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'f15e9e61-c026-479e-9007-47239f89012c', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 11520, 0.085000, 53.975000, 621792.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2503' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '22f5fb48-2d2b-4749-9dee-b7c8450c7d47', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 12060, 0.085000, 53.975000, 650938.50, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2503' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'd5df8f7f-98d4-45db-bdb2-6abf46508bdb', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 17280, 0.080000, 50.800000, 877824.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2504' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '805cbad8-7f27-440b-b5dd-1fa31cc223e7', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 5760, 0.080000, 50.800000, 292608.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2504' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '8b790aab-4fe4-4cfb-b649-c0234ec48913', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 8460, 0.080000, 50.800000, 676800.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2504' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'c0078ae1-7550-4628-81a9-f1805d17f381', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 11520, 0.080000, 50.800000, 921600.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2504' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '0fe056fb-c2b4-4ac7-ae4e-66fae8eb789a', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 11520, 0.080000, 50.800000, 585216.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2504' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '633d8251-7b8f-437d-9122-48ed2ed47960', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 16128, 0.080000, 50.800000, 819302.40, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2504' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '70ff43e9-8c13-4629-8a86-ff82344b366f', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 8640, 0.080000, 50.800000, 691200.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2505' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'e53cc6a2-1fff-4756-985b-acd66fedcc32', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 16128, 0.080000, 50.800000, 819302.40, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2506' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '9657c5fe-c801-4bbe-8add-5e5bc434266a', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 17280, 0.080000, 50.800000, 877824.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2506' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '36d6af4a-60f1-4abf-b4b1-3e794ccbb34c', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 16128, 0.080000, 50.800000, 819302.40, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2506' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '2e992f93-db54-4f87-923d-0a37cd7e5de4', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 14400, 0.080000, 50.800000, 731520.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2507' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'b7ff9c97-f1a2-40d2-889c-91fb943bcd56', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 14400, 0.080000, 50.800000, 731520.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2507' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'efe78b85-8541-43e9-be72-c1675e94b5f7', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 4374, 0.080000, 50.800000, 222199.20, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2507' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'cab7e94d-07d5-48dd-82e8-3a75846ca25c', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 20160, 0.080000, 50.800000, 1024128.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2507' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '25e174b2-2b0b-40f8-97d6-4dea5ce35f20', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 17280, 0.080000, 50.800000, 877824.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2507' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '29325783-ca2c-439c-a2f7-e8b4c50c6797', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 17856, 0.080000, 50.800000, 907084.80, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2507' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '76f7469c-30e1-4de7-843f-5a6598a588c0', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 12324, 0.080000, 50.800000, 626059.20, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2507' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '3aa1ccbf-eaf9-4487-9e0d-176dd25742a4', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 11520, 0.080000, 50.800000, 585216.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2508' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '80948592-7474-4e6c-8aa8-5cab715a7286', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 10944, 0.080000, 50.800000, 555955.20, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2508' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'b810f9f8-9247-44f5-b020-18045dcae7d3', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 17718, 0.080000, 50.800000, 900074.40, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2508' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '9e8e26fc-d0ec-400f-a5d3-58e62cbfab2e', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 8640, 0.090000, 57.150000, 493776.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'c84022c4-a04d-4c88-82b0-2dd94c61cd66', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 12096, 0.090000, 57.150000, 691286.40, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '133e7778-9641-4404-b891-8967761ace1a', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 14976, 0.090000, 57.150000, 1344067.20, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '0f68f1e4-8193-4642-9258-63137577698d', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 12616, 0.090000, 57.150000, 1135440.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'c29be556-a700-4174-8e31-aff42df27766', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 13248, 0.090000, 57.150000, 1192320.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'e81e5155-9641-49c2-bf83-5fcb5c04b824', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 8640, 0.090000, 57.150000, 779760.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'c95be169-9bdc-48aa-a5fc-8b7f7591c0a6', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 8640, 0.090000, 57.150000, 493776.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '601fb326-cd63-48a8-a470-d535a36d4248', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 14976, 0.090000, 57.150000, 855878.40, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '38431b4a-b7b7-49f8-b681-70cd2ce58d69', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 668, 0.090000, 57.150000, 38176.20, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2510' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'd06c11be-a016-4e31-b6a4-37a110d308c6', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 31464, 0.089700, 56.959500, 2822297.76, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2511' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '266cc71f-4a81-44e2-9661-a694eda7ae23', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 15732, 0.087000, 55.245000, 1368688.44, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'b6e01d8e-e7ef-426f-8fc1-8dcfd7de392d', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 17532, 0.087000, 55.245000, 968555.34, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'f8779cac-47eb-4064-b4fb-ae0ba120974f', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 4284, 0.087000, 55.245000, 236669.58, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'e208d0c7-14fd-4695-ae98-dcc0b70705be', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 19332, 0.087000, 55.245000, 1067996.34, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'ac16a435-29de-4ce5-b7cb-645b88171c48', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 13248, 0.087000, 55.245000, 1152576.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '12a4d1fa-4808-471f-ba3b-d02e0d4c7334', po.po_id, 'a6464ccb-0637-4aa1-9f01-2a5892651537', 15552, 0.087000, 55.680000, 1353026.40, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-RSRS640-2511' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '5d82f960-fd7f-423d-a433-f155606dd2be', po.po_id, '8e04c71b-f309-449c-bd14-1e5e4716a7e8', 3902, 0.095000, 58.425000, 227974.35, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR615C-2504' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'd31238d5-baf8-4d2b-878c-6357138056ed', po.po_id, '8e04c71b-f309-449c-bd14-1e5e4716a7e8', 4879, 0.085000, 52.275000, 255049.73, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR615C-2504' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '7072a697-fa13-4606-a289-098f7eacd714', po.po_id, '8e04c71b-f309-449c-bd14-1e5e4716a7e8', 4877, 0.095000, 58.425000, 284938.73, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR615M-2504' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '80fd803e-d01c-49e2-983d-be6ae461cf3e', po.po_id, '82c16788-ebbc-4627-82fe-154aab68601b', 2160, 0.094000, 60.160000, 129945.60, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR640M-2508' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '36a0f9b4-8e15-4e09-94ac-8ee96eae89bf', po.po_id, 'f33b0c38-9585-4a93-b2be-4bf988149727', 2160, 0.094000, 60.630000, 130910.40, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR640M-2508' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '11c9edb8-3d59-492e-95a2-8b0d9d64ddac', po.po_id, '490706de-05f8-4698-8b78-3044b869efe7', 720, 0.084000, 52.080000, 37497.60, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR640M-2508' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '427b563c-8b5a-428c-9dbd-07c1ba5a39ce', po.po_id, '82c16788-ebbc-4627-82fe-154aab68601b', 946, 0.094000, 60.160000, 56841.28, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR640M-2508' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'eb23a5fc-047d-4d71-b887-2ea0b1e2111e', po.po_id, 'f33b0c38-9585-4a93-b2be-4bf988149727', 2643, 0.094000, 60.630000, 158958.15, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR640M-2508' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'dde3852b-7002-479a-8597-d2f970d698d1', po.po_id, 'f33b0c38-9585-4a93-b2be-4bf988149727', 2946, 0.094000, 60.630000, 178615.98, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR645M-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '18acb568-ddcc-4cfe-86b0-e72e467b2bab', po.po_id, 'b99745e0-0a73-4ac2-9fb8-903884fbf47f', 4795, 0.094000, 61.100000, 291147.50, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR645M-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'b3b53a32-c2b0-4338-8922-ea7c609369f1', po.po_id, 'd47a007a-1599-4c63-ba0d-b15349b9a060', 14091, 0.083000, 58.930000, 830382.63, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-TRTR710-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '36a65c21-0098-43c2-89e6-96ab0d37c9fd', po.po_id, 'b53606f2-3e98-48b9-90c7-4b3a0f23fd72', 7128, 0.083000, 58.100000, 414136.80, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-TRTR710-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'eb87815b-af4a-403e-9775-41465836ac05', po.po_id, 'd47a007a-1599-4c63-ba0d-b15349b9a060', 21384, 0.083000, 58.930000, 1260159.12, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-TRTR710-2510' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '66664985-1653-467c-bad7-8156bedf6312', po.po_id, '70e49056-ba4b-437b-9341-edcd6dd52ef4', 10692, 0.083000, 59.760000, 638953.92, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-TRTR710-2510' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'bf22de2c-7639-495f-8df1-174b87070ed4', po.po_id, '70e49056-ba4b-437b-9341-edcd6dd52ef4', 10131, 0.083000, 59.760000, 605428.56, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-TRTR710-2510' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '0b9a365f-904f-474a-9683-06860e7e26e1', po.po_id, '70e49056-ba4b-437b-9341-edcd6dd52ef4', 6699, 0.083000, 59.760000, 400332.24, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-TRTR720-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '3e23f092-12dd-453e-be37-59cda2b880f0', po.po_id, '6b65101f-12d5-437e-b25c-cdff42036033', 6293, 0.089000, 56.515000, 355648.90, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-KNJA635-2507' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'bc86296d-9898-4003-8a8c-4d62aa97fe81', po.po_id, 'c382d34d-cb4b-40e7-8ef4-b45694ff6363', 7812, 0.089000, 56.960000, 444971.52, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-KNJA635-2507' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '8d512f6c-8507-4481-8692-c2bf0bc8fb62', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 11772, 0.087000, 55.245000, 650344.14, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '2382936e-e967-4019-b6a7-5ab07aae01d6', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 17280, 0.110000, 69.850000, 1207008.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2602' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '419a2168-2628-4599-9869-4a74a4e92867', po.po_id, 'a7df15a9-a99e-442d-9020-0ec2ac0a9df8', 1656, 0.112000, 71.680000, 118702.08, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK640-2602' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'a2eecb52-5ffa-4312-a77d-4a20a7ae6489', po.po_id, 'a7df15a9-a99e-442d-9020-0ec2ac0a9df8', 8576, 0.112000, 71.680000, 614727.68, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK640-2602' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'a0afe2e2-8884-4c1d-9e8d-e6625e146e60', po.po_id, 'a7df15a9-a99e-442d-9020-0ec2ac0a9df8', 17280, 0.112000, 71.680000, 1238630.40, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK640-2602' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '08e6b48d-4af9-412d-8f65-b913571c4382', po.po_id, 'a7df15a9-a99e-442d-9020-0ec2ac0a9df8', 17280, 0.112000, 71.680000, 1238630.40, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK640-2602' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '9ff8341a-e980-446d-a66d-68207ad74d53', po.po_id, 'a7df15a9-a99e-442d-9020-0ec2ac0a9df8', 17280, 0.112000, 71.680000, 1238630.40, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK640-2602' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '1520c361-ef99-4b7e-810c-1e3e0ab82993', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 17280, 0.110000, 69.850000, 1207008.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2602' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'eddb66c3-dca4-4c42-9a3b-e1917e2e6f04', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 17000, 0.110000, 69.850000, 1187450.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635-2602' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '7ca0e618-6d20-4744-bbd7-b11064f49cfc', po.po_id, 'a7df15a9-a99e-442d-9020-0ec2ac0a9df8', 16704, 0.112000, 71.680000, 1197342.72, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK640-2602' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'bc86a411-6360-4871-bf1e-26c474eaa499', po.po_id, '4f5b41e3-aa8a-4cc3-a04a-75b0990a82b9', 9216, 0.110000, 69.850000, 643737.60, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635S1-2603' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'f0f4b5cb-2851-4d37-a2fa-8f86bd7f51d6', po.po_id, '4f5b41e3-aa8a-4cc3-a04a-75b0990a82b9', 9485, 0.110000, 69.850000, 662527.25, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635S1-2603' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'a13eb77c-787c-466c-a340-7a12e6e48a42', po.po_id, '4f5b41e3-aa8a-4cc3-a04a-75b0990a82b9', 13824, 0.110000, 69.850000, 965606.40, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635S1-2603' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '4f367295-4afb-4eae-91cb-e48863b899d4', po.po_id, '4f5b41e3-aa8a-4cc3-a04a-75b0990a82b9', 14519, 0.110000, 69.850000, 1014152.15, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635S1-2603' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '3abce4c7-adb0-41a6-8f2b-59a9921ad672', po.po_id, '4f5b41e3-aa8a-4cc3-a04a-75b0990a82b9', 15552, 0.110000, 69.850000, 1086307.20, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635S1-2603' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'b1998ca3-556b-4383-9755-7333dedc1efa', po.po_id, '4f5b41e3-aa8a-4cc3-a04a-75b0990a82b9', 10368, 0.110000, 69.850000, 724204.80, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635S1-2603' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '7b527e1e-67fb-4308-b700-141b967d69d0', po.po_id, '4f5b41e3-aa8a-4cc3-a04a-75b0990a82b9', 17280, 0.110000, 69.850000, 1207008.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-JK635S1-2603' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '4fdd39b6-977d-42a4-ae32-da96eda12b14', po.po_id, '70e49056-ba4b-437b-9341-edcd6dd52ef4', 21384, 0.096000, 69.120000, 1478062.08, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-TRTR720-2602' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '2f149865-41dd-4a0d-b307-0cd8f9f1b8ba', po.po_id, '70e49056-ba4b-437b-9341-edcd6dd52ef4', 20295, 0.096000, 69.120000, 1402790.40, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-TRTR720-2602' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'aa2379d0-b05a-45cf-9240-b93716664645', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 6342, 0.080000, 50.800000, 507360.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-JK635-2507' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'd76c14fc-9ba8-4f05-9f45-e7519599230f', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 17280, 0.080000, 50.800000, 1382400.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-JK635-2507' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'd5110325-4f40-47af-9e1b-392cebc08898', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 11520, 0.080000, 50.800000, 921600.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-JK635-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '9876cb34-b837-449f-852b-559111a49654', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 9252, 0.080000, 50.800000, 740160.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-JK635-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'a8379c3a-950f-4e3d-b19e-5a50a342bc11', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 10332, 0.080000, 50.800000, 524865.60, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-JK635-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '4c9d7ba3-64b2-4708-9433-5307ae740cf3', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 11520, 0.080000, 50.800000, 585216.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-JK635-2509' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '4e40c2ee-5044-479e-aa92-0ed3953cb729', po.po_id, 'f33b0c38-9585-4a93-b2be-4bf988149727', 1588, 0.096000, 61.920000, 98729.28, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'HW-LR645M-2510' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'e8062eb8-cf5c-4353-bab0-c54a0e8b1085', po.po_id, 'b99745e0-0a73-4ac2-9fb8-903884fbf47f', 14085, 0.096000, 62.400000, 881064.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'HW-LR645M-2510' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '4f429d4d-6fa2-42f6-a241-b1688e08fc9e', po.po_id, '1e7eae33-26ef-4a50-8d35-4e789c89ffe0', 1440, 0.089500, 55.042500, 79261.20, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-DOMESTIC' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'b18f5272-b8ad-4590-b950-fa6500a95c59', po.po_id, '1e7eae33-26ef-4a50-8d35-4e789c89ffe0', 12240, 0.089500, 55.042500, 673720.20, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-DOMESTIC' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '68c93362-7933-4f37-be1e-260382223825', po.po_id, '1e7eae33-26ef-4a50-8d35-4e789c89ffe0', 7920, 0.089500, 55.042500, 435936.60, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-DOMESTIC' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '3f327d8c-a53d-484b-8afc-6f35030dea06', po.po_id, '1e7eae33-26ef-4a50-8d35-4e789c89ffe0', 25178, 0.089500, 55.042500, 1385860.07, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-LR615Ma-2511' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'e047ec08-5297-4928-a38e-d62013cc54b6', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 5760, 0.080000, 50.800000, 292608.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-JK635-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'b3850c81-5334-4022-aa88-b4b30bbe0947', po.po_id, 'f33b0c38-9585-4a93-b2be-4bf988149727', 1584, 0.099000, 63.855000, 101101.84, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-LR645M-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'b5355d7f-bfd8-43e8-888f-31d7a67a7cd1', po.po_id, 'b99745e0-0a73-4ac2-9fb8-903884fbf47f', 13536, 0.099000, 64.350000, 871088.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-LR645M-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '36194696-c168-4c59-8838-4f90c8225ca9', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 10902, 0.080000, 50.800000, 553821.60, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-JK635-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '46997053-016f-4351-88b3-68e0de8972db', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 11520, 0.080000, 50.800000, 921600.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-JK635-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '8b7bc9cb-f06e-4ad4-817a-1d28dadd61f4', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 21326, 0.089700, 56.959500, 1912962.42, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'HW-JK635-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'f744ce58-a0ea-41cd-8432-6583871d1113', po.po_id, 'b99745e0-0a73-4ac2-9fb8-903884fbf47f', 3528, 0.099000, 64.350000, 227026.80, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-LR645M-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'd7d49783-b120-4a3e-8430-7570739eeec6', po.po_id, 'd4f48cc8-27e0-4da9-9668-1982dad89a3a', 60, 0.099000, 64.845000, 3890.70, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-LR645M-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'c2990f90-9136-42c7-9344-448dcc4ec1d6', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 17280, 0.089700, 56.959500, 984260.16, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'HW-JK635-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '3b5407a9-d49b-44f4-9d8c-ef4dc114e507', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 7114, 0.089700, 56.959500, 405209.88, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'HW-JK635-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '34bfcd94-46ec-45b8-96ba-3f807b6a3a9e', po.po_id, '27526838-96b9-46d9-b02d-1f2bcb5091c8', 17280, 0.089700, 56.959500, 985521.60, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'HW-JK635-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'eb171b2a-7919-46b9-9c35-07d719d3afe7', po.po_id, 'b99745e0-0a73-4ac2-9fb8-903884fbf47f', 3323, 0.099000, 64.350000, 213835.05, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-LR645M-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'adcd84e9-213f-4c3a-a2aa-c21176846eb7', po.po_id, 'd4f48cc8-27e0-4da9-9668-1982dad89a3a', 8737, 0.099000, 64.845000, 566550.77, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-LR645M-2512' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '0efc90b1-dae0-49d2-a94a-f6a55c918f4e', po.po_id, '1e7eae33-26ef-4a50-8d35-4e789c89ffe0', 18000, 0.116500, 71.647500, 1289655.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-LR615Ma-2603' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '521fd4bb-ca03-414d-964c-c965e83ec025', po.po_id, '1e7eae33-26ef-4a50-8d35-4e789c89ffe0', 18000, 0.116500, 71.647500, 1289655.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'DW-LR615Ma-2603' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '5936ad9f-a113-4459-a4bc-af7167fbd473', po.po_id, 'b99745e0-0a73-4ac2-9fb8-903884fbf47f', 10800, 0.117000, 76.050000, 821340.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR650M-2604' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'cdf1c40a-996e-46a6-a189-1d7b4aa554c8', po.po_id, 'b6dd9f08-ce49-4d3e-a02a-6c7a2660c9a8', 10800, 0.117000, 76.635000, 827658.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR655M-2604' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '9e0b387d-27f5-4a23-8d42-fc43c3971886', po.po_id, 'b99745e0-0a73-4ac2-9fb8-903884fbf47f', 14075, 0.117000, 76.050000, 1070404.00, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR650M-2604' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT 'c8353367-4fb8-4278-9197-565f507bad6e', po.po_id, 'b99745e0-0a73-4ac2-9fb8-903884fbf47f', 510, 0.117000, 76.050000, 38785.50, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR650M-2604' LIMIT 1;
INSERT INTO po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd_wp, unit_price_usd, total_amount_usd, memo)
SELECT '58cf34f3-38e4-4316-825f-5caf7271f212', po.po_id, 'b6dd9f08-ce49-4d3e-a02a-6c7a2660c9a8', 9901, 0.117000, 76.635000, 751865.99, 'M120 백필 — DB-3 row→line'
FROM purchase_orders po WHERE po.po_number = 'TOP-LR655M-2604' LIMIT 1;

INSERT INTO schema_migrations(filename) VALUES ('120_backfill_po_line_items.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
