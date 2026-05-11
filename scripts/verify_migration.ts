#!/usr/bin/env bun
/**
 * verify_migration.ts — 운영 DB에 특정 migration 이 실제 반영됐는지 확인한다.
 *
 * 확인 순서:
 *   1. public.schema_migrations 적용 이력
 *   2. DB column / constraint / index 존재 여부
 *   3. PostgREST schema cache 노출 여부
 *
 * 기본 사용:
 *   bun scripts/verify_migration.ts 091_price_benchmark_review_status.sql
 *
 * 범용 사용:
 *   bun scripts/verify_migration.ts 092_xxx.sql \
 *     --column table.column \
 *     --constraint table.constraint_name \
 *     --index index_name \
 *     --postgrest table.column
 */

import { access, readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SQL } from 'bun'

type ColumnExpectation = {
  schema: string
  table: string
  column: string
}

type ConstraintExpectation = {
  schema: string
  table: string
  constraint: string
}

type IndexExpectation = {
  schema: string
  index: string
}

type PostgrestExpectation = {
  table: string
  column: string
}

type Expectations = {
  columns: ColumnExpectation[]
  constraints: ConstraintExpectation[]
  indexes: IndexExpectation[]
  postgrest: PostgrestExpectation[]
}

type Options = {
  migrationArg: string
  usePreset: boolean
  checkPostgrest: boolean
  reloadPostgrest: boolean
  expectations: Expectations
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..')
const MIG_DIR = join(REPO, 'backend', 'migrations')
const BACKEND_ENV = join(REPO, 'backend', '.env')

const PRESETS: Record<string, Expectations> = {
  '091_price_benchmark_review_status.sql': {
    columns: [{ schema: 'public', table: 'price_benchmarks', column: 'review_status' }],
    constraints: [
      {
        schema: 'public',
        table: 'price_benchmarks',
        constraint: 'price_benchmarks_review_status_check',
      },
    ],
    indexes: [{ schema: 'public', index: 'idx_price_benchmarks_review_status' }],
    postgrest: [{ table: 'price_benchmarks', column: 'review_status' }],
  },
}

function emptyExpectations(): Expectations {
  return { columns: [], constraints: [], indexes: [], postgrest: [] }
}

function mergeExpectations(a: Expectations, b: Expectations): Expectations {
  return {
    columns: [...a.columns, ...b.columns],
    constraints: [...a.constraints, ...b.constraints],
    indexes: [...a.indexes, ...b.indexes],
    postgrest: [...a.postgrest, ...b.postgrest],
  }
}

function usage(): string {
  return `
usage: bun scripts/verify_migration.ts <migration-file> [checks...]

examples:
  bun scripts/verify_migration.ts 091_price_benchmark_review_status.sql
  bun scripts/verify_migration.ts migrations/091_price_benchmark_review_status.sql --no-reload
  bun scripts/verify_migration.ts 092_xxx.sql --column sales.foo --postgrest sales.foo

checks:
  --column table.column              public schema column exists
  --column schema.table.column       explicit schema column exists
  --constraint table.constraint      public schema table constraint exists
  --constraint schema.table.constraint
  --index index_name                 public schema index exists
  --index schema.index_name
  --postgrest table.column           REST /table?select=column responds after cache reload

options:
  --no-preset      do not add built-in expectations for known migrations
  --no-postgrest   skip PostgREST REST check
  --no-reload      do not send NOTIFY pgrst, 'reload schema' before REST check
  -h, --help       show this help
`.trim()
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} 값이 필요합니다`)
  }
  return value
}

function parseColumn(input: string): ColumnExpectation {
  const parts = input.split('.')
  if (parts.length === 2) {
    return { schema: 'public', table: parts[0], column: parts[1] }
  }
  if (parts.length === 3) {
    return { schema: parts[0], table: parts[1], column: parts[2] }
  }
  throw new Error(`column 형식이 올바르지 않습니다: ${input}`)
}

function parseConstraint(input: string): ConstraintExpectation {
  const parts = input.split('.')
  if (parts.length === 2) {
    return { schema: 'public', table: parts[0], constraint: parts[1] }
  }
  if (parts.length === 3) {
    return { schema: parts[0], table: parts[1], constraint: parts[2] }
  }
  throw new Error(`constraint 형식이 올바르지 않습니다: ${input}`)
}

function parseIndex(input: string): IndexExpectation {
  const parts = input.split('.')
  if (parts.length === 1) {
    return { schema: 'public', index: parts[0] }
  }
  if (parts.length === 2) {
    return { schema: parts[0], index: parts[1] }
  }
  throw new Error(`index 형식이 올바르지 않습니다: ${input}`)
}

function parsePostgrest(input: string): PostgrestExpectation {
  const parts = input.split('.')
  if (parts.length !== 2) {
    throw new Error(`postgrest 형식이 올바르지 않습니다: ${input}`)
  }
  return { table: parts[0], column: parts[1] }
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    migrationArg: '',
    usePreset: true,
    checkPostgrest: true,
    reloadPostgrest: true,
    expectations: emptyExpectations(),
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '-h':
      case '--help':
        console.log(usage())
        process.exit(0)
      case '--no-preset':
        options.usePreset = false
        break
      case '--no-postgrest':
        options.checkPostgrest = false
        break
      case '--no-reload':
        options.reloadPostgrest = false
        break
      case '--column': {
        const value = requireValue(args, i, arg)
        options.expectations.columns.push(parseColumn(value))
        i++
        break
      }
      case '--constraint': {
        const value = requireValue(args, i, arg)
        options.expectations.constraints.push(parseConstraint(value))
        i++
        break
      }
      case '--index': {
        const value = requireValue(args, i, arg)
        options.expectations.indexes.push(parseIndex(value))
        i++
        break
      }
      case '--postgrest': {
        const value = requireValue(args, i, arg)
        options.expectations.postgrest.push(parsePostgrest(value))
        i++
        break
      }
      default:
        if (arg.startsWith('--')) {
          throw new Error(`알 수 없는 옵션입니다: ${arg}`)
        }
        if (options.migrationArg) {
          throw new Error(`migration 파일은 하나만 지정할 수 있습니다: ${arg}`)
        }
        options.migrationArg = arg
    }
  }

  if (!options.migrationArg) {
    throw new Error('migration 파일을 지정하세요')
  }

  return options
}

async function loadBackendEnv(): Promise<void> {
  let text = ''
  try {
    text = await readFile(BACKEND_ENV, 'utf8')
  } catch {
    return
  }
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (!match) continue
    const key = match[1]
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

async function assertFileExists(path: string): Promise<void> {
  await access(path)
}

function migrationPath(input: string): { filename: string; path: string } {
  const filename = basename(input)
  if (input.startsWith('migrations/')) {
    return { filename, path: join(MIG_DIR, filename) }
  }
  if (input.includes('/') || input.includes('\\')) {
    return { filename, path: resolve(REPO, input) }
  }
  return { filename, path: join(MIG_DIR, filename) }
}

function restBaseUrl(): string {
  const raw = process.env.SUPABASE_URL?.replace(/\/+$/, '')
  if (!raw) {
    throw new Error('SUPABASE_URL 미설정 — PostgREST 확인을 할 수 없습니다')
  }
  return raw.endsWith('/rest/v1') ? raw : `${raw}/rest/v1`
}

function authKey(): string {
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('SUPABASE_KEY 또는 SUPABASE_SERVICE_ROLE_KEY 미설정 — PostgREST 확인을 할 수 없습니다')
  }
  return key
}

function ok(message: string): void {
  console.log(`✅ ${message}`)
}

function fail(message: string): void {
  console.log(`❌ ${message}`)
}

async function verifyApplied(sql: SQL, filename: string): Promise<boolean> {
  const tableRows = (await sql`
    SELECT to_regclass('public.schema_migrations') AS regclass
  `) as Array<{ regclass: string | null }>
  if (!tableRows[0]?.regclass) {
    fail('public.schema_migrations 테이블이 없습니다')
    return false
  }

  const rows = (await sql`
    SELECT applied_at
    FROM public.schema_migrations
    WHERE filename = ${filename}
  `) as Array<{ applied_at: Date | string }>
  if (rows.length === 0) {
    fail(`${filename} 적용 이력이 없습니다`)
    console.log('   조치: 운영 서버에서 bun scripts/apply_migrations.ts 실행 후 재확인')
    return false
  }

  ok(`${filename} 적용 이력 확인 (${String(rows[0].applied_at)})`)
  return true
}

async function verifyColumn(sql: SQL, item: ColumnExpectation): Promise<boolean> {
  const rows = (await sql`
    SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = ${item.schema}
      AND table_name = ${item.table}
      AND column_name = ${item.column}
  `) as Array<{ data_type: string; is_nullable: string; column_default: string | null }>
  if (rows.length === 0) {
    fail(`DB column 없음: ${item.schema}.${item.table}.${item.column}`)
    return false
  }
  const row = rows[0]
  ok(
    `DB column 확인: ${item.schema}.${item.table}.${item.column} (${row.data_type}, nullable=${row.is_nullable})`,
  )
  return true
}

async function verifyConstraint(sql: SQL, item: ConstraintExpectation): Promise<boolean> {
  const rows = (await sql`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = ${item.schema}
      AND t.relname = ${item.table}
      AND c.conname = ${item.constraint}
  `) as Array<{ conname: string }>
  if (rows.length === 0) {
    fail(`DB constraint 없음: ${item.schema}.${item.table}.${item.constraint}`)
    return false
  }
  ok(`DB constraint 확인: ${item.schema}.${item.table}.${item.constraint}`)
  return true
}

async function verifyIndex(sql: SQL, item: IndexExpectation): Promise<boolean> {
  const rows = (await sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = ${item.schema}
      AND indexname = ${item.index}
  `) as Array<{ indexname: string }>
  if (rows.length === 0) {
    fail(`DB index 없음: ${item.schema}.${item.index}`)
    return false
  }
  ok(`DB index 확인: ${item.schema}.${item.index}`)
  return true
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

async function verifyPostgrest(item: PostgrestExpectation): Promise<boolean> {
  const key = authKey()
  const params = new URLSearchParams({ select: item.column, limit: '1' })
  const url = `${restBaseUrl()}/${encodeURIComponent(item.table)}?${params.toString()}`
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  })
  const body = await res.text()
  if (!res.ok) {
    fail(`PostgREST 노출 실패: ${item.table}.${item.column} (HTTP ${res.status})`)
    if (body) console.log(`   ${body.slice(0, 500)}`)
    return false
  }
  if (body.includes('PGRST204')) {
    fail(`PostgREST schema cache 미반영: ${item.table}.${item.column}`)
    return false
  }
  ok(`PostgREST 노출 확인: ${item.table}.${item.column}`)
  return true
}

async function main(): Promise<number> {
  let options: Options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    console.error('')
    console.error(usage())
    return 2
  }

  await loadBackendEnv()

  const { filename, path } = migrationPath(options.migrationArg)
  try {
    await assertFileExists(path)
  } catch {
    console.error(`migration 파일을 찾을 수 없습니다: ${path}`)
    return 2
  }

  const preset = options.usePreset ? PRESETS[filename] : undefined
  const expectations = preset
    ? mergeExpectations(preset, options.expectations)
    : options.expectations

  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) {
    console.error('SUPABASE_DB_URL 미설정 — backend/.env 또는 운영 환경변수를 확인하세요')
    return 2
  }

  console.log(`=== migration 반영 확인: ${filename} ===`)
  if (preset) console.log('preset: built-in checks enabled')

  let sql: SQL
  try {
    sql = new SQL({ url: dbUrl, max: 1 })
  } catch (e) {
    console.error(`DB 연결 초기화 실패: ${e instanceof Error ? e.message : String(e)}`)
    return 2
  }

  let passed = true
  try {
    passed = (await verifyApplied(sql, filename)) && passed

    for (const item of expectations.columns) {
      passed = (await verifyColumn(sql, item)) && passed
    }
    for (const item of expectations.constraints) {
      passed = (await verifyConstraint(sql, item)) && passed
    }
    for (const item of expectations.indexes) {
      passed = (await verifyIndex(sql, item)) && passed
    }

    if (options.checkPostgrest && expectations.postgrest.length > 0) {
      if (options.reloadPostgrest) {
        await sql.unsafe("NOTIFY pgrst, 'reload schema'")
        console.log("↻ NOTIFY pgrst, 'reload schema' 발송")
        await sleep(1500)
      }
      for (const item of expectations.postgrest) {
        passed = (await verifyPostgrest(item)) && passed
      }
    }
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e))
    passed = false
  } finally {
    await sql.end()
  }

  if (!passed) {
    console.log('')
    console.log('💥 migration 반영 확인 실패')
    return 1
  }

  console.log('')
  console.log('✅ migration 반영 확인 완료')
  return 0
}

process.exit(await main())
