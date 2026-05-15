-- M134: incidental_expenses 신규 행 백필 — D 회계 전표 분개 단위 적재
-- 소스: 2025년 운송료/2025년, 2026년 모듈 부대비용, 운송료 내역.xlsx 6 시트
-- 한 분개 = 한 incidental_expenses 행. BL 추출 가능한 분개만 적재 (102/135)
-- BL 없는 33건은 month + vendor 단위 별도 백필 (M135 후보)
-- 회사: 전부 탑솔라(주) (회계단위명 = "탑솔라(주)")

BEGIN;

-- Staging via VALUES — 102 rows
INSERT INTO incidental_expenses
  (bl_id, month, company_id, expense_type, amount, vat, total, vendor, memo)
SELECT b.bl_id, x.month, x.company_id, x.expense_type, x.amount, NULL::numeric, x.amount, x.vendor, x.memo
FROM (VALUES
  ('SHACYR14644', '2025-04', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 220000::numeric, '선진로지스틱스(주) 광주지점', 'SHACYR14644(LR7-72HGD-615M * 8,781EA, $483,024.08) 통관수수료'),
  ('SHACYV52616', '2025-05', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 25883000::numeric, '선진로지스틱스(주) 광주지점', 'CFS 및 SHUTTLE (B/L : SHACYV52616)'),
  ('SHKWA25010062', '2025-07', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 33638000::numeric, '선진로지스틱스(주) 광주지점', 'SHKWA25010062(JKM635N-78HL4*16,128EA, $819,302.4) 셔틀비용 외'),
  ('SHKWA25010062', '2025-07', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 7708096::numeric, '선진로지스틱스(주) 광주지점', 'SHKWA25010062(JKM635N-78HL4*16,128EA, $819,302.4) 현장 운송료 외'),
  ('SHKWA25011758', '2025-07', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 34738000::numeric, '선진로지스틱스(주) 광주지점', 'SHKWA25011758(JKM635N-78HL4*16,128EA, $819,302.4) 셔틀 외'),
  ('SHKWA25011758', '2025-07', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 7704784::numeric, '선진로지스틱스(주) 광주지점', 'SHKWA25011758(JKM635N-78HL4*16,128EA, $819,302.4) 현장운송료 외'),
  ('SHPUS25011179', '2025-07', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 67202960::numeric, '선진로지스틱스(주) 광주지점', 'SHPUS25011179(JKM635N-78HL4 * 17,280EA, $877,824) 셔틀 외'),
  ('SHPUS25011179', '2025-07', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 8420960::numeric, '선진로지스틱스(주) 광주지점', 'SHPUS25011179(JKM635N-78HL4 * 17,280EA, $877,824) 현장운송료 외'),
  ('JWSH25070013', '2025-07', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 32384000::numeric, '선진로지스틱스(주) 광주지점', 'JWSH25070013(JKM635N-78HL4 * 14,400EA, $731,520) 셔틀 외'),
  ('JWSH25070013', '2025-07', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 6839284::numeric, '선진로지스틱스(주) 광주지점', 'JWSH25070013(JKM635N-78HL4 * 14,400EA, $731,520) 현장운송료 외'),
  ('JWSH25070022', '2025-08', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 47432000::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25070022 현장운송료'),
  ('JWSH25070021', '2025-08', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 9944000::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25070021 현장운송료'),
  ('JWSH25070022', '2025-08', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 9741470::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25070022 현장운송료'),
  ('JWSH25070021', '2025-08', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'transport', 2365056::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25070021 현장운송료'),
  ('JWSH25070025', '2025-09', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 39798000::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25070025 CFS 및 SHUTTLE'),
  ('SHPUS25014257', '2025-09', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 34551000::numeric, '선진로지스틱스(주) 광주지점', 'B/L : SHPUS25014257 CFS 및 SHUTTLE'),
  ('SHPUS25014257', '2025-09', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 8433412::numeric, '선진로지스틱스(주) 광주지점', 'B/L : SHPUS25014257 HANDLILNG CHAGE'),
  ('JWSH25070025', '2025-09', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 8225890::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25070025 HANDLILNG CHAGE'),
  ('JWSH25070026', '2025-09', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 37369200::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25070026 CFS 및 SHUTTLE'),
  ('JWSH25080026', '2025-09', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 28755650::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25080026 CFS 및 SHUTTLE'),
  ('JWSH25070026', '2025-09', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 6099807::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25070026 HANDLILNG CHAGE'),
  ('JWSH25080026', '2025-09', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 5261547::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25080026 HANDLILNG CHAGE'),
  ('JWSH25090054', '2025-10', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 18000400::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25090054 CFS 및 SHUTTLE'),
  ('JWSH25090054', '2025-10', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 4240855::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25090054 HANDLILNG CHAGE'),
  ('JWSH25080028', '2025-10', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 49937800::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25080028 CFS 및 SHUTTLE'),
  ('JWSH25080025', '2025-10', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 33360800::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25080025 CFS 및 SHUTTLE'),
  ('JWSH25080028', '2025-10', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 8423826::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25080028 HANDLILNG CHAGE'),
  ('JWSH25080025', '2025-10', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 5568245::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25080025 HANDLILNG CHAGE'),
  ('SHKWA25019765', '2025-11', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 31058500::numeric, '선진로지스틱스(주) 광주지점', 'B/L : SHKWA25019765 CFS 및 SHUTTLE'),
  ('JWSH25090057', '2025-11', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 23459700::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25090057 CFS 및 SHUTTLE'),
  ('SHKWA25019765', '2025-11', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 6325112::numeric, '선진로지스틱스(주) 광주지점', 'B/L : SHKWA25019765 HANDLILNG CHAGE'),
  ('JWSH25090057', '2025-11', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 5836351::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25090057 HANDLILNG CHAGE'),
  ('HDMUSHAA28081200', '2025-05', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 30327000::numeric, '(주)블루오션에어', 'CUSTOMS CLEARANCE FEE(HDMUSHAA28081200)'),
  ('SNKO03K250302336', '2025-05', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 20229000::numeric, '(주)블루오션에어', 'CUSTOMS CLEARANCE FEE(SNKO03K250302336)'),
  ('SNKO03K250302826', '2025-05', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 15422000::numeric, '(주)블루오션에어', 'CUSTOMS CLEARANCE FEE (B/L : SNKO03K250302826)'),
  ('HDMUSHAA28081200', '2025-05', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 7930060::numeric, '(주)블루오션에어', 'CONTAINER CLEAN FEE(HDMUSHAA28081200)'),
  ('SNKO03K250302336', '2025-05', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 5249720::numeric, '(주)블루오션에어', 'CONTAINER CLEAN FEE(SNKO03K250302336)'),
  ('SNKO03K250302826', '2025-05', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 2645020::numeric, '(주)블루오션에어', 'CONTAINER CLEAN FEE (SNKO03K250302826)'),
  ('HDMUSHAA28081200', '2025-05', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 87420::numeric, '(주)블루오션에어', 'HDMUSHAA28081200 대납건'),
  ('SNKO03K250302336', '2025-05', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 58280::numeric, '(주)블루오션에어', 'SNKO03K250302336 대납건'),
  ('SNKO03K250302826', '2025-05', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 29140::numeric, '(주)블루오션에어', 'SNKO03K250302826 대납건'),
  ('SNKO03K250302342', '2025-06', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 58280::numeric, '(주)블루오션에어', '징코모듈 수입 18.1MW CIF 비용 및 현장 운송료 지출의 건(B/L :SNKO03K250302342)'),
  ('SHKWA25009166', '2025-06', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 43710::numeric, '(주)블루오션에어', '대납 SHKWA25009166'),
  ('SNKO03K250302344', '2025-06', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 43710::numeric, '(주)블루오션에어', '대납 SNKO03K250302344'),
  ('JWSH25070012', '2025-09', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 37405714::numeric, '(주)블루오션에어', 'B/L : JWSH25070012 CUSTOMS CLEARANCE FEE'),
  ('JWSH25070012', '2025-09', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 6552550::numeric, '(주)블루오션에어', 'B/L : JWSH25070012 CONTAINER CLEAN FEE'),
  ('JWSH25070012', '2025-09', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 72850::numeric, '(주)블루오션에어', 'B/L : JWSH25070012 CONTAINER CLEAN FEE 대납분'),
  ('SHKWA25019107', '2025-10', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 43710::numeric, '(주)블루오션에어', 'B/L : SHKWA25019107 부두발생비용'),
  ('SHKWA25019107', '2025-10', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 22431640::numeric, '(주)블루오션에어', 'B/L : SHKWA25019107 CUSTOMS CLEARANCE FEE'),
  ('SHKWA25019107', '2025-10', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 4031974::numeric, '(주)블루오션에어', 'B/L : SHKWA25019107 CONTAINER CLEAN FEE'),
  ('SHADCM82253', '2025-12', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 11300135::numeric, '(주)블루오션에어', 'B/L : SHADCM82253 CUSTOMS CLEARANCE FEE'),
  ('SHADCM82253', '2025-12', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 1620496::numeric, '(주)블루오션에어', 'B/L : SHADCM82253 CONTAINER CLEAN FEE'),
  ('SHKWA25019106', '2025-12', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 45007820::numeric, '(주)블루오션에어', 'B/L : SHKWA25019106 CUSTOMS CLEARANCE FEE'),
  ('SHKWA25019109', '2025-12', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 26002803::numeric, '(주)블루오션에어', 'B/L : SHKWA25019109 CUSTOMS CLEARANCE FEE'),
  ('SHKWA25019106', '2025-12', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 6897496::numeric, '(주)블루오션에어', 'B/L : SHKWA25019106 CONTAINER CLEAN FEE'),
  ('SHKWA25019109', '2025-12', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 4031974::numeric, '(주)블루오션에어', 'B/L : SHKWA25019109 CONTAINER CLEAN FEE'),
  ('SHKWA25019106', '2025-12', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 75764::numeric, '(주)블루오션에어', 'B/L : SHKWA25019106 항만 대납비용(SHKWA25019106)'),
  ('SHKWA25019109', '2025-12', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 43710::numeric, '(주)블루오션에어', 'B/L : SHKWA25019109 항만 대납비용(SHKWA25019109)'),
  ('SNKO03K251003063', '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 67266650::numeric, '선진로지스틱스(주) 광주지점', 'B/L : SNKO03K251003063 CFS 및 SHUTTLE'),
  ('SNKO03K251003063', '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 14675810::numeric, '선진로지스틱스(주) 광주지점', 'B/L : SNKO03K251003063 HANDLILNG CHAGE'),
  ('DJSCNGB250024687', '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 30306650::numeric, '선진로지스틱스(주) 광주지점', 'B/L : DJSCNGB250024687 CFS 및 SHUTTLE'),
  ('DJSCNGB250024687', '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 6248358::numeric, '선진로지스틱스(주) 광주지점', 'B/L : DJSCNGB250024687 HANDLILNG CHAGE'),
  ('JWSH25120034', '2026-02', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 50939350::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25120034 CFS 및 SHUTTLE'),
  ('JWSH25120034', '2026-02', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 9305139::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25120034 CFS 및 SHUTTLE HANDLILNG CHAGE'),
  ('JWSH25120029', '2026-02', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 32714000::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25120029 CFS 및 SHUTTLE'),
  ('JWSH25120029', '2026-02', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 7685476::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25120029 CFS 및 SHUTTLE'),
  ('JWSH25120016', '2026-02', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 14323100::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25120016 CFS 및 SHUTTLE'),
  ('JWSH25120016', '2026-02', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 2391323::numeric, '선진로지스틱스(주) 광주지점', 'B/L : JWSH25120016 CFS 및 SHUTTLE HANDLILNG CHAGE'),
  ('SELYIT256012', '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 54035850::numeric, '선진로지스틱스(주) 광주지점', 'B/L : SELYIT256012 CFS 및 SHUTTLE'),
  ('SELYIT256013', '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 36614600::numeric, '선진로지스틱스(주) 광주지점', 'B/L : SELYIT256013 CFS 및 SHUTTLE'),
  ('SELYIT256012', '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 8438070::numeric, '선진로지스틱스(주) 광주지점', 'B/L : SELYIT256012 HANDLILNG CHAGE'),
  ('SELYIT256013', '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'storage', 5797447::numeric, '선진로지스틱스(주) 광주지점', 'B/L : SELYIT256013 HANDLILNG CHAGE'),
  ('EASED2539LK006', '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 46002880::numeric, '(주)블루오션에어', 'B/L : EASED2539LK006 CUSTOMS CLEARANCE FEE'),
  ('EASED2539LK006', '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 23940016::numeric, '(주)블루오션에어', 'B/L : EASED2539LK006 CONTAINER CLEAN FEE'),
  ('EASED2539LK006', '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 69936::numeric, '(주)블루오션에어', 'B/L : EASED2539LK006 WFG,PSF EASED2539LK006'),
  ('SNLFZGKL005117', '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 18252472::numeric, '(주)블루오션에어', 'B/L : SNLFZGKL005117 CONTAINER CLEAN FEE'),
  ('SNLFZGKL005117', '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 38338080::numeric, '(주)블루오션에어', 'B/L : SNLFZGKL005117 CUSTOMS CLEARANCE FEE'),
  ('SHADDP34512', '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 34776390::numeric, '(주)블루오션에어', 'B/L : SHADDP34512 CUSTOMS CLEARANCE FEE'),
  ('HGHDCS02961', '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 12120735::numeric, '(주)블루오션에어', 'B/L : HGHDCS02961 CUSTOMS CLEARANCE FEE'),
  ('SHADDP34512', '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 2937576::numeric, '(주)블루오션에어', 'B/L : SHADDP34512 CONTAINER CLEAN FEE'),
  ('HGHDCS02961', '2026-01', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 1372080::numeric, '(주)블루오션에어', 'B/L : HGHDCS02961 CONTAINER CLEAN FEE'),
  ('SNKO02N250500536', '2026-02', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 28470200::numeric, '(주)블루오션에어', 'B/L : SNKO02N250500536 CUSTOMS CLEARANCE FEE'),
  ('SNKO02N250500536', '2026-02', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 3426526::numeric, '(주)블루오션에어', 'B/L : SNKO02N250500536 CONTAINER CLEAN FEE'),
  ('SNKO02N250500536', '2026-02', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 37882::numeric, '(주)블루오션에어', 'B/L : SNKO02N250500536 WFG외'),
  ('EASEK2547SK0001', '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 37251720::numeric, '(주)블루오션에어', 'B/L : EASEK2547SK0001 CUSTOMS CLEARANCE FEE'),
  ('EASEK2547SK0001', '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 50995::numeric, '(주)블루오션에어', 'B/L : EASEK2547SK0001 선납비용'),
  ('EASED2550LK056', '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 21037720::numeric, '(주)블루오션에어', 'B/L:EASED2550LK056 CUSTOMS CLEARANCE FEE'),
  ('EASED2550LK056', '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 12473608::numeric, '(주)블루오션에어', 'B/L:EASED2550LK056 CONTAINER CLEAN FEE'),
  ('EASED2550LK056', '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 34968::numeric, '(주)블루오션에어', 'EASED2550LK056 선납비용'),
  ('EASPH2539SK6006', '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 25901040::numeric, '(주)블루오션에어', 'B/L:EASPH2539SK6006 CUSTOMS CLEARANCE FEE'),
  ('EASPH2539SK6006', '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 11990008::numeric, '(주)블루오션에어', 'B/L:EASPH2539SK6006 CONTAINER CLEAN FEE'),
  ('EASPH2539SK6006', '2026-03', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 34968::numeric, '(주)블루오션에어', 'EASPH2539SK6006 선납비용'),
  ('EASPR2542LK016', '2026-04', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 72358000::numeric, '(주)블루오션에어', 'B/L : EASPR2542LK016 CUSTOMS CLEARANCE FEE'),
  ('EASPR2542LK016', '2026-04', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 36243832::numeric, '(주)블루오션에어', 'B/L : EASPR2542LK016 CONTAINER CLEAN FEE'),
  ('EASPR2542LK016', '2026-04', UUID '99f0fc15-0555-4a41-a025-8bf3630a7947', 'customs_fee', 104904::numeric, '(주)블루오션에어', 'B/L : EASPR2542LK016 WFG외')
) AS x(bl, month, company_id, expense_type, amount, vendor, memo)
JOIN bl_shipments b ON b.bl_number = x.bl
-- 중복 방지: 같은 (bl, month, vendor, amount) 가 이미 있으면 skip
WHERE NOT EXISTS (
  SELECT 1 FROM incidental_expenses e
  WHERE e.bl_id = b.bl_id
    AND e.month = x.month
    AND e.vendor = x.vendor
    AND e.amount = x.amount
);

-- 검증
SELECT expense_type, vendor, COUNT(*), ROUND(SUM(amount)::numeric, 0) AS total
FROM incidental_expenses
WHERE memo LIKE 'M134:%' OR vendor IN ('(주)블루오션에어', '선진로지스틱스(주) 광주지점', '스마일로지스')
GROUP BY 1, 2 ORDER BY 1, 2;
-- expected: 95 rows total, ~1,664,538,040원

INSERT INTO schema_migrations(filename) VALUES ('140_backfill_incidental_expenses.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
