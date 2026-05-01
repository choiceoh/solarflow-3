-- 045_baro_mock_data.sql
-- BARO 테넌트 데모용 목업 데이터 (Phase 1·2·3·4 페이지가 즉시 채워지도록).
-- 실제 partner/product 시드 ID를 참조하므로 운영 데이터 위에 안전하게 올린다.
-- 운영 데이터 위라 ON CONFLICT DO NOTHING으로 idempotent.

-- ────────────────────────────────────────────────────────────────────────
-- Phase 3: partners 신용 한도 / 결제일수 (미수금 보드용)
-- ────────────────────────────────────────────────────────────────────────
UPDATE partners SET credit_limit_krw = 500000000, credit_payment_days = 60
  WHERE partner_name = 'SK솔라파워' AND credit_limit_krw IS NULL;
UPDATE partners SET credit_limit_krw = 300000000, credit_payment_days = 45
  WHERE partner_name = '대성에너지(주)' AND credit_limit_krw IS NULL;
UPDATE partners SET credit_limit_krw = 1000000000, credit_payment_days = 90
  WHERE partner_name = '지에스이엔지(주)' AND credit_limit_krw IS NULL;
UPDATE partners SET credit_limit_krw = 200000000, credit_payment_days = 30
  WHERE partner_name = '한빛태양광' AND credit_limit_krw IS NULL;
UPDATE partners SET credit_limit_krw = 800000000, credit_payment_days = 60
  WHERE partner_name = '현대건설EPC' AND credit_limit_krw IS NULL;
UPDATE partners SET credit_limit_krw = 150000000, credit_payment_days = 30
  WHERE partner_name = '탑솔라기술' AND credit_limit_krw IS NULL;

-- ────────────────────────────────────────────────────────────────────────
-- Phase 1: partner_price_book — 거래처×품번 단가
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO partner_price_book (partner_id, product_id, unit_price_wp, discount_pct, effective_from, memo)
SELECT p.partner_id, pr.product_id, 410, 0, CURRENT_DATE - INTERVAL '90 days', '분기 협상가'
  FROM partners p, products pr
 WHERE p.partner_name = 'SK솔라파워' AND pr.product_code = 'JKM580N-72HL4'
ON CONFLICT (partner_id, product_id, effective_from) DO NOTHING;

INSERT INTO partner_price_book (partner_id, product_id, unit_price_wp, discount_pct, effective_from, memo)
SELECT p.partner_id, pr.product_id, 425, 1.5, CURRENT_DATE - INTERVAL '60 days', '대량 할인'
  FROM partners p, products pr
 WHERE p.partner_name = 'SK솔라파워' AND pr.product_code = 'JAM72D40-585'
ON CONFLICT (partner_id, product_id, effective_from) DO NOTHING;

INSERT INTO partner_price_book (partner_id, product_id, unit_price_wp, discount_pct, effective_from, memo)
SELECT p.partner_id, pr.product_id, 415, 0, CURRENT_DATE - INTERVAL '30 days', NULL
  FROM partners p, products pr
 WHERE p.partner_name = '대성에너지(주)' AND pr.product_code = 'JKM580N-72HL4'
ON CONFLICT (partner_id, product_id, effective_from) DO NOTHING;

INSERT INTO partner_price_book (partner_id, product_id, unit_price_wp, discount_pct, effective_from, memo)
SELECT p.partner_id, pr.product_id, 420, 0, CURRENT_DATE - INTERVAL '45 days', '연간 거래처'
  FROM partners p, products pr
 WHERE p.partner_name = '지에스이엔지(주)' AND pr.product_code = 'TSM-595NEG19RC'
ON CONFLICT (partner_id, product_id, effective_from) DO NOTHING;

INSERT INTO partner_price_book (partner_id, product_id, unit_price_wp, discount_pct, effective_from, memo)
SELECT p.partner_id, pr.product_id, 405, 2.0, CURRENT_DATE - INTERVAL '20 days', '특가 프로모션'
  FROM partners p, products pr
 WHERE p.partner_name = '한빛태양광' AND pr.product_code = 'LR5-72HTH-580M'
ON CONFLICT (partner_id, product_id, effective_from) DO NOTHING;

INSERT INTO partner_price_book (partner_id, product_id, unit_price_wp, discount_pct, effective_from, memo)
SELECT p.partner_id, pr.product_id, 430, 0, CURRENT_DATE - INTERVAL '120 days', '대형 EPC'
  FROM partners p, products pr
 WHERE p.partner_name = '현대건설EPC' AND pr.product_code = 'JAM72D40-585'
ON CONFLICT (partner_id, product_id, effective_from) DO NOTHING;

INSERT INTO partner_price_book (partner_id, product_id, unit_price_wp, discount_pct, effective_from, memo)
SELECT p.partner_id, pr.product_id, 422, 0, CURRENT_DATE - INTERVAL '15 days', NULL
  FROM partners p, products pr
 WHERE p.partner_name = '현대건설EPC' AND pr.product_code = 'JKM635N-78HL4'
ON CONFLICT (partner_id, product_id, effective_from) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- Phase 2: intercompany_requests — 그룹내 매입 요청 (다양한 상태)
-- 상태: pending(대기) → shipped(출고) → received(입고) + 거부/취소
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO intercompany_requests
  (requester_company_id, target_company_id, product_id, quantity, desired_arrival_date, status, note, requested_by_email)
SELECT
  (SELECT company_id FROM companies WHERE company_code='BR'),
  (SELECT company_id FROM companies WHERE company_code='TS'),
  pr.product_id, 200, CURRENT_DATE + INTERVAL '7 days', 'pending',
  '분기 마감 전 도착 필요', 'baro-test@topworks.ltd'
FROM products pr WHERE pr.product_code = 'JKM580N-72HL4'
  AND NOT EXISTS (
    SELECT 1 FROM intercompany_requests
    WHERE note = '분기 마감 전 도착 필요' AND status = 'pending'
  );

INSERT INTO intercompany_requests
  (requester_company_id, target_company_id, product_id, quantity, desired_arrival_date, status, note, requested_by_email)
SELECT
  (SELECT company_id FROM companies WHERE company_code='BR'),
  (SELECT company_id FROM companies WHERE company_code='TS'),
  pr.product_id, 150, CURRENT_DATE + INTERVAL '14 days', 'pending',
  'SK솔라파워 납품용', 'baro-test@topworks.ltd'
FROM products pr WHERE pr.product_code = 'JAM72D40-585'
  AND NOT EXISTS (
    SELECT 1 FROM intercompany_requests WHERE note = 'SK솔라파워 납품용'
  );

INSERT INTO intercompany_requests
  (requester_company_id, target_company_id, product_id, quantity, desired_arrival_date, status, note, requested_by_email,
   responded_at, responded_by_email)
SELECT
  (SELECT company_id FROM companies WHERE company_code='BR'),
  (SELECT company_id FROM companies WHERE company_code='TS'),
  pr.product_id, 300, CURRENT_DATE - INTERVAL '5 days', 'shipped',
  '대성에너지(주) 현장', 'baro-test@topworks.ltd',
  NOW() - INTERVAL '3 days', 'choiceoh@topsolar.kr'
FROM products pr WHERE pr.product_code = 'TSM-595NEG19RC'
  AND NOT EXISTS (
    SELECT 1 FROM intercompany_requests WHERE note = '대성에너지(주) 현장'
  );

INSERT INTO intercompany_requests
  (requester_company_id, target_company_id, product_id, quantity, desired_arrival_date, status, note, requested_by_email,
   responded_at, responded_by_email, received_at)
SELECT
  (SELECT company_id FROM companies WHERE company_code='BR'),
  (SELECT company_id FROM companies WHERE company_code='TS'),
  pr.product_id, 100, CURRENT_DATE - INTERVAL '20 days', 'received',
  '지에스이엔지 현장 - 입고 완료', 'baro-test@topworks.ltd',
  NOW() - INTERVAL '15 days', 'choiceoh@topsolar.kr',
  NOW() - INTERVAL '10 days'
FROM products pr WHERE pr.product_code = 'LR5-72HTH-580M'
  AND NOT EXISTS (
    SELECT 1 FROM intercompany_requests WHERE note = '지에스이엔지 현장 - 입고 완료'
  );

INSERT INTO intercompany_requests
  (requester_company_id, target_company_id, product_id, quantity, desired_arrival_date, status, note, requested_by_email,
   cancelled_at)
SELECT
  (SELECT company_id FROM companies WHERE company_code='BR'),
  (SELECT company_id FROM companies WHERE company_code='TS'),
  pr.product_id, 50, CURRENT_DATE - INTERVAL '10 days', 'cancelled',
  '거래처 발주 취소로 함께 취소', 'baro-test@topworks.ltd',
  NOW() - INTERVAL '8 days'
FROM products pr WHERE pr.product_code = 'JKM635N-78HL4'
  AND NOT EXISTS (
    SELECT 1 FROM intercompany_requests WHERE note = '거래처 발주 취소로 함께 취소'
  );

-- ────────────────────────────────────────────────────────────────────────
-- Phase 4: dispatch_routes — 배차/일정 (과거·당일·미래)
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO dispatch_routes (route_date, vehicle_type, vehicle_plate, driver_name, driver_phone, status, memo)
SELECT CURRENT_DATE - INTERVAL '2 days', '5톤 카고', '12가3456', '김운송', '010-1234-5678', 'completed', '오전 9시 출발 / 인천 → 안성'
WHERE NOT EXISTS (SELECT 1 FROM dispatch_routes WHERE memo = '오전 9시 출발 / 인천 → 안성');

INSERT INTO dispatch_routes (route_date, vehicle_type, vehicle_plate, driver_name, driver_phone, status, memo)
SELECT CURRENT_DATE - INTERVAL '1 days', '8톤 윙바디', '34나5678', '박물류', '010-2345-6789', 'completed', '서울 → 평택 / 비 예보로 1시간 지연'
WHERE NOT EXISTS (SELECT 1 FROM dispatch_routes WHERE memo = '서울 → 평택 / 비 예보로 1시간 지연');

INSERT INTO dispatch_routes (route_date, vehicle_type, vehicle_plate, driver_name, driver_phone, status, memo)
SELECT CURRENT_DATE, '5톤 카고', '56다7890', '이배송', '010-3456-7890', 'dispatched', '오늘 출발 / 안성 → 광주'
WHERE NOT EXISTS (SELECT 1 FROM dispatch_routes WHERE memo = '오늘 출발 / 안성 → 광주');

INSERT INTO dispatch_routes (route_date, vehicle_type, vehicle_plate, driver_name, driver_phone, status, memo)
SELECT CURRENT_DATE + INTERVAL '1 days', '11톤 윙바디', '78라9012', '최운전', '010-4567-8901', 'planned', '대형 출고 / 평택 → 부산'
WHERE NOT EXISTS (SELECT 1 FROM dispatch_routes WHERE memo = '대형 출고 / 평택 → 부산');

INSERT INTO dispatch_routes (route_date, vehicle_type, vehicle_plate, driver_name, driver_phone, status, memo)
SELECT CURRENT_DATE + INTERVAL '3 days', '5톤 카고', '90마1234', '정기사', '010-5678-9012', 'planned', '예정 / 차량 미확정'
WHERE NOT EXISTS (SELECT 1 FROM dispatch_routes WHERE memo = '예정 / 차량 미확정');

-- ────────────────────────────────────────────────────────────────────────
-- 마지막에 PostgREST 캐시 리로드 (psql 외부에서 NOTIFY로 처리하면 더 안전하지만
-- 인덱스 변경이 없으면 굳이 필요 없음. 데이터 INSERT만으로 캐시 영향 없음.)
-- ────────────────────────────────────────────────────────────────────────
