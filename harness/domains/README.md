# 도메인 Manifest 디렉토리

> **목적**: 한 도메인의 모든 *진입점 데이터* (paths, blast_radius, verify_scripts, depends_on) 를 1개 YAML 에 집약.
> **왜**: [AGENT-BUILDER-VISION.md](../AGENT-BUILDER-VISION.md) — AI 에이전트가 흩어진 도메인 코드를 *manifest 1번 read* 로 전체 파악.
> **자매**: [registry.yaml](../registry.yaml) (테넌트/도메인 매트릭스 — 식별만)

---

## 디렉토리 구조

```
harness/domains/
  README.md               # 본 파일 (manifest 스펙)
  po.yaml                 # PO 시범 (T+0, 이 PR)
  bl.yaml                 # PR-C
  lc.yaml                 # PR-C
  tt.yaml                 # PR-C
  declaration.yaml
  products.yaml
  inventory.yaml
  price_benchmark.yaml
  order.yaml
  sale.yaml
  receipt.yaml
  outbound.yaml
  cost_detail.yaml
  baro_incoming.yaml
  baro_quote.yaml
  intercompany.yaml
```

---

## Manifest 스펙

```yaml
schema_version: 1
id: <domain-id>                # 소문자, snake_case
display_name: "사람이 읽는 이름"

# === Pack / Feature / Tenant 배선 ===
pack: <pack-id>                # erp-core | module-finance | baro-domain | study-domain
feature_id: <feature.id>       # backend/internal/feature/catalog.go 의 ID 상수와 동일 도트 표기
visible_to: <group-id>         # registry.yaml 의 group, 또는 명시적 [tenant_id, ...]

# === 코드 위치 (T+0 vs PR-B colocation 후) ===
paths:
  backend: [...]               # T+0: backend/internal/{model,handler}/, PR-B: backend/internal/domains/<id>/
  frontend: [...]              # T+0: frontend/src/packs/<pack>/pages/, PR-B: frontend/src/domains/<id>/
  migrations: [...]            # backend/migrations/ glob (도메인 소유 마이그)
  tests: [...]                 # 테스트 파일 위치

# === DB ===
tables: [...]                  # check_schema.sh 매칭 대상
views: [...]                   # PostgREST view (있으면)

# === Cross-domain 의존 ===
depends_on: [...]              # 다른 도메인 ID. blast_radius 자동 계산 입력.

# === Blast Radius ===
blast_radius:
  - description: "변경 시나리오 한 줄"
    must_check:
      - "이 변경이 발생하면 같이 봐야 할 파일/검증/문서"
      # ... 5개 이내 권장 (에이전트 컨텍스트 부담)

# === 자동 검증 ===
verify_scripts:
  - command: "..."             # 실제 실행할 명령 (PR-B 부터)
    when: always | model_or_migration_changed | handler_changed | frontend_changed | route_changed

# === API 라우트 ===
api_routes:                    # feature catalog Paths 와 동기화 필수
  - "GET /api/v1/..."

# === Backfill / Maintenance ===
maintenance_scripts:
  - script: scripts/...
    purpose: "한 줄 설명"

owners: [...]                  # GitHub username
decisions: [D-XXX, ...]        # 관련 D-결정 ID
```

---

## Manifest 작성 절차

### 이 PR (T+0) — 수동
1. `harness/domains/<id>.yaml` 직접 작성 (po.yaml 을 템플릿으로)
2. `.claude/hooks/domains.json` 의 `domains.<id>` 섹션 손으로 동기화
3. `harness/registry.yaml` 의 `domains:` 에 1줄 추가

### PR-A 이후 — codemod
1. `bun run new-domain --id=<id>` 가 스켈레톤 YAML 생성
2. 본 README 스펙대로 채움
3. `bun run codemod build-hook-index` 가 `.claude/hooks/domains.json` 재생성
4. `harness/registry.yaml` 갱신은 codemod 가 처리 (또는 manual review PR)

---

## v1 (이 PR) ↔ v2 (PR-A) ↔ v3 (PR-B+) 진화

| 시점 | manifest 작성 | hooks DB 생성 | hook 동작 | 코드 위치 |
|---|---|---|---|---|
| **v1 (이 PR)** | 수동, PO 1개만 | `.claude/hooks/domains.json` 수동 | advisory (exit 0) | 현재 (model/handler 분리) |
| **v2 (PR-A)** | 수동, 모든 도메인 | codemod 자동 (`build-hook-index.ts`) | advisory | 현재 그대로 |
| **v3 (PR-B)** | 수동, 모든 도메인 | codemod 자동 | STRICT (실 실행, 실패 시 차단) | `backend/internal/domains/<id>/` 으로 colocation |

각 단계가 *되돌릴 수 있는 크기*. 한 단계 평가 → 다음.

---

## 스펙 변경 시

`schema_version` 을 올린다. `build-hook-index.ts` (PR-A) 가 schema_version 별 파서 갈래를 가짐 — 기존 manifest 깨지 않음.

호환성 분기점:
- v1 (이 PR): 본 README 의 형식
- v2 (PR-B 후): `paths.backend` 가 `backend/internal/domains/<id>/` 하나로 통합 (colocation)

---

## 안티-패턴

- ❌ manifest 에 *실행 가능한 로직* 두지 말 것 (예: 분기 조건, 환경 변수) — 순수 메타데이터만
- ❌ blast_radius 를 너무 잘게 쪼개지 말 것 (5개 이내) — 에이전트 컨텍스트 비용
- ❌ paths 에 *모든 관련 파일* 나열 금지 — 도메인 *진입점* 만 (대표 model/handler/page)
- ❌ verify_scripts 에 *blocking* 명령 (v1 기준) — 항상 advisory
- ❌ 도메인 ID 에 하이픈/대문자/공백 — `snake_case` 만
