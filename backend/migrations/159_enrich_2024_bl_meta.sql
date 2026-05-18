-- M159: 24년 BL 메타데이터 enrichment — raw 수입진행상황 2024 시트 기반
-- @auto-apply: yes
--
-- raw 24년 BL 의 ETD/ETA/통관일자/포워더 정보를, DB 의 같은 bl_number 행에
-- UPDATE. 보존 정책: DB 컬럼이 NULL 일 때만 raw 값으로 채움. 둘 다 값 있고
-- 다른 경우는 skip (충돌 로그는 빌더 출력 + m159_diff_report.txt 참조).
--
-- 추출: raw 24년 distinct BL 74개 / DB 매칭 61개
-- 변경: UPDATE 48 BL, 충돌 38 필드, 변경 없음 13 BL

BEGIN;

-- 멱등성: 같은 마이그 재적용 시 UPDATE 가 noop (이미 값 채워짐)

UPDATE bl_shipments SET etd = COALESCE(etd, '2024-02-02'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'NPSELHT245133' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-02-10'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'NPSELHT242755' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-02-10'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'NPSELHT242756' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-05-22'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'NPSELHT245468' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-08-07'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'NPSELHT245797' AND (actual_arrival IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-09-02'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'NPSELHT246019' AND (actual_arrival IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-09-06'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'NPSELHT244030' AND (actual_arrival IS NULL);
UPDATE bl_shipments SET eta = COALESCE(eta, '2024-09-16'), actual_arrival = COALESCE(actual_arrival, '2024-09-19'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'NPSELHT244139' AND (eta IS NULL OR actual_arrival IS NULL);
UPDATE bl_shipments SET eta = COALESCE(eta, '2024-09-16'), actual_arrival = COALESCE(actual_arrival, '2024-09-19'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'NPSELHT244080' AND (eta IS NULL OR actual_arrival IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-10-17'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'NPSELHT244269' AND (actual_arrival IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-10-29'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'NPSELHT244299' AND (actual_arrival IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-12-04'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'NPSELHT244601' AND (actual_arrival IS NULL);
UPDATE bl_shipments SET eta = COALESCE(eta, '2025-04-19'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'SHACZA82185' AND (eta IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '1900-01-01'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24020155' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-03-14'), actual_arrival = COALESCE(actual_arrival, '2024-03-14'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24030083' AND (etd IS NULL OR actual_arrival IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-03-12'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24030082' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24040006' AND (forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-05-25'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'EASHO2421NK232' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-09-30'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24090078' AND (actual_arrival IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-09-30'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = '1061993019' AND (actual_arrival IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-09-29'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = '1061994729' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-10-25'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'EASEK2442NB233' AND (actual_arrival IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-10-29'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24100047' AND (actual_arrival IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-10-29'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24100046' AND (actual_arrival IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-11-11'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24110001' AND (actual_arrival IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-11-11'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24110002' AND (actual_arrival IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-11-11'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24110003' AND (actual_arrival IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-11-25'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24110019' AND (actual_arrival IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-11-25'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24110020' AND (actual_arrival IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-11-25'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24110022' AND (actual_arrival IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-11-25'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24110023' AND (actual_arrival IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-11-19'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24110024' AND (actual_arrival IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-11-19'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24110025' AND (actual_arrival IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-11-27'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24110084' AND (actual_arrival IS NULL);
UPDATE bl_shipments SET eta = COALESCE(eta, '2024-12-18'), actual_arrival = COALESCE(actual_arrival, '2024-12-24'), forwarder = COALESCE(forwarder, '2024-12-26'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24120043' AND (eta IS NULL OR actual_arrival IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET eta = COALESCE(eta, '2024-12-18'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24120044' AND (eta IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-08-13'), forwarder = COALESCE(forwarder, '씨앤아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'EASEK2431NK232' AND (actual_arrival IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-08-27'), forwarder = COALESCE(forwarder, '씨앤아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24080102' AND (actual_arrival IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET actual_arrival = COALESCE(actual_arrival, '2024-09-24'), forwarder = COALESCE(forwarder, '씨앤아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24090056' AND (actual_arrival IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET eta = COALESCE(eta, '2024-10-10'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'EASEK2439NB232' AND (eta IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET eta = COALESCE(eta, '2024-11-18'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'JWSH24110045' AND (eta IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-02-25'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'ZHC2402012' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-03-04'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'ZHC2402013' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-03-26'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'ZHC2403011' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-04-17'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'ZHC2404001' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-04-30'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'ZHC2404043' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-03-24'), forwarder = COALESCE(forwarder, '씨앤 아이'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'OE00XH240305344' AND (etd IS NULL OR forwarder IS NULL);
UPDATE bl_shipments SET etd = COALESCE(etd, '2024-08-02'), memo = COALESCE(memo, '') || ' [M159: raw 24년 enrich]'
  WHERE bl_number = 'OE00XH240705288' AND (etd IS NULL);

-- 검증: M159 표시된 BL 행
-- SELECT bl_number, etd, eta, actual_arrival, forwarder, memo
--   FROM bl_shipments WHERE memo LIKE '%M159%';

COMMIT;