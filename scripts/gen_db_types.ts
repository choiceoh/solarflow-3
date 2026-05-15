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
  relation_kind: 'table' | 'view'
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

interface Relation {
  name: string
  kind: 'table' | 'view'
  columns: Column[]
}

// CHECK 제약 enum (`col IN (...)` / `col = ANY (ARRAY[...])` 패턴).
// table_name + column_name → 허용값 리스트.
interface CheckEnum {
  table: string
  column: string
  values: string[]
}

interface RpcArg {
  name: string
  pgType: string  // 'uuid', 'text', 'jsonb' 등 (배열 prefix `_` 제거)
  isArray: boolean
  hasDefault: boolean  // DEFAULT 가 있으면 호출 시 optional
}

interface Rpc {
  name: string
  args: RpcArg[]
  returnsRaw: string  // 'jsonb' / 'TABLE(...)' / 'text' 등 — Returns 는 단순 매핑
}

interface RpcRow {
  name: string
  args_text: string  // pg_get_function_arguments 결과
  result_text: string  // pg_get_function_result 결과
}

interface CheckConstraintRow {
  table_name: string
  constraint_def: string  // pg_get_constraintdef() 출력 그대로
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

// 테이블 + 뷰 둘 다 수집. pg_tables 와 pg_views 를 LEFT JOIN 으로 합쳐 kind 태깅.
// view 는 information_schema.columns 에 동일 형식으로 노출돼 컬럼 정보를 그대로 재사용.
// PK 정보는 view 에는 적용되지 않지만 information_schema.key_column_usage 가 빈 결과를
// 돌려주므로 is_primary_key=false 로 자동 채워진다 (별도 분기 불필요).
const INTROSPECT_SQL = `
WITH relations AS (
  SELECT tablename AS relname, 'table'::text AS kind FROM pg_tables WHERE schemaname = 'public'
  UNION ALL
  SELECT viewname AS relname,  'view'::text  AS kind FROM pg_views  WHERE schemaname = 'public'
)
SELECT
  c.table_name,
  rel.kind AS relation_kind,
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
JOIN relations rel ON rel.relname = c.table_name
WHERE c.table_schema = 'public'
ORDER BY rel.kind, c.table_name, c.ordinal_position
`

// pg_constraint 에서 CHECK 제약(`contype = 'c'`) 만 가져와 텍스트 정의를 정규식으로 파싱.
// 본 시스템은 단순 enum 패턴 (`col IN (...)` / `col = ANY (ARRAY[...])`) 만 지원 — 복잡한
// 표현식 (멀티컬럼, OR, 비교 연산자 등) 은 무시한다 (parseCheckEnum 가 null 반환).
const CHECK_CONSTRAINTS_SQL = `
SELECT
  cls.relname AS table_name,
  pg_get_constraintdef(con.oid) AS constraint_def
FROM pg_constraint con
JOIN pg_class cls ON cls.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
WHERE nsp.nspname = 'public'
  AND con.contype = 'c'
ORDER BY cls.relname, con.conname
`

// CHECK 제약 텍스트를 파싱해 enum 형태인 경우만 추출.
//
// 지원하는 형식 (실제 운영 DB 에서 관찰된 패턴):
//   1) `CHECK (((col)::text = ANY ((ARRAY['v1'::character varying, 'v2'::...])::text[])))`
//   2) `CHECK (col = ANY (ARRAY['v1'::text, 'v2'::text]))`
//   3) `CHECK ((col IN ('v1', 'v2', 'v3')))`
//
// 미지원 (null 반환):
//   - 비교 연산자, 함수 호출, OR/AND 결합, 멀티컬럼 등
function parseCheckEnum(constraintDef: string): { column: string; values: string[] } | null {
  // 컬럼명 후보 + 값 리스트를 찾는다. col 부분의 ::text 캐스트는 옵션.
  // 두 가지 패턴 모두 한 정규식으로:
  //   1) (col)::text = ANY (ARRAY[...])
  //   2) col = ANY (ARRAY[...])
  //   3) col IN (...)
  const reAny = /\(?\(?(\w+)\)?(?:::[a-z ]+)?\s*=\s*ANY\s*\(\(?ARRAY\[([^\]]+)\]/i
  const reIn = /\(?(\w+)\)?\s+IN\s*\(([^)]+)\)/i

  let col: string | null = null
  let valuesRaw: string | null = null

  const mAny = reAny.exec(constraintDef)
  if (mAny) {
    col = mAny[1]
    valuesRaw = mAny[2]
  } else {
    const mIn = reIn.exec(constraintDef)
    if (mIn) {
      col = mIn[1]
      valuesRaw = mIn[2]
    }
  }

  if (!col || !valuesRaw) return null

  // values 추출 — `'foo'::character varying` 또는 `'foo'::text` 또는 `'foo'` 모두 매칭.
  const values: string[] = []
  const reValue = /'([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = reValue.exec(valuesRaw)) !== null) {
    values.push(m[1])
  }

  if (values.length === 0) return null
  return { column: col, values }
}

// RPC 함수 인트로스펙션 — public 스키마의 일반 함수 (trigger / event_trigger 제외).
// `prokind = 'f'` 만, return type 이 trigger/event_trigger 인 행은 SQL 단에서 제외.
const RPC_INTROSPECT_SQL = `
SELECT
  p.proname AS name,
  pg_catalog.pg_get_function_arguments(p.oid) AS args_text,
  pg_catalog.pg_get_function_result(p.oid) AS result_text
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND pg_catalog.pg_get_function_result(p.oid) NOT IN ('trigger', 'event_trigger')
ORDER BY p.proname
`

// 함수 인자 텍스트 (`p_company_id uuid DEFAULT NULL::uuid, p_status text`) 파싱.
// 단순 top-level split — 함수 안 함수 호출은 없다고 가정 (운영 RPC 가 그렇지 않은 게 검증됨).
function parseRpcArgs(argsText: string): RpcArg[] {
  const text = argsText.trim()
  if (text === '') return []
  // 최상위 콤마 split — 괄호 깊이 추적.
  const parts: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      parts.push(buf.trim())
      buf = ''
    } else {
      buf += ch
    }
  }
  if (buf.trim()) parts.push(buf.trim())

  const args: RpcArg[] = []
  for (const part of parts) {
    // `<name> <type> [DEFAULT <expr>]` 또는 `<name> <type>`
    const m = /^(\w+)\s+(.+?)(?:\s+DEFAULT\s+.+)?$/i.exec(part)
    if (!m) continue
    const name = m[1]
    let type = m[2].trim()
    const isArray = /\[\]$/.test(type)
    if (isArray) type = type.slice(0, -2).trim()
    args.push({
      name,
      pgType: type,
      isArray,
      hasDefault: /\sDEFAULT\s/i.test(part),
    })
  }
  return args
}

async function introspectRpcs(sql: SQL): Promise<Rpc[]> {
  const rows = (await sql.unsafe(RPC_INTROSPECT_SQL)) as RpcRow[]
  return rows.map((r) => ({
    name: r.name,
    args: parseRpcArgs(r.args_text),
    returnsRaw: r.result_text,
  }))
}

async function introspectCheckEnums(sql: SQL): Promise<CheckEnum[]> {
  const rows = (await sql.unsafe(CHECK_CONSTRAINTS_SQL)) as CheckConstraintRow[]
  const enums: CheckEnum[] = []
  for (const r of rows) {
    if (EXCLUDE_TABLES.has(r.table_name)) continue
    const parsed = parseCheckEnum(r.constraint_def)
    if (!parsed) continue
    enums.push({ table: r.table_name, column: parsed.column, values: parsed.values })
  }
  // table + column 정렬 (안정적 출력)
  enums.sort((a, b) => a.table.localeCompare(b.table) || a.column.localeCompare(b.column))
  return enums
}

async function introspect(sql: SQL): Promise<Relation[]> {
  const rows = (await sql.unsafe(INTROSPECT_SQL)) as ColumnRow[]
  const byRelation = new Map<string, { kind: 'table' | 'view'; columns: Column[] }>()

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
    const entry = byRelation.get(r.table_name)
    if (entry) entry.columns.push(col)
    else byRelation.set(r.table_name, { kind: r.relation_kind, columns: [col] })
  }

  return Array.from(byRelation.entries())
    .map(([name, { kind, columns }]) => ({ name, kind, columns }))
    .sort((a, b) => {
      // table 먼저, 그 안에서 이름순. view 는 뒤로 묶어 가독성 확보.
      if (a.kind !== b.kind) return a.kind === 'table' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

// ─── Go 렌더링 ───────────────────────────────────────────────────────────────

// CHECK enum 의 컬럼값을 PascalCase 식별자로 변환 — Go const 이름 용.
// 'erp_done' → 'ErpDone', 'domestic_foreign' → 'DomesticForeign' 등.
function enumValueToIdent(v: string): string {
  // 영숫자만 keep, 나눠서 PascalCase
  const parts = v.replace(/[^A-Za-z0-9]+/g, '_').split('_').filter(Boolean)
  if (parts.length === 0) return 'Empty'
  let id = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('')
  if (/^[0-9]/.test(id)) id = 'V' + id
  return id
}

function renderGoEnums(enums: CheckEnum[]): string {
  if (enums.length === 0) return ''
  const blocks = enums.map((e) => {
    const tablePascal = snakeToPascal(e.table)
    const colPascal = snakeToPascal(e.column)

    // ASCII-only fallback: 한글/유니코드 등은 PascalCase 매핑이 의미 없거나 충돌하므로
    // const 자체를 emit 하지 않고 슬라이스만 emit. 사용자는 Values 슬라이스로 검증.
    const asciiOnly = e.values.filter((v) => /^[A-Za-z0-9_\- ]+$/.test(v))
    const skippedNonAscii = e.values.length - asciiOnly.length

    // 충돌 방지 — 동일 식별자가 두 번 나오면 인덱스 suffix.
    const seenIdents = new Set<string>()
    const constLines = asciiOnly.map((v) => {
      let ident = enumValueToIdent(v)
      let i = 2
      while (seenIdents.has(ident)) {
        ident = `${enumValueToIdent(v)}${i}`
        i++
      }
      seenIdents.add(ident)
      return `\t${tablePascal}${colPascal}${ident} = "${v}"`
    })

    const sliceItems = e.values.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(', ')
    const constsBlock = constLines.length > 0
      ? [`const (`, constLines.join('\n'), `)`, ``].join('\n')
      : ''
    const skipNote = skippedNonAscii > 0
      ? `// ${skippedNonAscii} 개 값은 비-ASCII (예: 한글) 이라 const 식별자 생성 생략. Values 슬라이스로만 접근.\n`
      : ''

    return [
      `// ${tablePascal}${colPascal}* — public.${e.table}.${e.column} CHECK 허용값.`,
      `// 손코딩 validXxx maps 대신 본 상수/슬라이스를 사용해 컴파일타임 검증.`,
      `${skipNote}${constsBlock}`,
      `// ${tablePascal}${colPascal}Values — DB CHECK 제약과 1:1 동기. validation 헬퍼에 쓰기 좋음.`,
      `var ${tablePascal}${colPascal}Values = []string{${sliceItems}}`,
      ``,
    ].join('\n')
  })
  return [
    `// ─── CHECK 제약 enum (introspection 자동 추출) ────────────────────────────────`,
    ``,
    blocks.join('\n'),
  ].join('\n')
}

function renderGoRpcs(rpcs: Rpc[]): string {
  if (rpcs.length === 0) return ''
  const constLines = rpcs.map((r) => `\tRpc${snakeToPascal(r.name)} = "${r.name}"`)
  const argBlocks = rpcs.map((r) => {
    if (r.args.length === 0) return ''
    const pascal = snakeToPascal(r.name)
    const fields = r.args.map((a) => {
      const goFieldName = goFieldIdent(a.name)
      return `\t${goFieldName} = "${a.name}"`
    })
    return [
      ``,
      `// Rpc${pascal}Args — public.${r.name} 함수 인자명.`,
      `// 사용: client.Rpc(dbschema.Rpc${pascal}, "", map[string]any{dbschema.Rpc${pascal}Args.${goFieldIdent(r.args[0].name)}: ...})`,
      `var Rpc${pascal}Args = struct {`,
      r.args.map((a) => `\t${goFieldIdent(a.name)} string`).join('\n'),
      `}{`,
      r.args.map((a) => `\t${goFieldIdent(a.name)}: "${a.name}",`).join('\n'),
      `}`,
    ].join('\n')
  }).filter(Boolean).join('\n')

  return [
    ``,
    `// ─── RPC 함수 (introspection 자동 추출) ───────────────────────────────────────`,
    ``,
    `// RPC 함수명 상수 — client.Rpc(dbschema.Rpc<Name>, ...) 형식으로 typo 차단.`,
    `const (`,
    constLines.join('\n'),
    `)`,
    argBlocks,
  ].join('\n')
}

function renderGo(relations: Relation[], enums: CheckEnum[], rpcs: Rpc[]): string {
  let needsJson = false

  const blocks = relations.map((t) => {
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

    const kindLabel = t.kind === 'view' ? '뷰' : '테이블'
    const writeNote = t.kind === 'view'
      ? '// view 는 PostgREST 에서 read-only — Insert/Update 의 컬럼 검증엔 베이스 테이블 상수를 사용한다.'
      : '// 도메인별 손코딩 Create/Update Request 와 별개로 유지 — Row 는 *DB 정본*,\n// Request 는 *클라이언트 입력 + validation* 책임이라 양쪽을 분리한다.'

    return [
      `// ${goName} — public.${t.name} 의 ${kindLabel} row 표현 (introspection 정본).`,
      writeNote,
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
  const enumsSection = renderGoEnums(enums)
  const rpcsSection = renderGoRpcs(rpcs)

  return `// Code generated by scripts/gen_db_types.ts. DO NOT EDIT.
//
// Source: information_schema + pg_constraint introspection against SUPABASE_DB_URL.
// Run \`bun scripts/gen_db_types.ts\` to regenerate.
//
// 이 패키지는 DB 스키마(테이블 + 뷰 + CHECK enum)의 컴파일타임 정본이다.
//   - PostgREST select 시 컬럼명 typo 를 컴파일타임에 잡으려면
//     dbschema.<Relation>AllColumns 또는 dbschema.<Relation>Col<Field> 상수를 사용한다.
//   - CHECK 제약의 허용값은 dbschema.<Table><Col><Value> 상수 + <Table><Col>Values 슬라이스로
//     접근. 도메인의 손코딩 validXxxStatuses map 을 점진적으로 대체 가능.
//   - 도메인의 Create*Request / Update*Request 는 손코딩으로 둔다 — validation
//     로직(필수값, 길이 제한 등)이 그쪽에 속한다.
//   - View 는 read-only — Insert/Update 시 베이스 테이블 상수를 쓴다.
//   - 본 파일이 1줄이라도 변경되면 그건 *DB 스키마가 바뀐 것* — 커밋에 같이 포함한다.

package dbschema

${imports}${blocks}
${enumsSection}
${rpcsSection}`
}

// ─── TS 렌더링 ───────────────────────────────────────────────────────────────

function renderTsEnums(enums: CheckEnum[]): string {
  if (enums.length === 0) return ''
  return enums.map((e) => {
    const key = `${e.table}_${e.column}`
    const union = e.values.map((v) => `'${v.replace(/'/g, "\\'")}'`).join(' | ')
    return `      /** public.${e.table}.${e.column} CHECK 허용값 */\n      ${key}: ${union}`
  }).join('\n')
}

function renderTsRpcs(rpcs: Rpc[]): string {
  if (rpcs.length === 0) return ''
  return rpcs.map((r) => {
    const argFields = r.args.length === 0
      ? `        Record<string, never>`
      : r.args.map((a) => {
          let tsType = pgToTsBase(a.pgType)
          if (a.isArray) tsType = `${tsType}[]`
          // DEFAULT 있으면 호출 시 optional, 그리고 NULL 가능
          const sep = a.hasDefault ? '?' : ''
          const nullable = a.hasDefault ? ' | null' : ''
          return `          ${a.name}${sep}: ${tsType}${nullable}`
        }).join('\n')
    const argsBlock = r.args.length === 0
      ? argFields
      : [`        {`, argFields, `        }`].join('\n')
    // Returns 매핑: TABLE(...) 는 unknown[], jsonb 는 Json, primitive 는 매핑.
    const ret = r.returnsRaw.trim()
    let returnsTs: string
    if (ret.startsWith('TABLE(') || ret.startsWith('SETOF ')) returnsTs = 'unknown[]'
    else if (ret === 'jsonb' || ret === 'json') returnsTs = 'Json'
    else if (ret === 'void') returnsTs = 'undefined'
    else returnsTs = pgToTsBase(ret)
    return `      ${r.name}: {\n        Args: ${argsBlock}\n        Returns: ${returnsTs}\n      }`
  }).join('\n')
}

function renderTs(relations: Relation[], enums: CheckEnum[], rpcs: Rpc[]): string {
  const tables = relations.filter((r) => r.kind === 'table')
  const views = relations.filter((r) => r.kind === 'view')

  const renderTableBlock = (t: Relation): string => {
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
  }

  // View 는 read-only — Supabase CLI 와 동일하게 Row + Relationships 만 노출 (Insert/Update 생략).
  const renderViewBlock = (v: Relation): string => {
    const rowFields: string[] = []
    for (const c of v.columns) {
      const tsType = pgToTs(c)
      const docLine = c.comment ? `        /** ${c.comment.replace(/\n/g, ' ').trim()} */\n` : ''
      rowFields.push(`${docLine}        ${c.name}: ${tsType}`)
    }
    return [
      `    ${v.name}: {`,
      `      Row: {`,
      rowFields.join('\n'),
      `      }`,
      `      Relationships: []`,
      `    }`,
    ].join('\n')
  }

  const tablesSection = tables.length > 0
    ? tables.map(renderTableBlock).join('\n')
    : ''
  const viewsSection = views.length > 0
    ? views.map(renderViewBlock).join('\n')
    : ''

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
//   type SalesMeta  = Database['public']['Views']['sales_with_meta_view']['Row']

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
${tablesSection}
    }
    Views: {
${viewsSection}
    }
    Functions: ${rpcs.length === 0 ? 'Record<string, never>' : `{
${renderTsRpcs(rpcs)}
    }`}
    Enums: ${enums.length === 0 ? 'Record<string, never>' : `{
${renderTsEnums(enums)}
    }`}
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
    const relations = await introspect(sql)
    const enums = await introspectCheckEnums(sql)
    const rpcs = await introspectRpcs(sql)
    const tableCount = relations.filter((r) => r.kind === 'table').length
    const viewCount = relations.filter((r) => r.kind === 'view').length
    log(`${tableCount} 개 테이블 + ${viewCount} 개 뷰 + ${enums.length} 개 CHECK enum + ${rpcs.length} 개 RPC 검출`)

    const goContent = renderGo(relations, enums, rpcs)
    const tsContent = renderTs(relations, enums, rpcs)

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
