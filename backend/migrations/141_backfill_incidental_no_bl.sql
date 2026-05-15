-- M135: incidental_expenses 잔여 분개 백필 — BL 매칭 불가 케이스
-- 소스: 2025년 운송료/2025년, 2026년 모듈 부대비용, 운송료 내역.xlsx 6 시트
-- A. BL 적요 추출 불가 (33건) → bl_id=NULL, month+vendor 단위 적재
-- B. BL 추출됐으나 DB 에 BL 없음 (7건) → bl_id=NULL, BL 정보는 memo 보존
-- incidental_expenses CHECK: (bl_id | outbound_id | month) 중 하나 필수 → month 만 채움
-- B 의 7건은 향후 면장 백필 시 bl_id 재매칭 필요 (memo 에 원본 BL 남김)

BEGIN;

-- A. BL 없는 33건 (month + vendor 단위 집계)
INSERT INTO incidental_expenses
  (bl_id, month, company_id, expense_type, amount, vat, total, vendor, memo)
VALUES
  (NULL, '2025-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 59829104::numeric, NULL::numeric, 59829104::numeric, '(주)블루오션에어', 'M135-A: BL 추출 불가 분개 집계 (4건, 월총합)'),
  (NULL, '2025-04', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 60093620::numeric, NULL::numeric, 60093620::numeric, '(주)블루오션에어', 'M135-A: BL 추출 불가 분개 집계 (7건, 월총합)'),
  (NULL, '2025-05', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 7685590::numeric, NULL::numeric, 7685590::numeric, '선진로지스틱스(주) 광주지점', 'M135-A: BL 추출 불가 분개 집계 (1건, 월총합)'),
  (NULL, '2025-06', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 88013174::numeric, NULL::numeric, 88013174::numeric, '(주)블루오션에어', 'M135-A: BL 추출 불가 분개 집계 (6건, 월총합)'),
  (NULL, '2025-08', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 6721000::numeric, NULL::numeric, 6721000::numeric, '스마일로지스', 'M135-A: BL 추출 불가 분개 집계 (1건, 월총합)'),
  (NULL, '2025-09', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 11143000::numeric, NULL::numeric, 11143000::numeric, '스마일로지스', 'M135-A: BL 추출 불가 분개 집계 (1건, 월총합)'),
  (NULL, '2025-10', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 29766000::numeric, NULL::numeric, 29766000::numeric, '스마일로지스', 'M135-A: BL 추출 불가 분개 집계 (2건, 월총합)'),
  (NULL, '2025-11', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 21208000::numeric, NULL::numeric, 21208000::numeric, '스마일로지스', 'M135-A: BL 추출 불가 분개 집계 (1건, 월총합)'),
  (NULL, '2025-12', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 11506000::numeric, NULL::numeric, 11506000::numeric, '스마일로지스', 'M135-A: BL 추출 불가 분개 집계 (1건, 월총합)'),
  (NULL, '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 10461000::numeric, NULL::numeric, 10461000::numeric, '스마일로지스', 'M135-A: BL 추출 불가 분개 집계 (1건, 월총합)'),
  (NULL, '2026-02', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 15114000::numeric, NULL::numeric, 15114000::numeric, '스마일로지스', 'M135-A: BL 추출 불가 분개 집계 (1건, 월총합)'),
  (NULL, '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 59084140::numeric, NULL::numeric, 59084140::numeric, '(주)블루오션에어', 'M135-A: BL 추출 불가 분개 집계 (4건, 월총합)'),
  (NULL, '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 6735680::numeric, NULL::numeric, 6735680::numeric, '선진로지스틱스(주) 광주지점', 'M135-A: BL 추출 불가 분개 집계 (2건, 월총합)'),
  (NULL, '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 26961000::numeric, NULL::numeric, 26961000::numeric, '스마일로지스', 'M135-A: BL 추출 불가 분개 집계 (1건, 월총합)')
;

-- B. BL 추출됐으나 DB 면장 미백필 (7건)
-- bl_id=NULL 로 적재 + memo 에 원본 BL 보존 → 향후 면장 백필 후 재매칭 가능
INSERT INTO incidental_expenses
  (bl_id, month, company_id, expense_type, amount, vat, total, vendor, memo)
VALUES
  (NULL, '2025-07', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 29700::numeric, NULL::numeric, 29700::numeric, '선진로지스틱스(주) 광주지점', 'M135-B: BL=WXAE25070807 (DB 미백필); B/L: WXAE25070807 샘플수입 통관수수료'),
  (NULL, '2025-07', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 29700::numeric, NULL::numeric, 29700::numeric, '선진로지스틱스(주) 광주지점', 'M135-B: BL=WXAE25070807 (DB 미백필); B/L: WXAE25070807 샘플수입 통관수수료 (07.13)'),
  (NULL, '2025-10', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 31880640::numeric, NULL::numeric, 31880640::numeric, '선진로지스틱스(주) 광주지점', 'M135-B: BL=JWSH25080055 (DB 미백필); B/L : JWSH25080055 CFS 및 SHUTTLE'),
  (NULL, '2025-10', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 7165931::numeric, NULL::numeric, 7165931::numeric, '선진로지스틱스(주) 광주지점', 'M135-B: BL=JWSH25080055 (DB 미백필); B/L : JWSH25080055 HANDLILNG CHAGE'),
  (NULL, '2025-11', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 24964500::numeric, NULL::numeric, 24964500::numeric, '선진로지스틱스(주) 광주지점', 'M135-B: BL=SHKO03K250900478 (DB 미백필); B/L : SHKO03K250900478 CFS 및 SHUTTLE'),
  (NULL, '2025-11', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 6061696::numeric, NULL::numeric, 6061696::numeric, '선진로지스틱스(주) 광주지점', 'M135-B: BL=SHKO03K250900478 (DB 미백필); B/L : SHKO03K250900478 HANDLILNG CHAGE'),
  (NULL, '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 18180935::numeric, NULL::numeric, 18180935::numeric, '(주)블루오션에어', 'M135-B: BL=EASEK25475K0001 (DB 미백필); B/L : EASEK25475K0001 CONTAINER CLEAN FEE')
;

-- 검증
SELECT 'M135-A' AS part, expense_type, vendor, COUNT(*), ROUND(SUM(amount)::numeric, 0) AS total
FROM incidental_expenses
WHERE memo LIKE 'M135-A:%'
GROUP BY 2, 3
UNION ALL
SELECT 'M135-B', expense_type, vendor, COUNT(*), ROUND(SUM(amount)::numeric, 0)
FROM incidental_expenses
WHERE memo LIKE 'M135-B:%'
GROUP BY 2, 3
ORDER BY 1, 2;
-- expected A: 14 aggregated rows (33 분개 → 14행), ₩414,321,308
-- expected B: 7 rows, ₩88,313,102

INSERT INTO schema_migrations(filename) VALUES ('141_backfill_incidental_no_bl.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
