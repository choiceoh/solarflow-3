-- 050_assistant_sessions_truncate_for_uimessage.sql
-- PR-2 (Vercel AI SDK 도입) 후속.
--
-- 배경: 어시스턴트 세션 메시지 형식이 평면 {role, content, proposals?} 에서
-- v5 UIMessage {id, role, parts: [...]} 로 변경됨. 두 형식은 호환 안 됨.
-- 049 에서 누적된 기존 세션은 새 프론트엔드에서 렌더 불가 → 전부 폐기.
--
-- jsonb 컬럼이라 스키마 변경 없음 → PostgREST 스키마 캐시 갱신 불필요.
-- 적용 시점: 프론트 PR-2 가 운영에 반영된 직후.

TRUNCATE TABLE assistant_sessions RESTART IDENTITY CASCADE;
