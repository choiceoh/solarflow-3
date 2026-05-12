# Claude Code 가드레일 훅

> **목적**: AI 에이전트의 코드 변경 시 *blast radius* 알림 + 자동 검증 트리거.
> **상태**: v1 (advisory, exit 0 보장). PR-B 부터 STRICT 단계.
> **비전**: [harness/AGENT-BUILDER-VISION.md](../../harness/AGENT-BUILDER-VISION.md)

---

## 메커니즘

1. **PreToolUse (Edit|Write|MultiEdit)** → `pre-edit.mjs`
   - 변경 대상 path 의 도메인 식별 (`domains.json` lookup)
   - 해당 도메인의 `blast_radius` + `depends_on` 를 **stderr** 로 출력
   - Claude Code 가 stderr 를 system 컨텍스트로 인지 → 에이전트가 *변경 직전* 인지

2. **PostToolUse (Edit|Write|MultiEdit)** → `post-edit.mjs`
   - 변경 path 의 도메인 식별
   - 해당 도메인의 `verify_scripts` 권장 명령을 stderr 로 출력
   - v1 은 *알림만*. PR-B 부터 STRICT_RULES=1 로 실 실행 + 실패 시 차단.

**런타임**: Node 18+ ESM. zero dependency. bun 도 동일 파일 실행 가능 (bun .mjs 도 지원).

---

## 데이터 정본

[`.claude/hooks/domains.json`](domains.json) — path glob → domain → blast_radius / verify_scripts.

**v1 (이 PR) 상태**:
- 수동 작성
- `domains.po` 만 **full manifest** (blast_radius / verify_scripts 풍부)
- 나머지 도메인 (bl, lc, tt, products, inventory, ...) 은 `path_to_domain_fallback` 으로 *ID 식별만*
- `special_paths` 로 tenant registry, feature catalog 같은 *cross-cutting* 파일도 알림

**PR-A (codemod 인프라)**:
- `scripts/codemod/build-hook-index.ts` 가 `harness/registry.yaml` + `harness/domains/*.yaml` 에서 `domains.json` 을 *자동 생성*
- 사람은 YAML manifest 만 편집. `domains.json` 은 generated artifact.

**PR-C (전 도메인 manifest)**:
- 모든 도메인이 `harness/domains/<id>.yaml` 갖춤. fallback 매핑 제거.

---

## 디버깅

훅을 단독 실행 (stdin 으로 입력 JSON 주입):

```powershell
# Windows PowerShell
'{"tool_name":"Edit","tool_input":{"file_path":"backend/internal/model/po.go"}}' `
  | node .claude/hooks/pre-edit.mjs
```

```bash
# bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"backend/internal/model/po.go"}}' \
  | node .claude/hooks/pre-edit.mjs
```

기대 출력 (stderr):
```
[domain] po — 발주 (Purchase Order)
  feature: tx.po
  의존 도메인: products, inventory, lc, tt
  같이 봐야 할 곳:
  - PO model 필드 추가/삭제 → handler.go Validation + frontend ProcurementPage form 타입 + ...
  ...
```

---

## 실패 모드

훅은 *항상 exit 0*. 다음 경우에도 Claude 도구 호출을 막지 않음:
- `domains.json` 읽기 실패 (파일 없음/JSON 깨짐) → 침묵
- `tool_input.file_path` 없음 → 침묵
- 도메인 매칭 없음 → 침묵
- bun 실행 실패 → Claude Code 가 hook 자체 실패로 처리하지만 도구 호출은 계속

- node 실행 실패 (node 18 미만/없음) → Claude Code 가 hook 자체 실패로 처리하지만 도구 호출은 계속

**현재 의도된 동작**: 알림이 도움 안 되면 *무시되고 끝*. 신호가 정확해질 때까지 (PR-A/PR-B) 차단 권한을 부여하지 않음.

---

## v1 → v2 → v3 진화

| 단계 | 데이터 정본 | Pre 출력 | Post 동작 | 도메인 커버리지 |
|---|---|---|---|---|
| **v1 (이 PR)** | `domains.json` 수동 | stderr advisory | 명령 출력만 | PO 1개 full + glob fallback |
| **v2 (PR-A)** | `domains.json` codemod 생성 | stderr advisory | 명령 출력만 | 모든 도메인 |
| **v3 (PR-B)** | `domains.json` codemod 생성 | system context injection | 실 실행 + 실패 시 차단 | 모든 도메인 + manifest 정밀 매칭 |

각 단계가 *되돌릴 수 있는 크기*. 단계 사이 평가 → 다음 PR.

---

## 안티-패턴

- ❌ 훅을 *자동 코드 수정* 도구로 쓰지 말 것 (예: 자동 포매팅) — 그건 별도 도구의 책임
- ❌ `domains.json` 에 *비즈니스 로직* 넣지 말 것 — 메타데이터만
- ❌ blast_radius 를 길게 늘어놓지 말 것 (5개 이내) — 에이전트 컨텍스트 부담
- ❌ verify_scripts 에 *blocking* 명령 넣지 말 것 (v1 기준) — 항상 advisory
