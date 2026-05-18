-- @auto-apply: yes  -- DROP TRIGGER IF EXISTS 는 CREATE TRIGGER 직전 idempotent 패턴
-- M161: banks.lc_limit_usd 변경 시 limit_changes 자동 기록 트리거
--
-- 배경 (별건 #2 in M160 PR):
--   limit_changes 테이블이 존재하지만 비어있음. 한도 변경 이력 미관리.
--   인라인 한도 편집 UI (InlineLcLimitCell) 도입하면서 변경이 더 빈번해질 예정.
--
-- 방향:
--   어떤 경로 (DataPage 인라인, BankForm dialog, 향후 다른 UI) 에서 PATCH 하든
--   DB 레벨에서 자동 기록되게 트리거 사용. 애플리케이션 레이어 의존 없음.
--
-- 동작:
--   UPDATE banks SET lc_limit_usd = ... 가 실제로 값을 바꾸는 경우만 insert.
--   - bank_id, previous_limit, new_limit, change_date=current_date 자동.
--   - reason 은 NULL (현재 PATCH 인터페이스에 사유 필드 없음. 추후 확장 가능).
--   - created_at default now().

CREATE OR REPLACE FUNCTION log_lc_limit_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lc_limit_usd IS DISTINCT FROM OLD.lc_limit_usd THEN
    INSERT INTO limit_changes (
      bank_id, change_date, previous_limit, new_limit, reason
    ) VALUES (
      NEW.bank_id,
      current_date,
      COALESCE(OLD.lc_limit_usd, 0),
      NEW.lc_limit_usd,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_banks_log_lc_limit ON banks;

CREATE TRIGGER trg_banks_log_lc_limit
AFTER UPDATE OF lc_limit_usd ON banks
FOR EACH ROW
WHEN (NEW.lc_limit_usd IS DISTINCT FROM OLD.lc_limit_usd)
EXECUTE FUNCTION log_lc_limit_change();

NOTIFY pgrst, 'reload schema';
