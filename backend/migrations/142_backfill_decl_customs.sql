-- M142: import_declarations.customs_rate + customs_amount 백필 (PDF 면장 추출)
-- 소스: 면장 PDF 157개 (24년 모듈발주 zip + 평탄화 폴더 / 25년 / 26년)
-- pdfplumber 로 텍스트 추출 → 정규식으로 49세종/50세율(관 X.XX (C가가))/52세액 파싱
-- 대부분 customs_rate = 0% (한-중 FTA 무관세 적용)
-- 87개 PDF↔DB 정합 비교 중 customs_rate/amount 미백필 86건

BEGIN;

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-030403M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-030404M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-031179M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-031180M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-041538M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-042320M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-042321M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-042322M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-042326M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-051770M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-070192M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-070601M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-072242M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-080574M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-080576M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-080577M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-090654M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-091958M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-091959M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-091963M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-091965M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-092330M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-092331M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-092388M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-101285M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-101899M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-111419M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-120963M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-25-121625M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-26-021828M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-26-021829M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-26-021830M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-26-021831M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-26-030007M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-26-030792M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-26-041010M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-26-041012M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-26-041013M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43052-26-041014M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-300449M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-300501M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-300525M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-300668M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-300712M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-300742M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-300790M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-300814M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-300815M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-300871M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-300872M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-300960M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301062M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301063M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301064M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301067M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301068M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301145M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301179M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301182M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301258M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301380M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301381M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301411M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301427M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-301435M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-400584M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-400777M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-401238M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-401253M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-401254M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-25-401256M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-26-300018M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-26-300207M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-26-300233M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-26-300234M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-26-300235M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-26-300263M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-26-300264M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-26-300283M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-26-300309M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-26-300310M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-26-300311M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-26-300338M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43199-26-300386M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43635-25-700340M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

UPDATE import_declarations SET
  customs_rate = 0.0, customs_amount = 0, memo = COALESCE(NULLIF(memo,''),'') || CASE WHEN COALESCE(memo,'')='' THEN '' ELSE E'\n' END || 'M142: customs PDF 백필'
WHERE declaration_number = '43635-25-700341M'
  AND (customs_rate IS NULL OR customs_rate = 0 OR customs_amount IS NULL OR customs_amount = 0);

-- 검증
SELECT COUNT(*) AS with_customs_rate FROM import_declarations WHERE customs_rate IS NOT NULL;
SELECT COUNT(*) AS with_customs_amount FROM import_declarations WHERE customs_amount IS NOT NULL;
-- expected: 86+ with customs_rate, 86+ with customs_amount

INSERT INTO schema_migrations(filename) VALUES ('142_backfill_decl_customs.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';
