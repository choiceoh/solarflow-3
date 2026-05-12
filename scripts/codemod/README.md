# SolarFlow codemod 인프라

> **목적**: `harness/registry.yaml` + `harness/domains/*.yaml` 정본을 *생성된 코드/JSON* 으로 변환. 사람은 YAML 만 편집, 코드는 codemod 가 생성.
> **비전**: [harness/AGENT-BUILDER-VISION.md](../../harness/AGENT-BUILDER-VISION.md) PR-A 단계.
> **자매**: [.claude/hooks/README.md](../../.claude/hooks/README.md) (가드레일 훅), [harness/domains/README.md](../../harness/domains/README.md) (manifest 스펙).

---

## 디렉토리

```
scripts/codemod/
  package.json              # node 22+, deps: yaml only
  tsconfig.json             # JSDoc 타입 체크용 (IDE 보조)
  README.md                 # 본 파일
  lib/
    registry.mjs            # registry.yaml + manifest YAML 파서 (공통)
    util.mjs                # 마커 사이 교체, 파일 IO 헬퍼
  gen-registry.mjs          # codemod #1 — registry.yaml → backend/internal/tenant/registry.go
  build-hook-index.mjs      # codemod #2 — registry.yaml + harness/domains/*.yaml → .claude/hooks/domains.json
```

---

## 사용

### 첫 셋업 (한 번)

```bash
cd scripts/codemod
npm install
```

### 일상 — YAML 편집 후

```bash
cd scripts/codemod
npm run build-all          # gen-registry + build-hook-index 둘 다
```

또는 개별:

```bash
npm run gen-registry       # registry.yaml → registry.go (마커 사이 교체)
npm run build-hook-index   # registry.yaml + manifests → .claude/hooks/domains.json (전체 교체)
```

### CI / 행동 보존 검증

```bash
npm run verify             # build-all + git diff --exit-code (생성물 == 커밋된 상태)
```

머지 전에 verify 통과해야 함. PR-A 의 핵심 게이트.

---

## 메커니즘

### gen-registry — *마커 사이 교체*

`backend/internal/tenant/registry.go` 의 다음 마커 사이만 codemod 가 교체. 그 외 영역 (ID 상수, Group 상수, Registry struct, Detect 등) 은 손으로 유지.

```go
// AUTOGEN BEGIN: tenants — gen-registry.mjs 가 harness/registry.yaml 에서 생성. 손으로 편집 금지.
var defaultRegistry = &Registry{
    tenants: []Tenant{
        { ID: IDTopsolar, ... },
        ...
    },
}
// AUTOGEN END: tenants
```

마커 *없으면* codemod 가 에러 + 아무것도 안 씀 (안전).

### build-hook-index — *전체 교체*

`.claude/hooks/domains.json` 은 100% generated artifact. 첫 줄에 `_generated_by` 헤더 표시. 사람이 직접 편집하면 다음 codemod 실행 시 덮어씀.

소스:
- `harness/registry.yaml` 의 `domains:` 섹션 → 도메인 ID 목록
- `harness/domains/<id>.yaml` 각각 → `domains.<id>.{paths, blast_radius, verify_scripts, ...}`
- 누락된 manifest 가 있으면 fallback glob 으로 ID 식별만 표시
- `special_paths` (tenant registry 등) 는 본 codemod 안에 하드코딩 (script 자체가 정본)

---

### migrate-domain — 한 도메인을 `backend/internal/domains/<id>/` 으로 자동 이주 (PR-C)

기존 도메인 (model + handler 분산) → colocation 디렉토리.

```bash
node scripts/codemod/migrate-domain.mjs --id=warehouse
# → 6 파일 git mv + 자기 패키지 type prefix 일괄 제거
```

수동 후처리 (도메인별 다름): cross-package model prefix, utility dup (handlerutil/audit), cross-domain wire, main.go blank import, manifest 작성.

### new-domain — 새 도메인 scaffold (PR-D3)

NEW-TENANT-GUIDE.md 의 7단계 (산문) 를 1 명령으로 압축.

```bash
node scripts/codemod/new-domain.mjs \
  --id=warehouse \
  --display-name="창고 관리" \
  --pack=erp-core \
  --feature-id=tx.warehouse \
  --visible-to=all
```

생성:
- `backend/internal/domains/<id>/{model,handler,dashboard,handler_test}.go` (skeleton)
- `harness/domains/<id>.yaml` (manifest 템플릿)
- `harness/registry.yaml` 의 `domains:` 에 entry 추가
- `backend/main.go` 의 blank import 추가 (알파벳 순)

수동 후속: `backend/internal/feature/catalog.go` 의 `IDTx<Id>` 추가, model 필드, handler 라우트, migration, manifest 채우기.

---

## 추가 codemod 자리 (미래)

- `add-audit-columns.mjs` — 모든 도메인 model 에 `created_by/updated_by` 일괄 추가
- `rename-handler-prefix.mjs` — handler 패키지의 남은 `tx_*.go` → 도메인 이주 후 정리

---

## 안티-패턴

- ❌ 생성물 (`registry.go` 마커 사이, `.claude/hooks/domains.json`) 직접 편집 — 다음 codemod 실행 시 덮어씀
- ❌ codemod 안에 *비즈니스 로직* 두기 — 순수 변환만
- ❌ codemod 가 *외부 네트워크/DB* 접근 — 결정성 보장
- ❌ codemod 출력에 *비결정적 데이터* (timestamp, random id 등) — verify 깨짐
