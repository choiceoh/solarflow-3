#!/usr/bin/env python3
"""apply_migrations — backend/migrations/*.sql 중 미적용 + 헤더 게이트 통과한 것만 자동 적용.

호출처:
  - scripts/cron-deploy.sh (webhook/cron 후 자동)
  - 운영자 수동 실행: backend/.venv-ocr/bin/python scripts/apply_migrations.py

규약:
  - 추적 테이블: public.schema_migrations (filename PK, applied_at)
  - 자동 적용 게이트: 파일 첫 10줄 안에 `-- @auto-apply: yes` 헤더 있어야 함
  - 헤더 없는 미적용 파일은 경고만 찍고 SKIP — 운영자 수동 적용 필요
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
HEADER_RE = re.compile(r"^\s*--\s*@auto-apply:\s*yes\b", re.IGNORECASE | re.MULTILINE)


def log(msg: str) -> None:
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}", flush=True)


def has_auto_apply_header(text: str) -> bool:
    """파일 첫 10줄 안에 `-- @auto-apply: yes` 헤더가 있는지."""
    head = "\n".join(text.splitlines()[:10])
    return bool(HEADER_RE.search(head))


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
            if not has_auto_apply_header(text):
                log(f"⚠️  SKIP {name} — `-- @auto-apply: yes` 헤더 없음 (수동 적용 필요)")
                skipped_count += 1
                continue

            log(f"  apply {name} ...")
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
            f"완료 — 적용 {applied_count}, 게이트 SKIP {skipped_count}, "
            f"기적용 {len(applied)}/{len(files)}"
        )
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
