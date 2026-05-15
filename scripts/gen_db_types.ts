#!/usr/bin/env bun
/**
 * gen_db_types.ts — DB 스키마(introspection) → Go 구조체 + TS 타입 자동 생성.
 *
 * 왜 만들었나
 *   "Go 모델 필드 변경 시 4단계 (마이그 → apply → NOTIFY pgrst → check_schema.sh)"
 *   를 빠뜨리면 PGRST204 → Go 500 → 프론트 저장 실패가 발생한다. check_schema.sh
 *   는 *비교만* 했지만 — 이 스크립트는 DB 를 *정본으로* 코드를 생성해 동기화 누락
 *   자체를 없앤다. 한 번 `bun scripts/gen_db_types.ts` 로 두 산출물을 갱신, 커밋.
 *
 * 산출물
 *   - backend/internal/dbschema/tables.gen.go
 *       각 테이블별:
 *         - Row 구조체 (snake_case 컬럼 → PascalCase 필드 + json 태그)
 *         - <Table>Cols 상수 (PostgREST select 시 컬럼 typo 컴파일타임 차단)
 *         - <Table>AllColumns string (','로 join 된 전체 컬럼 — REST select=*) 대체)
 *   - frontend/src/types/db.gen.ts
 *       Supabase CLI 호환 형식의 `Database` 인터페이스 (Row/Insert/Update)
 *
 * 사용
 *   bun scripts/gen_db_types.ts          # 생성 (DB 연결 필요)
 *   bun scripts/gen_db_types.ts --check  # 생성 후 git diff 0 인지만 체크 (CI 용)
 *
 * 환경변수
 *   SUPABASE_DB_URL — apply_migrations.ts 와 동일. 없으면 친절히 skip (exit 0).
 *
 * 의존성
 *   Bun 1.3+ (Bun.SQL). npm 패키지 추가 없음.
 *
 * 알려진 한계 (향후 확장)
 *   - VIEW / MATERIALIZED VIEW: 미포함. 필요 시 base table 와 동일 패턴으로 추가.
 *   - RPC / FUNCTION 시그니처: 미포함.
 *   - CHECK 제약 enum 추출: 미포함 (validBLStatuses 같은 손코딩 검증을 자동화하려면 별도 PR).
 *   - numeric 정밀도: float64 / number 로 매핑. KRW 같은 금액은 손코딩 모델에서
 *     int64 로 받고 있으므로 그쪽이 정본. 본 파일의 Row 는 *참조용*이다.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SQL } from 'bun'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..')
const GO_OUT = join(REPO, 'backend', 'internal', 'dbschema', 'tables.gen.go')
const TS_OUT = join(REPO, 'frontend', 'src', 'types', 'db.gen.ts')

// 스키마 정본에서 제외할 테이블. schema_migrations 는 apply_migrations.ts 의 메타테이블이라
// 도메인 코드가 손댈 일이 없다.
const EXCLUDE_TABLES = new Set<string>(['schema_migrations'])

// Go 예약어 — 컬럼 이름이 우연히 일치하면 식별자 끝에 `_` 를 붙인다.
const GO_RESERVED = new Set<string>([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
  'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
  'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type',
  'var',
])

interface ColumnRow {
  table_name: string
  column_name: string
  ordinal_position: number
  is_nullable: 'YES' | 'NO'
  data_type: string      // 'integer', 'text', 'ARRAY', 'USER-DEFINED' 등 (information_schema)
  udt_name: string       // 'int4', 'text', '_text', 'uuid' 등 (pg_catalog)
  column_default: string | null
  is_identity: 'YES' | 'NO'
  is_generated: 'NEVER' | 'ALWAYS' | 'BY DEFAULT'
  is_primary_key: boolean
  column_comment: string | null
}

interface Column {
  name: string
  isNullable: boolean
  isArray: boolean
  pgType: string            // 단일 요소 기준 (배열이면 udt_name 의 `_` 떼고)
  hasDefault: boolean
  isIdentity: boolean
  isGenerated: boolean
  isPrimaryKey: boolean
  comment: string | null
}

interface Table {
  name: string
  columns: Column[]
}

// ─── 식별자 변환 ─────────────────────────────────────────────────────────────

function snakeToPascal(s: string): string {
  // 'bl_shipments' → 'BlShipments', 'company_id' → 'CompanyId'.
  // 흔한 약어 (id/url/ip 등) 의 ALL-CAPS 변환은 의도적으로 안 한다 —
  // 일관성 (CompanyId 등) 이 핸드코딩 (CompanyID) 과 살짝 다른 게 차라리 식별에 유리하다.
  return s
    .split('_')
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('')
}

function goIdent(s: string): string {
  const id = snakeToPascal(s)
  return id
}

function goFieldIdent(colName: string): string {
  // 컬럼명이 숫자로 시작하면 'F' 접두사
  let id = snakeToPascal(colName)
  if (/^[0-9]/.test(id)) id = 'F' + id
  if (GO_RESERVED.has(id.toLowerCase())) id = id + '_'
  return id
}

// ─── 타입 매핑 ───────────────────────────────────────────────────────────────

function pgToGoBase(udt: string): { goType: string; needsJsonImport: boolean } {
  switch (udt) {
    case 'text': case 'varchar': case 'char': case 'bpchar': case 'citext':
    case 'name': case 'uuid': case 'inet': case 'cidr': case 'macaddr':
      return { goType: 'string', needsJsonImport: false }
    case 'int2': case 'int4':
      return { goType: 'int', needsJsonImport: false }
    case 'int8':
      return { goType: 'int64', needsJsonImport: false }
    case 'numeric': case 'decimal':
      // numeric → float64. 정밀도 민감 컬럼(예: KRW)은 도메인 모델에서 int64 로 받음.
      return { goType: 'float64', needsJsonImport: false }
    case 'float4':
      return { goType: 'float32', needsJsonImport: false }
    case 'float8':
      return { goType: 'float64', needsJsonImport: false }
    case 'bool':
      return { goType: 'bool', needsJsonImport: false }
    case 'date': case 'timestamp': case 'timestamptz': case 'time': case 'timetz':
      // PostgREST 가 ISO-8601 문자열로 직렬화 — Go 도 string 으로 받는 게 호환.
      return { goType: 'string', needsJsonImport: false }
    case 'json': case 'jsonb':
      return { goType: 'json.RawMessage', needsJsonImport: true }
    case 'bytea':
      return { goType: '[]byte', needsJsonImport: false }
    default:
      // ENUM, DOMAIN, 사용자 정의 타입 — 일단 string 으로 fall back (PostgREST 가 문자열로 노출).
      return { goType: 'string', needsJsonImport: false }
  }
}

function pgToGo(col: Column): { goType: string; needsJsonImport: boolean } {
  const { goType: base, needsJsonImport } = pgToGoBase(col.pgType)
  let t = base
  if (col.isArray) t = `[]${t}`
  if (col.isNullable && !col.isArray) t = `*${t}` // 배열은 nil 자체가 NULL 의미
  return { goType: t, needsJsonImport }
}

function pgToTsBase(udt: string): string {
  switch (udt) {
    case 'text': case 'varchar': case 'char': case 'bpchar': case 'citext':
    case 'name': case 'uuid': case 'inet': case 'cidr': case 'macaddr':
    case 'date': case 'timestamp': case 'timestamptz': case 'time': case 'timetz':
    case 'bytea':
      return 'string'
    case 'int2': case 'int4': case 'int8':
    case 'numeric': case 'decimal':
    case 'float4': case 'float8':
      return 'number'
    case 'bool':
      return 'boolean'
    case 'json': case 'jsonb':
      return 'Json'
    default:
      return 'string' // ENUM 등은 string 으로
  }
}

function pgToTs(col: Column): string {
  let t = pgToTsBase(col.pgType)
  if (col.isArray) t = `${t}[]`
  if (col.isNullable) t = `${t} | null`
  return t
}

// ─── introspection ───────────────────────────────────────────────────────────

const INTROSPECT_SQL = `
SELECT
  c.table_name,
  c.column_name,
  c.ordinal_position,
  c.is_nullable,
  c.data_type,
  c.udt_name,
  c.column_default,
  c.is_identity,
  c.is_generated,
  EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_schema = kcu.constraint_schema
     AND tc.constraint_name   = kcu.constraint_name
    WHERE tc.constraint_type  = 'PRIMARY KEY'
      AND kcu.table_schema    = c.table_schema
      AND kcu.table_name      = c.table_name
      AND kcu.column_name     = c.column_name
  ) AS is_primary_key,
  col_description(
    (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
    c.ordinal_position
  ) AS column_comment
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  )
ORDER BY c.table_name, c.ordinal_position
`

async function introspect(sql: SQL): Promise<Table[]> {
  const rows = (await sql.unsafe(INTROSPECT_SQL)) as ColumnRow[]
  const byTable = new Map<string, Column[]>()

  for (const r of rows) {
    if (EXCLUDE_TABLES.has(r.table_name)) continue
    const isArray = r.data_type === 'ARRAY'
    // 배열이면 udt_name 이 '_text' 형식 — 앞의 _ 떼면 요소 타입
    const pgType = isArray && r.udt_name.startsWith('_') ? r.udt_name.slice(1) : r.udt_name
    const col: Column = {
      name: r.column_name,
      isNullable: r.is_nullable === 'YES',
      isArray,
      pgType,
      hasDefault: r.column_default !== null,
      isIdentity: r.is_identity === 'YES',
      isGenerated: r.is_generated !== 'NEVER',
      isPrimaryKey: r.is_primary_key,
      comment: r.column_comment,
    }
    const list = byTable.get(r.table_name)
    if (list) list.push(col)
    else byTable.set(r.table_name, [col])
  }

  return Array.from(byTable.entries())
    .map(([name, columns]) => ({ name, columns }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ─── Go 렌더링 ───────────────────────────────────────────────────────────────

function renderGo(tables: Table[]): string {
  let needsJson = false

  const tableBlocks = tables.map((t) => {
    const goName = snakeToPascal(t.name)
    const fieldLines: string[] = []
    const colConstLines: string[] = []
    const colNames: string[] = []

    for (const c of t.columns) {
      const { goType, needsJsonImport } = pgToGo(c)
      if (needsJsonImport) needsJson = true

      const fieldName = goFieldIdent(c.name)
      const jsonTag = c.isNullable ? `${c.name},omitempty` : c.name
      const docLine = c.comment ? `\t// ${c.comment.replace(/\n/g, ' ').trim()}\n` : ''
      fieldLines.push(`${docLine}\t${fieldName} ${goType} \`json:"${jsonTag}"\``)

      const constName = `${goName}Col${fieldName}`
      // 명시적 untyped string — postgrest-go API 가 plain string 을 받으므로 그대로 통과,
      // 타입 캐스팅 없이 query.Eq(dbschema.BlShipmentsColPoId, ...) 형식으로 호출 가능.
      // 존재하지 않는 컬럼명 참조는 컴파일타임에 잡힘 (typo 방지).
      colConstLines.push(`\t${constName} = "${c.name}"`)
      colNames.push(c.name)
    }

    return [
      `// ${goName} — public.${t.name} 의 row 표현 (introspection 정본).`,
      `// 도메인별 손코딩 Create/Update Request 와 별개로 유지 — Row 는 *DB 정본*,`,
      `// Request 는 *클라이언트 입력 + validation* 책임이라 양쪽을 분리한다.`,
      `type ${goName} struct {`,
      fieldLines.join('\n'),
      `}`,
      '',
      `// ${goName}Col* — public.${t.name} 의 컬럼명 상수.`,
      `// 사용: query.Eq(dbschema.${goName}Col${snakeToPascal(t.columns[0]?.name ?? 'X')}, value)`,
      `const (`,
      colConstLines.join('\n'),
      `)`,
      '',
      `// ${goName}AllColumns — REST select 시 ','로 join 된 전체 컬럼 (\`*\` 회피용).`,
      `var ${goName}AllColumns = "${colNames.join(',')}"`,
      '',
    ].join('\n')
  }).join('\n')

  const imports = needsJson ? `import "encoding/json"\n\n` : ''

  return `// Code generated by scripts/gen_db_types.ts. DO NOT EDIT.
//
// Source: information_schema introspection against SUPABASE_DB_URL.
// Run \`bun scripts/gen_db_types.ts\` to regenerate.
//
// 이 패키지는 DB 스키마의 컴파일타임 정본이다.
//   - PostgREST select 시 컬럼명 typo 를 컴파일타임에 잡으려면
//     dbschema.<Table>AllColumns 또는 dbschema.<Table>Col<Field> 상수를 사용한다.
//   - 도메인의 Create*Request / Update*Request 는 손코딩으로 둔다 — validation
//     로직(필수값, 허용 enum, 길이 제한)이 그쪽에 속한다.
//   - 본 파일이 1줄이라도 변경되면 그건 *DB 스키마가 바뀐 것* — 커밋에 같이 포함한다.

package dbschema

${imports}${tableBlocks}`
}

// ─── TS 렌더링 ───────────────────────────────────────────────────────────────

function renderTs(tables: Table[]): string {
  const tableBlocks = tables.map((t) => {
    const rowFields: string[] = []
    const insertFields: string[] = []
    const updateFields: string[] = []

    for (const c of t.columns) {
      const tsType = pgToTs(c)
      const docLine = c.comment ? `        /** ${c.comment.replace(/\n/g, ' ').trim()} */\n` : ''

      rowFields.push(`${docLine}        ${c.name}: ${tsType}`)

      // Insert: identity / has default / generated / nullable → optional
      const insertOptional = c.isIdentity || c.hasDefault || c.isGenerated || c.isNullable
      const insertSep = insertOptional ? '?' : ''
      insertFields.push(`        ${c.name}${insertSep}: ${tsType}`)

      // Update: 모두 optional (PATCH 의미)
      updateFields.push(`        ${c.name}?: ${tsType}`)
    }

    return [
      `    ${t.name}: {`,
      `      Row: {`,
      rowFields.join('\n'),
      `      }`,
      `      Insert: {`,
      insertFields.join('\n'),
      `      }`,
      `      Update: {`,
      updateFields.join('\n'),
      `      }`,
      `      Relationships: []`,
      `    }`,
    ].join('\n')
  }).join('\n')

  return `// Code generated by scripts/gen_db_types.ts. DO NOT EDIT.
//
// Source: information_schema introspection against SUPABASE_DB_URL.
// Run \`bun scripts/gen_db_types.ts\` (in repo root) to regenerate.
//
// 이 파일은 Supabase CLI \`supabase gen types typescript\` 와 호환되는 형식이다.
// 손코딩 타입(frontend/src/types/*.ts) 은 *클라이언트 모양* 책임,
// 본 파일은 *DB 스키마 정본* 책임 — 양쪽을 분리해 PGRST204 동기화 사고를 차단한다.
//
// 사용 예:
//   import type { Database } from '@/types/db.gen'
//   type BLShipment = Database['public']['Tables']['bl_shipments']['Row']

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
${tableBlocks}
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
`
}

// ─── main ────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  console.log(`[${ts}] gen_db_types: ${msg}`)
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
}

async function fileEquals(path: string, content: string): Promise<boolean> {
  try {
    const existing = await readFile(path, 'utf-8')
    return existing === content
  } catch {
    return false
  }
}

async function main(): Promise<number> {
  const checkMode = process.argv.includes('--check')

  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) {
    log('SUPABASE_DB_URL 미설정 — skip (backend/.env 를 source 해야 함). 0 으로 종료.')
    return 0
  }

  let sql: SQL
  try {
    sql = new SQL({ url: dbUrl, max: 1 })
  } catch (e) {
    log(`ERROR: DB 연결 실패: ${e instanceof Error ? e.message : String(e)}`)
    return 2
  }

  try {
    log('introspection 시작')
    const tables = await introspect(sql)
    log(`${tables.length} 개 테이블 검출`)

    const goContent = renderGo(tables)
    const tsContent = renderTs(tables)

    if (checkMode) {
      const goOk = await fileEquals(GO_OUT, goContent)
      const tsOk = await fileEquals(TS_OUT, tsContent)
      if (goOk && tsOk) {
        log('✅ check: 생성물과 커밋된 파일 일치')
        return 0
      }
      if (!goOk) log(`❌ check: ${GO_OUT} 가 생성물과 다름`)
      if (!tsOk) log(`❌ check: ${TS_OUT} 가 생성물과 다름`)
      log('   → 로컬에서 `bun scripts/gen_db_types.ts` 실행 후 커밋하세요.')
      return 1
    }

    await ensureDir(GO_OUT)
    await ensureDir(TS_OUT)
    await writeFile(GO_OUT, goContent, 'utf-8')
    await writeFile(TS_OUT, tsContent, 'utf-8')
    log(`✅ ${GO_OUT}`)
    log(`✅ ${TS_OUT}`)
    return 0
  } catch (e) {
    log(`ERROR: ${e instanceof Error ? e.message : String(e)}`)
    if (e instanceof Error && e.stack) console.error(e.stack)
    return 1
  } finally {
    await sql.end()
  }
}

const code = await main()
process.exit(code)
