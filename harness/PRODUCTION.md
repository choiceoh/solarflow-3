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

- **프론트엔드는 이 박스에서 서빙하지 않는다.** `module.topworks.ltd`, `cable.topworks.ltd`, `baro.topworks.ltd`는 같은 Cloudflare Pages 프로젝트가 main 브랜치 push 시 자동 빌드/배포. 이 박스의 `frontend/dist/`는 로컬 개발/검증용일 뿐 운영 노출과 무관.
- 8080은 cloudflared 터널을 통해서만 외부에 보이고, 8081은 같은 박스 안에서 Go가 호출하는 사내 포트.

## systemd user 서비스 (4개)

전부 user-mode (`systemctl --user`). 부팅 시 자동 시작 (enabled).

| 서비스 | 유닛 파일 | 워킹 디렉토리 | 환경변수 파일 | 실행 바이너리 |
|---|---|---|---|---|
| `solarflow-go.service` | `~/.config/systemd/user/solarflow-go.service` | `backend/` | `backend/.env` | `backend/solarflow-go` |
| `solarflow-engine.service` | `~/.config/systemd/user/solarflow-engine.service` | `engine/` | `engine/.env` | `engine/target/release/solarflow-engine` |
| `cloudflared-solarflow.service` | `~/.config/systemd/user/cloudflared-solarflow.service` | - | - | `~/.local/bin/cloudflared --config ~/.cloudflared/solarflow.yml tunnel run solarflow` |
| `solarflow-webhook.service` | `~/.config/systemd/user/solarflow-webhook.service` | repo root | `.webhook.env` | `python3 scripts/webhook-deploy.py` (포트 9999) |

의존성: `solarflow-go.service`는 `Requires=solarflow-engine.service` — 엔진 먼저 떠야 Go가 뜬다.

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
- `psql` **미설치**. 마이그레이션은 `.venv-ocr/bin/python` + `psycopg2-binary`로 직접 적용. 예:
  ```bash
  cd backend
  set -a; source .env; set +a
  ../backend/.venv-ocr/bin/python -c "
  import os, psycopg2
  conn = psycopg2.connect(os.environ['SUPABASE_DB_URL'])
  conn.autocommit = False
  cur = conn.cursor()
  cur.execute(open('migrations/NNN_xxx.sql').read())
  conn.commit()
  "
  ```
- PostgREST 캐시 갱신: `NOTIFY pgrst, 'reload schema'` (호스팅 PostgREST는 이걸 받아 자동 리로드)

## 배포 절차 (이 박스에서)

### 백엔드 변경 (Go)
```bash
cd ~/공개/solarflow-3/backend
go build -o solarflow-go .
systemctl --user restart solarflow-go.service
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/health   # 200 확인
```

### 엔진 변경 (Rust)
```bash
cd ~/공개/solarflow-3/engine
cargo build --release
systemctl --user restart solarflow-engine.service
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/health   # 200 확인
```

엔진 재시작 시 `solarflow-go.service`도 `Requires` 의존이 있어 같이 재시작될 수 있다. 필요 시 Go도 명시적으로 restart.

### 프론트엔드 변경
이 박스에서는 빌드/재시작 불필요. main에 push되면 **Cloudflare Pages**가 자동 빌드·배포한다 (1~2분). 이 박스의 `frontend/dist/`는 운영 노출 경로가 아니다.

### DB 마이그레이션

기본 워크플로는 **헤더 게이트 + 자동 적용** (PR #214 이후). `cron-deploy.sh` 가 webhook/cron 회차에 `scripts/apply_migrations.py` 를 호출해 미적용 + 게이트 통과 파일만 자동 적용한다.

**규약**:
- 추적 테이블: `public.schema_migrations(filename PK, applied_at)` — 적용 이력 기록.
- 자동 적용 게이트: 파일 첫 10줄 안에 다음 헤더 한 줄을 포함해야 함.
  ```sql
  -- @auto-apply: yes
  ```
- 헤더 없는 파일은 자동 적용에서 SKIP — 파괴적/대용량 마이그레이션은 헤더 빼고 운영자가 시점/순서 통제하며 수동 적용.
- 각 파일은 단일 트랜잭션에서 적용 → 실패 시 자동 ROLLBACK + Go 재시작 보류 (DB 정합 우선).
- 마지막에 `NOTIFY pgrst, 'reload schema'` 자동 발송.

**자동 적용 가능한 마이그레이션 작성 가이드** (헤더 붙이려면 이 조건 모두 만족):
- `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `INSERT … ON CONFLICT DO NOTHING` 등 idempotent.
- 락이 짧고 (수 초 이내) 운영 중 적용해도 괜찮은 변경.
- 데이터 손실 위험 없음 (DROP/RENAME/TRUNCATE 등은 헤더 금지).

**수동 적용 (헤더 없는 파일 / 긴급 적용 / 검증)**:
```bash
cd ~/공개/solarflow-3
set -a; source backend/.env; set +a
backend/.venv-ocr/bin/python scripts/apply_migrations.py    # 게이트 통과한 모든 미적용 파일 일괄

# 또는 헤더 없는 한 파일만 명시적으로 (옛 절차):
backend/.venv-ocr/bin/python <<'PY'
import os, psycopg2
sql = open('backend/migrations/NNN_xxx.sql').read()
conn = psycopg2.connect(os.environ['SUPABASE_DB_URL']); conn.autocommit = False
cur = conn.cursor(); cur.execute(sql); conn.commit()
# 추적 기록 (자동/수동 모두 schema_migrations 에 등록되어야 다음 회차에 재시도 안 됨)
cur.execute("INSERT INTO public.schema_migrations (filename) VALUES (%s) ON CONFLICT DO NOTHING",
            ('NNN_xxx.sql',))
conn.commit()
PY
# PostgREST 캐시 갱신
backend/.venv-ocr/bin/python -c "
import os, psycopg2
c = psycopg2.connect(os.environ['SUPABASE_DB_URL']); c.autocommit = True
c.cursor().execute(\"NOTIFY pgrst, 'reload schema'\")"
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
| `CORS_ORIGINS` | `https://module.topworks.ltd,https://cable.topworks.ltd,https://baro.topworks.ltd,http://localhost:5173` |
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
| Cloudflare | `~/.cloudflared/api-token` (Pages 진단/수동 배포용), `~/.cloudflared/cert.pem` (터널 cert + tunnel 토큰) | Pages(프론트), Tunnel(API), DNS. Pages 프로젝트명: `topworks-module-git`. Custom domains: `module.topworks.ltd`, `cable.topworks.ltd`, `baro.topworks.ltd`. Account ID: `6d6170fb05dd6d703b7ac8ea5ee10cae`. |

폴리실리콘/SCFI는 무료 실시간 API 없음 → JSON 파일 + 운영자 주간 갱신 (PR73). FBX/Bernreuter는 향후 옵션.

## 자주 쓰는 운영 명령

```bash
# 전체 헬스
curl -s -o /dev/null -w "go:     %{http_code}\n" http://localhost:8080/health
curl -s -o /dev/null -w "engine: %{http_code}\n" http://localhost:8081/health
curl -sI https://api.topworks.ltd/health | head -1

# 서비스 상태
systemctl --user status solarflow-{go,engine}.service cloudflared-solarflow.service --no-pager

# 로그 (실시간)
journalctl --user -u solarflow-go.service -f
journalctl --user -u solarflow-engine.service -f

# 동기화 상태 (cron 결과)
tail -f /home/choiceoh/공개/solarflow-3/.sync.log

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
5. **engine `Requires=` 때문에 엔진이 죽으면 Go도 같이 재시작됨** — 엔진 단독 디버깅 시 Go 영향 인지.
