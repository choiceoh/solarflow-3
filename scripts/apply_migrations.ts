#!/usr/bin/env bun
/**
 * apply_migrations.ts — backend/migrations/*.sql 중 미적용 파일을 자동 적용.
 *
 * apply_migrations.py 의 TS 포팅. Bun runtime + Bun.SQL 사용 → Python venv 의존 제거.
 * 동작은 .py 와 1:1 동등. dual-run 검증 후 cron-deploy 가 .ts 를 호출하도록 swap 예정.
 *
 * 호출처:
 *   - scripts/cron-deploy.sh (webhook/cron 후 자동) — 향후 .ts 로 swap
 *   - 운영자 수동 실행: bun scripts/apply_migrations.ts
 *
 * 자동 적용 결정 (3단계 fallthrough):
 *   1. 첫 10줄에 `-- @auto-apply: yes` → 적용
 *   2. 첫 10줄에 `-- @auto-apply: no`  → SKIP
 *   3. 헤더 없음 → 정적 분석:
 *      - DROP TABLE/COLUMN/CONSTRAINT/INDEX/FUNCTION/TRIGGER/VIEW/SCHEMA/TYPE,
 *        RENAME TO/COLUMN/CONSTRAINT, TRUNCATE, DELETE FROM 본문 등장 → SKIP
 *      - 그 외 → idempotent 가정, 적용
 *
 * 규약:
 *   - 추적 테이블: public.schema_migrations (filename PK, applied_at)
 *   - 각 파일은 단일 트랜잭션 안에서 적용 (실패 시 자동 ROLLBACK)
 *   - 모든 자동 적용 끝난 후 NOTIFY pgrst 한 번 (PostgREST 스키마 캐시 갱신)
 *
 * 종료 코드:
 *   0 — 정상 (skip 만 있어도 0)
 *   1 — 적용 중 SQL 실패
 *   2 — 환경/연결 실패 (env 누락, DB unreachable)
 *
 * 환경변수: SUPABASE_DB_URL (backend/.env)
 */

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SQL } from 'bun'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..')
const MIG_DIR = join(REPO, 'backend', 'migrations')

const HEADER_YES_RE = /^\s*--\s*@auto-apply:\s*yes\b/im
const HEADER_NO_RE = /^\s*--\s*@auto-apply:\s*no\b/im

// 헤더 없는 파일을 자동 적용에서 차단할 위험 키워드.
// .py 의 DANGEROUS_RE 와 1:1 동등.
const DANGEROUS_RE =
  /\b(?:DROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|FUNCTION|TRIGGER|VIEW|SCHEMA|TYPE|MATERIALIZED\s+VIEW)|RENAME\s+(?:TO|COLUMN|CONSTRAINT)|TRUNCATE|DELETE\s+FROM)\b/i

function log(msg: string): void {
  // local time, ISO 형식으로 .py 의 datetime.now().isoformat(timespec='seconds') 와 매칭.
  // toISOString() 은 UTC 라 cron-deploy 다른 로그(KST)와 어긋나므로 직접 포맷.
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  console.log(`[${ts}] ${msg}`)
}

// `-- 주석` 부분 제거 — 위험 키워드 검색 시 주석 안의 false positive 방지.
// 문자열 리터럴 안의 `--`는 마이그레이션에서 거의 없으므로 단순 line-by-line 제거로 충분.
function stripSqlLineComments(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--')
      return idx >= 0 ? line.slice(0, idx) : line
    })
    .join('\n')
}

function autoApplyDecision(text: string): { apply: boolean; reason: string } {
  const head = text.split('\n').slice(0, 10).join('\n')
  if (HEADER_YES_RE.test(head)) return { apply: true, reason: '헤더 @auto-apply: yes' }
  if (HEADER_NO_RE.test(head)) return { apply: false, reason: '헤더 @auto-apply: no' }
  const body = stripSqlLineComments(text)
  const m = DANGEROUS_RE.exec(body)
  if (m) {
    return {
      apply: false,
      reason: `위험 키워드 감지 (${m[0].toUpperCase()}) — 헤더로 명시 적용 필요`,
    }
  }
  return { apply: true, reason: '안전 키워드만 — 자동 추정 적용' }
}

async function main(): Promise<number> {
  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) {
    log('ERROR: SUPABASE_DB_URL 미설정 — backend/.env source 했는지 확인')
    return 2
  }

  let sql: SQL
  try {
    sql = new SQL({ url: dbUrl, max: 1 })
  } catch (e) {
    log(`ERROR: DB 연결 실패: ${e instanceof Error ? e.message : String(e)}`)
    return 2
  }

  try {
    // 1. tracking 테이블 부트스트랩 (없으면 만듦)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename    text        PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `)

    // 2. 적용된 파일 집합 로드
    const rows = (await sql`SELECT filename FROM public.schema_migrations`) as Array<{
      filename: string
    }>
    const applied = new Set<string>(rows.map((r) => r.filename))

    // 3. 마이그레이션 파일 목록 정렬
    const files = (await readdir(MIG_DIR)).filter((f) => f.endsWith('.sql')).sort()

    if (files.length === 0) {
      log('마이그레이션 파일 없음')
      return 0
    }

    let appliedCount = 0
    let skippedCount = 0
    let ranAny = false

    for (const name of files) {
      if (applied.has(name)) continue
      const text = await readFile(join(MIG_DIR, name), 'utf-8')
      const { apply, reason } = autoApplyDecision(text)
      if (!apply) {
        log(`⚠️  SKIP ${name} — ${reason}`)
        skippedCount++
        continue
      }

      log(`  apply ${name}  (${reason})`)
      try {
        await sql.begin(async (tx) => {
          await tx.unsafe(text)
          await tx`INSERT INTO public.schema_migrations (filename) VALUES (${name})`
        })
        appliedCount++
        ranAny = true
      } catch (e) {
        log(`❌ FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`)
        if (e instanceof Error && e.stack) console.error(e.stack)
        return 1
      }
    }

    // 4. PostgREST 스키마 캐시 갱신 (실 적용이 있었던 경우만)
    if (ranAny) {
      try {
        await sql.unsafe(`NOTIFY pgrst, 'reload schema'`)
        log("  NOTIFY pgrst, 'reload schema' 보냄")
      } catch (e) {
        log(
          `⚠️  NOTIFY pgrst 실패 (적용은 완료됨): ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }

    log(
      `완료 — 적용 ${appliedCount}, SKIP ${skippedCount}, 기적용 ${applied.size}/${files.length}`,
    )
    return 0
  } finally {
    await sql.end()
  }
}

const code = await main()
process.exit(code)
