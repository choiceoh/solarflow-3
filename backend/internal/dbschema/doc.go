// Package dbschema 는 PostgreSQL public.* 테이블의 컴파일타임 정본을 담는다.
//
// 파일 목록:
//   - tables.gen.go — `bun scripts/gen_db_types.ts` 가 자동 생성. 손편집 금지.
//   - doc.go        — 본 파일. 패키지 doc 만.
//
// 왜 분리됐나
//
// 도메인 패키지 (internal/domains/*/model.go) 의 Create*Request / Update*Request
// 구조체에는 validation 로직 (필수값, enum 허용 목록, 길이 제한) 이 붙어 있다.
// 이걸 DB 스키마와 함께 자동 생성하려면 사람이 쓴 검증 코드를 또 손으로 옮겨야
// 한다. 그러느니 *DB row 의 정본 표현* 만 generated 로 두고, 도메인 구조체는
// 손코딩으로 유지 — 양쪽의 책임을 분리했다.
//
// 사용 패턴 (PostgREST 호출 시 컬럼 typo 차단)
//
//	import "solarflow-backend/internal/dbschema"
//
//	// select 시 dbschema.BlShipmentsAllColumns 사용 — `*` 회피.
//	resp := client.From("bl_shipments").
//	    Select(dbschema.BlShipmentsAllColumns, "exact", false).
//	    Execute()
//
//	// 단일 컬럼 참조도 const — 오타가 컴파일타임에 잡힌다.
//	client.From("bl_shipments").Eq(string(dbschema.BlShipmentsColBlId), id)
//
// 스키마 갱신 흐름
//
// backend/migrations/NNN_*.sql 추가 → `bun scripts/apply_migrations.ts` 가
// 마이그 적용 → NOTIFY pgrst → gen_db_types.ts 자동 트리거. tables.gen.go 와
// frontend/src/types/db.gen.ts 가 함께 갱신된다. CI 는 PR 단계에서
// `bun scripts/gen_db_types.ts --check` 로 git diff 가 0 인지 검증한다.
package dbschema
