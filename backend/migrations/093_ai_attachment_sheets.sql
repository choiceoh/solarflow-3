-- AI 어시스턴트 첨부 시트 임시 저장.
-- xlsx/csv 업로드 시 메타+행을 24시간만 보관하고, query_attached_sheet 도구가
-- 컬럼 필터·집계·검색으로 조회한다. LLM 컨텍스트에 시트 전체를 박지 않기 위한 임시 영역.
--
-- 접근 모델 — PostgREST 노출하지 않음 (PostgREST API 에서 보이지 않도록 권한 grant 생략).
-- 백엔드 Go 가 pgx 로 직접 연결해 INSERT/SELECT. 권한 검증은 핸들러에서 user_id 비교.
--
-- TTL 정리는 query_attached_sheet 호출 시 lazy DELETE (expires_at < NOW()).
-- 야간 cron 은 없어도 동작 — 호출이 한 번이라도 들어오면 함께 청소된다.

CREATE TABLE IF NOT EXISTS ai_attachment_sheets (
  sheet_id   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  filename   text        NOT NULL,
  sheet_name text        NOT NULL,
  row_count  integer     NOT NULL,
  col_count  integer     NOT NULL,
  headers    jsonb       NOT NULL, -- ["컬럼A","컬럼B",...] — 빈 헤더면 [].
  created_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz NOT NULL DEFAULT (NOW() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_ai_attachment_sheets_user
  ON ai_attachment_sheets(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_attachment_sheets_expires
  ON ai_attachment_sheets(expires_at);

CREATE TABLE IF NOT EXISTS ai_attachment_rows (
  sheet_id uuid    NOT NULL REFERENCES ai_attachment_sheets(sheet_id) ON DELETE CASCADE,
  row_num  integer NOT NULL, -- 1-based, 헤더 행 제외한 데이터 행 번호
  data     jsonb   NOT NULL, -- ["값1","값2",...] — 컬럼 인덱스 기준 문자열 배열
  PRIMARY KEY (sheet_id, row_num)
);

-- row_num 범위 조회를 위한 별도 인덱스는 PK 의 selectivity 로 충분 (sheet_id, row_num).

-- 데이터 jsonb 전체 텍스트 검색용 GIN — search 모드에서 LIKE '%q%' 대신 트라이그램이 빠르지만,
-- 5만행 cap 이라 단순 시퀀셜 스캔으로도 감당 가능. 인덱스 없이 시작하고 필요시 추가.

-- PostgREST 가 자동 노출하지 않도록 anon/authenticated 롤에 grant 부여하지 않는다.
-- (PostgREST 는 부여된 권한이 없으면 endpoint 를 노출하지 않음)
