# SolarFlow 3.0 — 운영 서버 (Production)

운영은 **Linux 워크스테이션** 1대 (`gx10-f96e`) + **Cloudflare Pages**(프론트) + **Supabase**(DB) 조합. CLAUDE.md의 "macOS 프로덕션 워크스테이션" 표기는 과거 흔적이며 현재 **운영 서버는 macOS가 아니다**. macOS 런북(launchctl/codesign)은 이 박스에 적용되지 않는다.

## 하드웨어 / OS

| 항목 | 값 |
|---|---|
| Hostname | `gx10-f96e` |
| Vendor | ASUSTeK GX10 |
| OS | Ubuntu 24.04.4 LTS |
| Kernel | Linux 6.11.0-1016-nvidia |
| Arch | aarch64 (arm64) |
| CPU | 20 코어 |
| RAM | 121 GiB |
| 작업 디렉토리 | `/home/choiceoh/공개/solarflow-3` |
| 사용자 | `choiceoh` (uid 1000) |

## 서비스 토폴로지

```
                  Cloudflare CDN
                  ├── module.topworks.ltd ──→ Cloudflare Pages (auto-deploy from main)
                  ├── cable.topworks.ltd  ──→ Cloudflare Pages (same project/custom domain)
                  ├── baro.topworks.ltd   ──→ Cloudflare Pages (same project/custom domain)
                  ├── study.topworks.ltd  ──→ Cloudflare Pages (same project/custom domain)
                  └── api.topworks.ltd    ──→ cloudflared tunnel ──→ Linux:8080
                                                                      │
   Linux box (gx10-f96e)                                              ▼
   ┌──────────────────────────────────────────────────────────┐   solarflow-go
   │ solarflow-go.service       :8080  (Go API gateway)       │   │
   │ solarflow-engine.service   :8081  (Rust 계산엔진, 내부)  │◀──┤
   │ cloudflared-solarflow      tunnel(api.topworks.ltd→8080) │   │
   │ OCR sidecar (Python)       Go가 자식 프로세스로 spawn    │◀──┘
   └──────────────────────────────────────────────────────────┘
                                ↓ SUPABASE_DB_URL (PG pooler)
                       Supabase (aalxpmfnsjzmhsfkuxnp)
                       └── Supabase Auth, Storage, PostgREST(:hosted)
```

- **프론트엔드는 이 박스에서 서빙하지 않는다.** `module.topworks.ltd`, `cable.topworks.ltd`, `baro.topworks.ltd`, `study.topworks.ltd`는 같은 Cloudflare Pages 프로젝트가 main 브랜치 push 시 자동 빌드/배포. 이 박스의 `frontend/dist/`는 로컬 개발/검증용일 뿐 운영 노출과 무관.
- 8080은 cloudflared 터널을 통해서만 외부에 보이고, 8081은 같은 박스 안에서 Go가 호출하는 사내 포트.

## systemd user 서비스 (4개)

전부 user-mode (`systemctl --user`). 부팅 시 자동 시작 (enabled).

| 서비스 | 유닛 파일 | 워킹 디렉토리 | 환경변수 파일 | 실행 바이너리 |
|---|---|---|---|---|
| `solarflow-go.service` | `~/.config/systemd/user/solarflow-go.service` | `backend/` | `backend/.env` | `backend/solarflow-go` |
| `solarflow-engine.service` | `~/.config/systemd/user/solarflow-engine.service` | `engine/` | `engine/.env` | `engine/target/release/solarflow-engine` |
| `cloudflared-solarflow.service` | `~/.config/systemd/user/cloudflared-solarflow.service` | - | - | `~/.local/bin/cloudflared --config ~/.cloudflared/solarflow.yml tunnel run solarflow` |
| `solarflow-webhook.service` | `~/.config/systemd/user/solarflow-webhook.service` | repo root | `.webhook.env` | `python3 scripts/webhook-deploy.py` (포트 9999) |

의존성: `solarflow-go.service`는 `Wants=solarflow-engine.service` (D-123 약결합) — 엔진이 먼저 뜨면 좋지만 강제 아님. 엔진 재시작이 Go 재시작을 유발하지 않고, Go 의 EngineClient.doWithRetry 가 단절을 가린다. unit 파일 정본은 [`ops/systemd/`](../ops/systemd) 에 커밋돼 있다. 운영 박스에는 모든 SolarFlow user service에 `ops/systemd/stability.conf` drop-in을 적용해 5분에 5회까지만 재시작하고, journald는 `ops/systemd/90-solarflow-journald-limits.conf`로 system 1GB / runtime 256MB 상한을 둔다.

기본 명령:
```bash
systemctl --user status solarflow-go.service
systemctl --user restart solarflow-go.service
journalctl --user -u solarflow-go.service -n 100 -f
```

## 자동 git 동기화 + 빌드/재시작

**1차 트리거 — GitHub webhook (즉시):**

main 브랜치 push 시 GitHub이 `https://api.topworks.ltd/__webhook/deploy`로 POST → cloudflared가 `solarflow-webhook.service`(:9999)로 라우팅 → HMAC-SHA256 서명 검증 → `cron-deploy.sh` 비동기 실행. 보통 push 후 수 초 안에 빌드 시작.

- GitHub hook id: `615205825` (push 이벤트만)
- Webhook receiver 소스: `scripts/webhook-deploy.py`
- 비밀: `.webhook.env`의 `WEBHOOK_SECRET` (gitignore, chmod 600). GitHub repo의 webhook 설정값과 동일해야 함.

**2차 백업 — crontab (매 10분):**

```
*/10 * * * * /home/choiceoh/공개/solarflow-3/scripts/cron-deploy.sh >> .sync.log 2>&1
```

webhook이 일시적으로 빠지거나 GitHub이 못 닿아도 늦어도 10분 안에는 반영. cron-deploy.sh는 `git pull` 후 변경 컴포넌트만 빌드/재시작 (자세한 동작은 스크립트 헤더 주석 참조).

## Cloudflared 터널

설정: `~/.cloudflared/solarflow.yml`
```yaml
tunnel: acb8423e-2aa5-4dd6-8c6e-346f15c32ac4
credentials-file: ~/.cloudflared/acb8423e-2aa5-4dd6-8c6e-346f15c32ac4.json
ingress:
  - hostname: api.topworks.ltd
    service: http://localhost:8080
  - service: http_status:404
```

이 박스는 **API만** 외부 노출. 다른 도메인(`module.topworks.ltd`, `cable.topworks.ltd`, `baro.topworks.ltd`, `solarflow3.com` 등)은 이 박스에서 처리하지 않음.

## 데이터베이스

- **Supabase 호스팅** PostgreSQL — `aalxpmfnsjzmhsfkuxnp.supabase.co` (서울 리전 pooler: `aws-1-ap-northeast-2.pooler.supabase.com:5432`)
- Go 백엔드는 `SUPABASE_URL`/`SUPABASE_KEY`로 PostgREST/Auth 호출, Rust 엔진은 `SUPABASE_DB_URL`로 PG 직접 연결(sqlx 풀)
- `psql` **미설치**. 마이그레이션은 `bun scripts/apply_migrations.ts` (Bun.SQL) 로 적용. 임시 작업이 필요하면 Bun 으로 inline:
  ```bash
  cd ~/공개/solarflow-3
  set -a; source backend/.env; set +a
  bun -e "
  import { SQL } from 'bun';
  const sql = new SQL(process.env.SUPABASE_DB_URL);
  await sql.unsafe(await Bun.file('backend/migrations/NNN_xxx.sql').text());
  await sql.end();
  "
  ```
- PostgREST 캐시 갱신: `NOTIFY pgrst, 'reload schema'` (호스팅 PostgREST는 이걸 받아 자동 리로드)

## 배포 절차 (이 박스에서)

### 백엔드 변경 (Go)
```bash
cd ~/공개/solarflow-3/backend
go build -o solarflow-go .
# Zero-downtime reload (D-123): tableflip Upgrader fork+exec → 자식이 listener fd 인계.
# ExecReload 가 unit 에 정의돼 있어야 동작. 없으면 평이한 restart 로 폴백.
systemctl --user reload-or-restart solarflow-go.service
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/health   # 200 확인
```

### 엔진 변경 (Rust)
```bash
cd ~/공개/solarflow-3/engine
cargo build --release
systemctl --user restart solarflow-engine.service
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/health   # 200 확인
```

엔진 재시작 시 Go 는 영향받지 않는다 (D-123 `Wants=` 약결합). 엔진은 `with_graceful_shutdown` 으로 in-flight 계산을 드레인하고, 그 사이 Go 의 EngineClient.doWithRetry 가 listener 단절을 가린다.

### 프론트엔드 변경
이 박스에서는 빌드/재시작 불필요. main에 push되면 **Cloudflare Pages**가 자동 빌드·배포한다 (1~2분). 이 박스의 `frontend/dist/`는 운영 노출 경로가 아니다.

### DB 마이그레이션

기본 워크플로는 **자동 적용 (안전 추정 기본)**. `cron-deploy.sh` 가 webhook/cron 회차에 `scripts/apply_migrations.ts` 를 호출해 미적용 파일을 결정 → 적용한다 (Bun.SQL 기반, Python venv 의존 없음).

**자동 적용 결정 (3단계 fallthrough)**:
1. 파일 첫 10줄에 `-- @auto-apply: yes` → 적용 (작성자가 명시적으로 허용)
2. 파일 첫 10줄에 `-- @auto-apply: no` → SKIP (작성자가 명시적으로 차단 — 운영자가 시점/순서 통제)
3. 헤더 없음 → 본문 정적 분석:
   - 위험 키워드(`DROP TABLE/COLUMN/CONSTRAINT/INDEX/FUNCTION/TRIGGER/VIEW/SCHEMA/TYPE`, `RENAME TO/COLUMN/CONSTRAINT`, `TRUNCATE`, `DELETE FROM`) 감지 시 SKIP
   - 위 키워드 없음 → 적용 (CREATE … IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, GRANT, COMMENT, INSERT … ON CONFLICT 등 idempotent 마이그레이션이 보통 여기 해당)

**규약**:
- 추적 테이블: `public.schema_migrations(filename PK, applied_at)` — 적용 이력 기록.
- 각 파일은 단일 트랜잭션에서 적용 → 실패 시 자동 ROLLBACK + Go 재시작 보류 (DB 정합 우선).
- 마지막에 `NOTIFY pgrst, 'reload schema'` 자동 발송.
- 적용 직후 `scripts/verify_migration.ts` 로 변경된 migration 파일을 재확인한다. 확인 실패 시 Go 재시작을 보류한다.

**작성자 가이드**:
- 안전한 마이그레이션(idempotent + 위험 키워드 없음)은 헤더 없이 그대로 두면 자동 적용된다 — 일반적인 신규 테이블/컬럼 추가가 여기 해당.
- 위험 키워드를 어쩔 수 없이 써야 하는데 *안전하게 idempotent* 한 경우(예: `DROP CONSTRAINT IF EXISTS ... ; ADD CONSTRAINT ...` 패턴)는 명시적으로 첫 줄에 `-- @auto-apply: yes` 헤더를 붙여 정적 분석 SKIP을 override.
- 파괴적/대용량/락 긴 마이그레이션(`TRUNCATE`, 큰 테이블 `DROP COLUMN`, 다단계 데이터 마이그레이션)은 `-- @auto-apply: no` 헤더로 명시 차단하고 운영자가 시점/순서 통제하며 수동 적용 — 정적 분석으로 잡히긴 하지만 헤더로 의도를 문서화.

**수동 적용 (`-- @auto-apply: no` 파일 / 긴급 적용 / 검증)**:
```bash
cd ~/공개/solarflow-3
set -a; source backend/.env; set +a
bun scripts/apply_migrations.ts    # 자동 결정대로 모든 미적용 파일 일괄

# 또는 자동 차단된 한 파일만 명시적으로:
bun -e "
import { SQL } from 'bun';
const sql = new SQL(process.env.SUPABASE_DB_URL);
const file = 'NNN_xxx.sql';
const text = await Bun.file('backend/migrations/' + file).text();
await sql.begin(async (tx) => {
  await tx.unsafe(text);
  await tx\`INSERT INTO public.schema_migrations (filename) VALUES (\${file}) ON CONFLICT DO NOTHING\`;
});
await sql.unsafe(\"NOTIFY pgrst, 'reload schema'\");
await sql.end();
"
```

**반영 확인**:
```bash
bun scripts/verify_migration.ts 091_price_benchmark_review_status.sql
```

확인 순서:
1. `public.schema_migrations` 에 filename 적용 이력이 있는지 확인
2. preset 또는 CLI 옵션으로 지정한 column / constraint / index 존재 여부 확인
3. `NOTIFY pgrst, 'reload schema'` 발송 후 PostgREST REST 응답에서 새 column select 가 가능한지 확인

`091_price_benchmark_review_status.sql` 은 built-in preset 으로 `price_benchmarks.review_status`,
`price_benchmarks_review_status_check`, `idx_price_benchmarks_review_status`,
PostgREST `price_benchmarks.review_status` 노출을 모두 확인한다. 새 migration 은 필요 시:

```bash
bun scripts/verify_migration.ts 092_xxx.sql \
  --column some_table.some_column \
  --constraint some_table.some_check \
  --index idx_some_table_some_column \
  --postgrest some_table.some_column
```

CLAUDE.md의 macOS 절차(`launchctl`, `codesign`)는 적용되지 않는다.

## 환경변수

### `backend/.env` (gitignore됨)
| 키 | 용도 |
|---|---|
| `SUPABASE_URL` | Supabase REST/Auth base URL |
| `SUPABASE_KEY` | anon key (PostgREST RLS용) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (RLS bypass) |
| `SUPABASE_JWT_SECRET` | Supabase JWT 검증 |
| `SUPABASE_DB_URL` | (Rust 엔진/마이그레이션이 직접 PG 연결) |
| `ENGINE_URL` | `http://127.0.0.1:8081` |
| `CORS_ORIGINS` | `https://module.topworks.ltd,https://cable.topworks.ltd,https://baro.topworks.ltd,https://study.topworks.ltd,http://localhost:5173` |
| `PORT` | `8080` |
| `SOLARFLOW_FILE_ROOT` | 첨부파일 디스크 경로 (`~/.local/share/solarflow/files`) |
| `OCR_PYTHON_BIN` | OCR 사이드카 파이썬 경로 |
| `OCR_SIDECAR_SCRIPT` | OCR 진입점 스크립트 |
| `METAL_PRICE_API_KEY` | 은(silver) + USD/KRW 환율 (metalpriceapi.com) |
| `ANTHROPIC_API_KEY` | LLM 어시스턴트(/api/v1/assistant/chat). Z.ai GLM-5.1 키 — 형식 `<id>.<secret>` |
| `ANTHROPIC_BASE_URL` | `https://api.z.ai/api/anthropic` (Z.ai의 Anthropic-호환 엔드포인트) |

### `engine/.env`
| 키 | 용도 |
|---|---|
| `SUPABASE_DB_URL` | PG 직접 연결 (sqlx 풀 5) |
| `PORT` | `8081` |
| `RUST_LOG` | `info` |

### 운영자 관리 파일
- `~/.config/solarflow/commodities.json` — 폴리실리콘 / SCFI 시세 (주간 손 갱신, 핫 리로드). PR73 참조.

## 외부 API

| 서비스 | 키 (env) | 용도 |
|---|---|---|
| Supabase | (위 .env) | DB / Auth / Storage |
| metalpriceapi.com | `METAL_PRICE_API_KEY` | XAG(은) 라이브 + USD/KRW 환율 |
| Z.ai (GLM) | `ANTHROPIC_API_KEY` + `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic` | LLM 업무 도우미 (PR #144) — Anthropic-호환 엔드포인트로 GLM-5.1 호출 |
| Cloudflare | `~/.cloudflared/api-token` (Pages 진단/수동 배포용), `~/.cloudflared/cert.pem` (터널 cert + tunnel 토큰) | Pages(프론트), Tunnel(API), DNS. Pages 프로젝트명: `topworks-module-git`. Custom domains: `module.topworks.ltd`, `cable.topworks.ltd`, `baro.topworks.ltd`, `study.topworks.ltd`. Account ID: `6d6170fb05dd6d703b7ac8ea5ee10cae`. |

폴리실리콘/SCFI는 무료 실시간 API 없음 → JSON 파일 + 운영자 주간 갱신 (PR73). FBX/Bernreuter는 향후 옵션.

## 자주 쓰는 운영 명령

```bash
# 전체 헬스
curl -s -o /dev/null -w "go:     %{http_code}\n" http://localhost:8080/health
curl -s -o /dev/null -w "engine: %{http_code}\n" http://localhost:8081/health
curl -sI https://api.topworks.ltd/health | head -1

# 서비스 상태
systemctl --user status solarflow-{go,engine}.service cloudflared-solarflow.service --no-pager
systemctl --user show solarflow-go.service -p RestartUSec -p StartLimitIntervalUSec -p StartLimitBurst --no-pager
journalctl --disk-usage

# 로그 (실시간 — 박스 안에서)
journalctl --user -u solarflow-go.service -f
journalctl --user -u solarflow-engine.service -f

# 로그 (원격에서 — Tailscale SSH 경유, 추천)
# 아래는 어디서든 동작하는 헬퍼. CLAUDE.md / AGENTS.md 의 "운영 서버 SSH 접근" 참조.
scripts/prod-logs.sh errors            # 최근 30분 ERROR/WARN (4개 유닛 통합)
scripts/prod-logs.sh http5xx 1h        # Go 5xx 만
scripts/prod-logs.sh slow 1h           # Rust sqlx slow statement
scripts/prod-logs.sh db 1h             # Supabase/PostgREST 에러 (PGRST204, column does not exist 등)
scripts/prod-logs.sh tail go|engine|cloudflared|webhook
scripts/prod-logs.sh status

# 동기화 상태 (cron 결과)
tail -f /home/choiceoh/공개/solarflow-3/.sync.log    # 박스 안에서
scripts/prod-logs.sh sync                            # 원격에서

# 외부 API 검증
curl -s http://localhost:8080/api/v1/public/fx/usdkrw      # USD/KRW 라이브
curl -s http://localhost:8080/api/v1/public/metals/silver  # 은 라이브
curl -s http://localhost:8080/api/v1/public/polysilicon    # 폴리실리콘 (파일)
curl -s http://localhost:8080/api/v1/public/scfi           # SCFI (파일)
```

## 알려진 함정

1. **백업 스크립트(`backup.sh`) 동작 안 함** — Mac 경로(`/opt/homebrew`, GoogleDrive 동기화 폴더) 가정으로 작성됨. 이 Linux 박스에서 실행되지 않으니 별도 Supabase 백업 정책 필요.
2. **CLAUDE.md "macOS 프로덕션 워크스테이션" 표기는 옛 정보** — `launchctl`, `codesign`, `~/Library/LaunchAgents/` 모두 이 박스엔 무관. systemd user 모드로 통일.
3. **`check_schema.sh`는 로컬 psql 가정** — Supabase 직접 검사가 필요하면 psycopg2로 같은 로직 포팅 (이전 진행 사례 있음).
4. **포트 8081을 nohup으로 직접 띄우면 systemd unit이 무한 재시작 루프에 빠진다** — 디버깅 시 임시 실행은 systemd 유닛을 stop 후, 끝나면 다시 systemd로 인계.
5. **(D-123 이전) engine `Requires=` 때문에 엔진이 죽으면 Go도 같이 재시작됨** — D-123 으로 `Wants=` 약결합으로 변경됐으므로 더 이상 해당 없음. unit 파일 미적용 운영 박스에는 여전히 적용되니 `ops/systemd/` 의 새 unit 으로 갱신 필요.
6. **첫 배포 시 운영자 1회 작업 (D-123)** — `cp ops/systemd/{solarflow-go,solarflow-engine}.service ~/.config/systemd/user/ && systemctl --user daemon-reload && systemctl --user restart solarflow-{go,engine}.service`. 이후 배포는 `cron-deploy.sh` 가 reload 로 zero-downtime 인계.
