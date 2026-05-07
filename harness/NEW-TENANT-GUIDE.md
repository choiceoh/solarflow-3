# 새 도메인 (테넌트) 추가 가이드

> **목적**: 새 도메인 (예: `gx10.topworks.ltd`) 을 SolarFlow 에 추가하는 절차를 한 페이지로 정리.
> **근거**: [D-145](DECISIONS.md#d-145) 테넌트 모듈화 시리즈 (PR #574, #577, #583, #589, #592, #601, #604, #616, #619, #621, #624, #626, #629, #632).
> **목표**: 코드 변경을 최소화 — 기존 226+ 군데 손대던 작업을 **registry 1줄 + 마이그 1개 + 디렉토리 1개 + admin UI 토글**로 압축.

---

## 0. 사전 결정 (작업 전)

| 항목 | 예시 (gx10) | 비고 |
|---|---|---|
| 테넌트 ID | `gx10` | 소문자 alphanumeric. user_profiles.tenant_scope, tenant_features.tenant 의 CHECK 값 |
| Display Name | `GX10 (주)` | admin UI / `/me` 응답에 노출 |
| Host Patterns | `^gx10\.`, `^gx10-` | 정규식. 소문자 매칭 (Detect 가 lowercase) |
| 기존 pack 활용 | `erp-core` 활성 + `module-finance` 또는 `baro-domain` | 새 pack 이 필요한지 결정 (대부분 기존 pack 으로 충분) |
| 추가 도메인 전용 화면? | 보통 없음 | 있으면 `packs/<id>/` 신설 (4단계) |

---

## 1. Backend — Registry + DB 마이그

### 1-1. `backend/internal/tenant/registry.go` 갱신

`defaultRegistry.tenants` 에 객체 1개 추가:

```go
{
    ID:           "gx10",
    DisplayName:  "GX10 (주)",
    HostPatterns: []string{`^gx10\.`, `^gx10-`},
    Groups:       []Group{GroupAll},  // 또는 GroupAll + GroupModule
},
```

**Groups 결정**:
- `GroupAll` — 모든 테넌트 공통 기능 (마스터, 가용재고, 수주/출고/수금)
- `GroupModule` — module 계열 (수입/금융 — `tx.po`, `tx.lc`, `tx.bl` 등 자동 활성)

해당 `tenant.IDsInGroupAsStrings(GroupModule)` 가 catalog 의 `TenantSetModule` 로 파생되므로, 새 테넌트가 그룹에 속하면 그 그룹의 default features 가 자동 활성.

### 1-2. DB 마이그레이션 1개

`backend/migrations/NNN_<id>_tenant.sql` (NNN = 기존 최대 + 1):

```sql
-- @auto-apply: yes
-- D-145 후속: <ID> 테넌트 추가
-- tenant_features / tenant_data_scopes / user_profiles 의 CHECK 제약 갱신.

ALTER TABLE tenant_features
  DROP CONSTRAINT tenant_features_tenant_check,
  ADD CONSTRAINT tenant_features_tenant_check
    CHECK (tenant IN ('topsolar', 'cable', 'baro', 'gx10'));

ALTER TABLE tenant_data_scopes
  DROP CONSTRAINT tenant_data_scopes_tenant_check,
  ADD CONSTRAINT tenant_data_scopes_tenant_check
    CHECK (tenant IN ('topsolar', 'cable', 'baro', 'gx10'));

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_tenant_scope_check,
  ADD CONSTRAINT user_profiles_tenant_scope_check
    CHECK (tenant_scope IN ('topsolar', 'cable', 'baro', 'gx10'));
```

### 1-3. 검증

```bash
cd backend && go test ./internal/tenant/...   # registry 테스트
cd backend && go test ./internal/feature/...  # 카탈로그 그룹 파생
cd backend && go test ./internal/router/...   # snapshot 무변동 (행동 보존)
```

`registry_test.go` 의 `TestNewRegistry_PoC` 패턴이 4번째 테넌트 추가 절차의 unit 검증 reference.

---

## 2. Frontend — Pack 활성

### 2-1. 기존 pack 활용 (일반적)

신규 코드 0. 그저 admin UI (3 단계) 에서 어떤 pack/feature 를 켤지 토글.

### 2-2. 도메인 전용 화면이 필요한 경우

`frontend/src/packs/<id>/` 디렉토리 신설:

```
frontend/src/packs/gx10/
  nav.ts             # NAV 항목 정의 (Pack 객체 export)
  pages/             # 도메인 전용 페이지들 (lazy import 대상)
    SomePage.tsx
```

**`packs/<id>/nav.ts` 모양**:

```ts
import { SomeIcon } from 'lucide-react';
import type { Pack } from '../types';

export const GX10_PACK: Pack = {
  id: 'gx10' as const,
  label: 'GX10 도메인',
  description: '...',
  navItems: [
    { key: 'gx10-some', label: '...', abbr: '...', path: '/gx10/some',
      icon: SomeIcon, menu: '...', group: '판매',
      feature: 'gx10.some' },  // 또는 feature 미지정 + tenants: ['gx10']
  ],
};
```

**`packs/index.ts` 갱신**:

```ts
import { GX10_PACK } from './gx10/nav';
export const ALL_PACKS: readonly Pack[] = [
  ERP_CORE_PACK,
  MODULE_FINANCE_PACK,
  BARO_DOMAIN_PACK,
  GX10_PACK,  // ← 추가
];
```

**`packs/types.ts` 의 PackID union 갱신**:

```ts
export type PackID = 'erp-core' | 'module-finance' | 'baro-domain' | 'gx10';
```

### 2-3. NAV 항목별 backend feature 매핑

가시성 정본은 `enabled_features`. 새 NAV 항목이 가지는 두 가지 모양:

- **catalog 에 등록된 feature** — `feature: 'gx10.some'` 매핑. backend `feature.Catalog` 에 entry 추가 ([D-120](DECISIONS.md#d-120) 절차) + `harness/FEATURE-WIRING-MATRIX.md` 갱신.
- **frontend-only** (D-127 처럼 backend 라우트 없는 화면) — catalog entry 에 `FrontendOnly: true` 표시. Paths 빈 배열 OK.

`tenants: ['gx10']` 인라인은 fallback 으로만 사용 (catalog 미정의 임시 페이지).

---

## 3. Admin UI 활성화

`/settings/feature-wiring` 에서 새 도메인 row 가 자동으로 보임 (registry 에서 파생). 각 feature 의 셀이 default 활성 여부에 따라 ✓ / — 표시. 필요한 토글:

- **Pack 헤더의 "모두 ✓ / 모두 —"** 버튼으로 그 pack 의 모든 features 일괄 토글
- **개별 feature 셀 클릭** 으로 세밀 제어
- 토글은 즉시 `tenant_features` 에 upsert + `feature_wiring_audit` 기록

운영자가 코드 보지 않고 도메인 입맛에 맞게 sidebar 구성.

---

## 4. 운영 인프라

### 4-1. DNS / Cloudflare Pages

- Cloudflare DNS 에 `gx10` CNAME → `topworks-module-git.pages.dev` (또는 운영 인프라 동일)
- Pages 프로젝트에 `gx10.topworks.ltd` 커스텀 도메인 연결

### 4-2. Backend CORS

운영 `backend/.env` 의 `CORS_ORIGINS` 에 `https://gx10.topworks.ltd` 추가, Go 서비스 재시작.

### 4-3. 사용자 등록

신규 사용자는 `user_profiles.tenant_scope = 'gx10'` 으로 지정.
신규 자동 프로비저닝은 호환을 위해 계속 `topsolar` 로 시작 (admin 이 명시 변경).

---

## 5. 문서 갱신

| 파일 | 갱신 내용 |
|---|---|
| `harness/<id>.md` 신설 | 도메인별 인덱스 (운영 컨텍스트, 활성 메뉴, 관련 결정, 운영 메모) — 기존 [module.md](module.md) / [baro.md](baro.md) / [cable.md](cable.md) 양식 |
| `harness/PROGRESS.md` 헤더 | 프론트엔드 줄에 운영 도메인 목록 갱신 |
| `harness/CLAUDE.md` (이 worktree) | "도메인별 인덱스" 섹션에 한 줄 추가 |
| `harness/DECISIONS.md` | 격리 강도가 기존과 다르거나 새 데이터 스코프 정책이라면 D-NNN 추가 |

---

## 6. 검증 체크리스트

### 6-1. 단위 테스트

```bash
# backend
cd backend
go build ./... && go vet ./...
go test ./...

# frontend
cd frontend
npm ci && npm run build
npm run test
npm run lint
```

### 6-2. 수동 검증 (스모크)

- [ ] DB 마이그레이션 적용 후 `tenant_features` / `tenant_data_scopes` / `user_profiles` insert 로 새 ID 통과 확인
- [ ] 새 호스트로 접속 → `/api/v1/users/me` 응답에 `tenant_id: 'gx10'`, `enabled_features: [...]` 확인
- [ ] sidebar 항목이 admin 토글대로 표시되는지
- [ ] module/baro 의 격리 깨지지 않는지 (다른 호스트에서 새 도메인 features 누설 없는지)

---

## 7. 자주 빠뜨리는 부분

1. **DB CHECK 갱신** 안 하면 user_profiles INSERT 가 실패 — 사용자 자동 프로비저닝이 안 됨
2. `tenant_features` 의 CHECK 갱신 안 하면 admin UI 매트릭스에서 토글 시 500
3. `harness/FEATURE-WIRING-MATRIX.md` 갱신 누락 → `TestMatrixConsistency` 실패
4. catalog entry 의 `FrontendOnly` 표시 누락 → `TestCatalog_PathsNonEmpty` 실패 (frontend-only 인데 Paths 비어 있음)
5. `packs/types.ts` 의 PackID union 갱신 누락 → TS 타입 에러
6. CORS 누락 → 운영 환경에서 401 / network error

---

## 8. 참고 — 기존 도메인 추가 사례

- **2026-05-03 cable 추가** ([D-119](DECISIONS.md#d-119)): 226+ 군데 손댐 (모듈화 전).
- **2026-05-07 D-145 시리즈**: 위 절차로 압축 — registry 1줄 + 마이그 + admin UI.
- **PoC 검증**: `backend/internal/tenant/registry_test.go` 의 `TestNewRegistry_PoC` 가 4번째 테넌트 (`gx10`) 추가 시나리오를 단위 테스트로 시연.
