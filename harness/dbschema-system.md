# dbschema 시스템 — DB 정본을 코드에 묶는 자동 동기화

**목적**: PR #855·#865·#872·#874·#876·#877·#878·#879·#880·#881 로 도입된
DB 스키마 → Go/TS 타입 자동 생성 시스템의 reference. 이 시스템은 PGRST204
(스키마 캐시 불일치 500) 사고 패턴을 동기화 누락 자체가 불가능하도록 차단한다.

**대상 독자**: 이 프로젝트에서 DB 스키마/타입/PostgREST 쿼리를 손대는 모든
에이전트. 새 마이그레이션을 작성하기 전, 새 핸들러를 추가하기 전, frontend
type 을 손코딩하기 전에 본 문서를 먼저 읽는다.

## 1. 시스템 한 줄 요약

> `backend/migrations/*.sql` 가 정본 → `scripts/gen_db_types.ts` 가 운영 DB
> introspection 으로 `backend/internal/dbschema/tables.gen.go` 와
> `frontend/src/types/db.gen.ts` 를 생성 → `scripts/apply_migrations.ts` 가
> 마이그 적용 시 자동 트리거 → CI 의 `schema` 잡이 `--check` 로 drift 차단.

## 2. 흐름도

```
  ┌─────────────────────────────┐
  │ backend/migrations/NNN_*.sql │  ← 사람이 작성 (정본)
  └─────────────┬───────────────┘
                │ bun scripts/apply_migrations.ts
                ▼
  ┌─────────────────────────────┐
  │ Supabase DB (information_   │  ← apply 후 PostgREST NOTIFY pgrst
  │  schema + pg_views)         │
  └─────────────┬───────────────┘
                │ scripts/gen_db_types.ts (자동 호출)
                ▼
  ┌─────────────────────────────────────────────────────┐
  │ backend/internal/dbschema/tables.gen.go             │  ← Go 정본
  │   - Row 구조체 (per table+view)                      │
  │   - <Table>Col<Field> 컬럼명 상수                    │
  │   - <Table>AllColumns 콤마 join 문자열               │
  │                                                     │
  │ frontend/src/types/db.gen.ts                        │  ← TS 정본
  │   - Database['public']['Tables'][T]['Row'/'Insert'  │
  │     /'Update'] (Supabase CLI 호환)                  │
  │   - Database['public']['Views'][V]['Row']           │
  └─────────────────────────────────────────────────────┘
                │ git diff
                ▼
       PR 의 schema CI 잡이 --check 로 검증
```

## 3. 사용 패턴

### 3.1 Go — PostgREST 쿼리에서 컬럼 typo 차단

```go
import "solarflow-backend/internal/dbschema"

// .Eq / .Gte / .Lte / .In / .Order / .Not / .Is 등 모든 곳에 적용 가능
query.Eq(dbschema.BlShipmentsColPoId, poID)
query.Order(dbschema.OrdersColOrderDate, &postgrest.OrderOpts{Ascending: false})

// .Select() 의 column list 가 길면 AllColumns 변수 활용
.Select(dbschema.BlShipmentsAllColumns, "exact", false)
```

존재하지 않는 컬럼 (예: `dbschema.BlShipmentsColPoXxx`) 은 컴파일 실패.

### 3.2 TS — 손코딩 type 의 baseline 으로

```ts
import type { Database } from '@/types/db.gen'

type BLShipmentRow = Database['public']['Tables']['bl_shipments']['Row']
type SalesMeta    = Database['public']['Views']['sales_with_meta']['Row']

// UI 측은 narrow enum + join 컬럼을 더해 확장
export interface BLShipmentUI extends Omit<BLShipmentRow, 'status' | 'inbound_type'> {
  status: BLStatus  // 손코딩 union (CHECK enum 추출 전까지)
  inbound_type: InboundType
  // join + computed
  manufacturer_name?: string
  line_count?: number
}
```

### 3.3 Insert / Update

```ts
type BLShipmentInsert = Database['public']['Tables']['bl_shipments']['Insert']
// identity / has default / generated / nullable 컬럼은 자동 optional
```

View 는 read-only — `Insert`/`Update` 미노출 (Supabase CLI 동일 동작).

## 4. 새 마이그 작성 시 절차

CLAUDE.md 의 "DB 스키마 변경 시 절차" 와 동일:

```bash
# 1. 마이그 SQL 작성
echo '-- @auto-apply: yes' > backend/migrations/NNN_xxx.sql
# 내용 추가...

# 2. 적용 + codegen 자동
set -a && . backend/.env && set +a
bun scripts/apply_migrations.ts
# → apply → NOTIFY pgrst → gen_db_types.ts 트리거

# 3. 산출물 같이 커밋
git add backend/migrations/NNN_*.sql \
        backend/internal/dbschema/tables.gen.go \
        frontend/src/types/db.gen.ts
```

CI 의 `schema` 잡은 PR 단계에서 `bun scripts/gen_db_types.ts --check` 를 실행해
산출물이 운영 DB introspection 과 일치하는지 검증. 미커밋이면 PR 차단.

## 5. 알려진 한계

| 한계 | 영향 | 회피 / 향후 PR |
|---|---|---|
| **CHECK 제약 enum 미추출** | `status`, `inbound_type` 등이 DB 에서 narrow CHECK 인데 generator 는 string 으로 emit. 손코딩 `validXxxStatuses` (Go) 와 `XxxStatus` (TS) 가 정본을 중복. | 향후 PR: pg_constraint 정규식 파싱으로 narrow type 자동 생성. SQL: `CHECK ((col)::text = ANY (ARRAY['v1', ...]::text[]))` 패턴 |
| **RPC / 함수 시그너처 미포함** | `dashboard_kpi` 등 RPC 함수의 입력/출력 타입은 손코딩 | 향후 PR: pg_proc introspection |
| **FK 그래프 미생성** | Relationships 가 `[]` 로 emit. Supabase CLI 는 채움 | 향후 PR: pg_constraint contype='f' 분석 |
| **numeric 정밀도** | numeric/decimal → Go `float64`, TS `number` (Supabase CLI 동일). 금액(KRW)은 도메인 모델의 `int64` 가 정본 — Row 는 참조용 | 도메인 Create/Update Request 에서 int64 사용 (현재 패턴 유지) |
| **frontend 타입 narrowing 한계** | DB Row 가 `string` 으로 오는 enum 컬럼을 narrow union 으로 좁히려면 손 Omit 후 재선언 필요 | CHECK enum 추출이 해결책 (위 첫 행) |
| **sale 도메인 view 의존** | sales_with_meta view (마이그 094) 가 정본. base sales 테이블엔 business_date / receipt_status 등 미존재 | 이미 view 지원 — `dbschema.SalesWithMetaCol*` 사용 |

## 6. 자기 갱신 규칙

본 문서는 [`db-connectivity-report.md`](db-connectivity-report.md) 의 living
document 패턴 따른다. 다음 변경 시 본 문서도 갱신한다:

| 변경 | 갱신할 섹션 |
|---|---|
| generator 새 기능 (CHECK enum, RPC, FK 등) 추가 | § 1, § 3, § 5 |
| 새 dogfood 패턴 (예: Insert/Update 폼) | § 3 |
| 한계 해결 / 새 한계 발견 | § 5 |
| 흐름도 변화 (예: 새 cache layer) | § 2 |

## 7. PR 이력 (이 시스템의 진화)

| PR | 핵심 변경 |
|---|---|
| [#855](https://github.com/choiceoh/solarflow/pull/855) | 인프라 도입 — `gen_db_types.ts`, `apply_migrations.ts` hook, CI `schema` 잡 |
| [#865](https://github.com/choiceoh/solarflow/pull/865) | 79 테이블 초기 generated 산출물 |
| [#872](https://github.com/choiceoh/solarflow/pull/872) | 기존 `check_schema.sh` (macOS-only, stale 경로) → thin shim |
| [#874](https://github.com/choiceoh/solarflow/pull/874) | BL dogfood + 부수: untyped const + ci.yml schema filter 갭 + backend cache 축소 시도 |
| [#876](https://github.com/choiceoh/solarflow/pull/876) | PO/LC dogfood + backend CI cache 제거 (10m→16s) |
| [#877](https://github.com/choiceoh/solarflow/pull/877) | order/tt/product dogfood |
| [#878](https://github.com/choiceoh/solarflow/pull/878) | inventory/cost_detail/declaration/intercompany dogfood |
| [#879](https://github.com/choiceoh/solarflow/pull/879) | baro 5 핸들러 dogfood |
| [#880](https://github.com/choiceoh/solarflow/pull/880) | outbound dogfood (마지막 base-table 도메인) |
| [#881](https://github.com/choiceoh/solarflow/pull/881) | generator view 지원 + sale dogfood (전 도메인 완료) |

## 8. 트러블슈팅

### "generator 가 SUPABASE_DB_URL 미설정으로 skip"
로컬에서 codegen 하려면 `set -a && . backend/.env && set +a` 먼저.

### "schema CI 잡이 빨강"
1. PR 에 마이그 추가했는데 codegen 산출물 안 커밋한 경우 — 로컬에서
   `bun scripts/apply_migrations.ts` 다시 실행, 산출물 commit + push
2. repo secret `SUPABASE_DB_URL` 미설정 — Settings → Secrets and variables →
   Actions 에서 추가 (없으면 잡이 친절 skip 으로 통과)

### "backend CI 가 10m timeout"
`actions/cache` 가 ~/.cache/go-build 까지 캐시하면 1.9GB 까지 비대해져
gx10 (한국 자가호스팅) 다운로드가 막힌다. PR #876 이후 backend 잡은 cache
단계 자체를 제거 — gx10 로컬 디스크에 의존. **다시 actions/cache 를 추가하지
말 것** (또는 hash 키를 backend/go.sum 만으로 좁힐 것).

### "dbschema 패키지에 내가 추가한 컬럼이 없어 빌드 실패"
마이그가 운영 DB 에 적용 안 된 상태에서 산출물 미반영. 운영 cron-deploy 가
다음 회차에 자동 적용 + 산출물 갱신할 때까지 대기, 또는 로컬에서
`bun scripts/apply_migrations.ts` 강제 실행 (DB 자격 필요).

## 9. 참조

- 메인 README: 없음 (CLAUDE.md 의 "DB 스키마 변경 시 절차" 절이 사용자 진입점)
- DB 카탈로그: [`db-connectivity-report.md`](db-connectivity-report.md)
- 외부 자료 매핑: [`data-sources.md`](data-sources.md)
- 산출물 생성기: [`../scripts/gen_db_types.ts`](../scripts/gen_db_types.ts)
- 적용 hook: [`../scripts/apply_migrations.ts`](../scripts/apply_migrations.ts)
- thin shim: [`../backend/scripts/check_schema.sh`](../backend/scripts/check_schema.sh)
- CI 정의: [`../.github/workflows/ci.yml`](../.github/workflows/ci.yml) — `schema` 잡
