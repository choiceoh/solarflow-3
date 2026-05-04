#!/usr/bin/env python3
"""apply_migrations — backend/migrations/*.sql 중 미적용 파일을 자동 적용.

호출처:
  - scripts/cron-deploy.sh (webhook/cron 후 자동)
  - 운영자 수동 실행: backend/.venv-ocr/bin/python scripts/apply_migrations.py

자동 적용 결정 (3단계 fallthrough):
  1. 첫 10줄에 `-- @auto-apply: yes` → 적용 (작성자가 명시적으로 허용)
  2. 첫 10줄에 `-- @auto-apply: no`  → SKIP (작성자가 명시적으로 차단)
  3. 헤더 없음 → 정적 분석:
     - DROP TABLE/COLUMN/CONSTRAINT/INDEX/FUNCTION/TRIGGER/VIEW/SCHEMA/TYPE,
       RENAME TO/COLUMN/CONSTRAINT, TRUNCATE, DELETE FROM 키워드가 본문에 있으면 SKIP
     - 위 키워드가 없으면 idempotent 가정하고 적용 (CREATE TABLE/INDEX IF NOT EXISTS,
       ADD COLUMN IF NOT EXISTS, GRANT, COMMENT 등이 일반적 케이스)

규약:
  - 추적 테이블: public.schema_migrations (filename PK, applied_at)
  - 각 파일은 단일 트랜잭션 안에서 적용 (실패 시 자동 ROLLBACK)
  - 모든 자동 적용 끝난 후 NOTIFY pgrst 한 번 (PostgREST 스키마 캐시 갱신)

종료 코드:
  0 — 정상 (skip 만 있어도 0)
  1 — 적용 중 SQL 실패 → 호출자(cron-deploy)는 Go 재시작 보류 권장
  2 — 환경/연결 실패 (env 누락, DB unreachable) → 일시적이면 다음 회차에서 자동 복구

환경변수: SUPABASE_DB_URL (backend/.env)
의존성: psycopg2 (backend/.venv-ocr/bin/python 사용 권장)
"""

from __future__ import annotations

import os
import re
import sys
import traceback
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MIG_DIR = REPO / "backend" / "migrations"

HEADER_YES_RE = re.compile(r"^\s*--\s*@auto-apply:\s*yes\b", re.IGNORECASE | re.MULTILINE)
HEADER_NO_RE = re.compile(r"^\s*--\s*@auto-apply:\s*no\b", re.IGNORECASE | re.MULTILINE)

# 헤더 없는 파일을 자동 적용에서 차단할 위험 키워드.
# 데이터/스키마 손실 또는 비가역 변경 가능성이 있는 패턴만.
DANGEROUS_RE = re.compile(
    r"\b(?:"
    r"DROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|FUNCTION|TRIGGER|VIEW|SCHEMA|TYPE|MATERIALIZED\s+VIEW)"
    r"|RENAME\s+(?:TO|COLUMN|CONSTRAINT)"
    r"|TRUNCATE"
    r"|DELETE\s+FROM"
    r")\b",
    re.IGNORECASE,
)


def log(msg: str) -> None:
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}", flush=True)


def strip_sql_line_comments(text: str) -> str:
    """`-- 주석` 부분 제거 — 위험 키워드 검색 시 주석 안의 false positive 방지.
    문자열 리터럴 안의 `--`는 마이그레이션에서 거의 없으므로 단순 line-by-line 제거로 충분."""
    out = []
    for line in text.splitlines():
        idx = line.find("--")
        if idx >= 0:
            line = line[:idx]
        out.append(line)
    return "\n".join(out)


def auto_apply_decision(text: str) -> tuple[bool, str]:
    """파일 텍스트로부터 자동 적용 여부와 사유를 결정.
    Returns (apply: bool, reason: str)."""
    head = "\n".join(text.splitlines()[:10])
    if HEADER_YES_RE.search(head):
        return True, "헤더 @auto-apply: yes"
    if HEADER_NO_RE.search(head):
        return False, "헤더 @auto-apply: no"
    body = strip_sql_line_comments(text)
    m = DANGEROUS_RE.search(body)
    if m:
        return False, f"위험 키워드 감지 ({m.group(0).upper()}) — 헤더로 명시 적용 필요"
    return True, "안전 키워드만 — 자동 추정 적용"


def main() -> int:
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        log("ERROR: SUPABASE_DB_URL 미설정 — backend/.env source 했는지 확인")
        return 2

    try:
        import psycopg2  # type: ignore[import-not-found]
    except ImportError:
        log("ERROR: psycopg2 미설치 — backend/.venv-ocr/bin/python 으로 실행하세요")
        return 2

    try:
        conn = psycopg2.connect(db_url)
    except Exception as e:
        log(f"ERROR: DB 연결 실패: {e}")
        return 2

    try:
        # 1. tracking 테이블 부트스트랩 (없으면 만듦)
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS public.schema_migrations (
                        filename    text        PRIMARY KEY,
                        applied_at  timestamptz NOT NULL DEFAULT now()
                    )
                    """
                )

        # 2. 적용된 파일 집합 로드
        with conn.cursor() as cur:
            cur.execute("SELECT filename FROM public.schema_migrations")
            applied: set[str] = {r[0] for r in cur.fetchall()}

        # 3. 마이그레이션 파일 정렬 적용
        files = sorted(MIG_DIR.glob("*.sql"))
        if not files:
            log("마이그레이션 파일 없음")
            return 0

        applied_count = 0
        skipped_count = 0
        ran_any = False

        for f in files:
            name = f.name
            if name in applied:
                continue
            text = f.read_text(encoding="utf-8")
            apply, reason = auto_apply_decision(text)
            if not apply:
                log(f"⚠️  SKIP {name} — {reason}")
                skipped_count += 1
                continue

            log(f"  apply {name}  ({reason})")
            try:
                with conn:
                    with conn.cursor() as cur:
                        cur.execute(text)
                        cur.execute(
                            "INSERT INTO public.schema_migrations (filename) VALUES (%s)",
                            (name,),
                        )
                applied_count += 1
                ran_any = True
            except Exception as e:
                log(f"❌ FAIL {name}: {e}")
                traceback.print_exc()
                return 1

        # 4. PostgREST 스키마 캐시 갱신 (실 적용이 있었던 경우만)
        if ran_any:
            try:
                conn.autocommit = True
                with conn.cursor() as cur:
                    cur.execute("NOTIFY pgrst, 'reload schema'")
                conn.autocommit = False
                log("  NOTIFY pgrst, 'reload schema' 보냄")
            except Exception as e:
                log(f"⚠️  NOTIFY pgrst 실패 (적용은 완료됨): {e}")

        log(
            f"완료 — 적용 {applied_count}, SKIP {skipped_count}, "
            f"기적용 {len(applied)}/{len(files)}"
        )
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
