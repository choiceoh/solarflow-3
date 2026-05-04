# SolarFlow 3.0 — Windows 개발 환경

CLAUDE.md의 백엔드 운영 절차(`launchctl`, `codesign`, `~/Library/LaunchAgents/...`)는 macOS 전용이다. Windows에서는 이 문서를 따른다.

## 핵심 차이

| 항목 | macOS | Windows |
|---|---|---|
| 백엔드 실행 | launchd 데몬 + codesign | 터미널에서 `go run .` (포그라운드, air 있으면 자동 재기동) |
| 엔진 실행 | launchd 데몬 | 터미널에서 `cargo run` (debug, cargo-watch 있으면 자동 재기동) |
| PostgREST | 로컬 launchd 서비스 | 사용 안 함 — Supabase 클라우드 직결 |
| Caddy | 로컬 launchd 서비스 | 사용 안 함 — Vite 프록시(`vite.config.ts`)로 충분 |
| 첨부 파일 경로 | `/Users/Shared/SolarFlow/files` (기본값) | `SOLARFLOW_FILE_ROOT` env로 지정 |
| 코드 수정 후 재반영 | bootout/bootstrap 절차 | air/cargo-watch 자동, 또는 `Ctrl+C` → `↑` → `Enter` |

## 사전 요구사항

- Go 1.26+ (`winget install GoLang.Go`)
- Rust 1.80+ (`winget install Rustlang.Rustup`)
- Node.js 20+ (`winget install OpenJS.NodeJS.LTS`)
- PostgreSQL 클라이언트 `psql` (`winget install PostgreSQL.PostgreSQL` 또는 EnterpriseDB 설치본 — `psql.exe`만 PATH에 있으면 됨)
- Git for Windows (Git Bash 포함 — `check_schema.sh` 실행에 필요)

## 환경변수 파일

저장소에 커밋하지 않는다. 각 워크트리/체크아웃마다 한 번씩 작성한다.

### `frontend/.env`

```
VITE_SUPABASE_URL=https://aalxpmfnsjzmhsfkuxnp.supabase.co
VITE_SUPABASE_ANON_KEY=<Supabase anon key>
VITE_API_URL=http://localhost:8080
```

### `backend/.env`

```
SUPABASE_URL=https://aalxpmfnsjzmhsfkuxnp.supabase.co
SUPABASE_KEY=<Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SUPABASE_JWT_SECRET=<jwt secret>
POSTGREST_JWT_SECRET=<jwt secret — Supabase 클라우드 직결 시 동일하게 사용>
SUPABASE_DB_URL=postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres
ENGINE_URL=http://127.0.0.1:8081
CORS_ORIGINS=http://127.0.0.1:5174,http://localhost:5174,https://module.topworks.ltd,https://cable.topworks.ltd,https://baro.topworks.ltd
SOLARFLOW_FILE_ROOT=C:\SolarFlow\files
```

마지막 줄은 Windows 전용. 디렉토리는 미리 만들어둔다:

```powershell
New-Item -ItemType Directory -Force -Path C:\SolarFlow\files | Out-Null
```

## 실행 — 3개 터미널

### 한 방에 띄우기 (권장)

프로젝트 루트에서:

```powershell
.\scripts\dev-all.ps1
```

backend / engine / frontend 3개 PowerShell 창이 자동으로 뜬다. 사전에 각 `.env` 와 `frontend/node_modules` 가 준비돼 있어야 함 (없으면 어느 게 빠졌는지 알려준다).

### 수동 (개별 띄우기)

PowerShell 3개를 띄워 각각 띄운다. 코드 수정 시 해당 터미널만 `Ctrl+C` → 재실행.

### 1. 백엔드 (포트 8080)

```powershell
cd backend
.\scripts\dev.ps1
```

또는 직접:

```powershell
cd backend
go run .
```

### 2. 엔진 (포트 8081)

```powershell
cd engine
.\scripts\dev.ps1
```

또는 직접:

```powershell
cd engine
cargo run                # debug (개발용, 빠른 빌드)
cargo run --release      # release (운영과 동일, 느림)
```

기본 debug 빌드. 첫 빌드는 1~3분, 이후 증분 빌드는 수초. 성능 측정이나 운영 검증 시에만 release (`$env:RELEASE='1'; .\scripts\dev.ps1`).

### 3. 프론트엔드 (포트 5174)

```powershell
cd frontend
npm install   # 최초 1회
npm run dev -- --port 5174
```

브라우저: http://localhost:5174

## 스키마 검사

```bash
# Git Bash에서
cd backend
DB_NAME=solarflow ./scripts/check_schema.sh
```

PowerShell에서는 동작 안 함 — bash/awk/grep 의존. Git Bash 또는 WSL 사용.

`psql` 호출 시 `PGPASSWORD` env로 비밀번호 전달:

```bash
PGPASSWORD=<password> ./scripts/check_schema.sh
```

## Supabase 직결 운영

PostgREST는 Supabase 클라우드(`https://<ref>.supabase.co/rest/v1/`)에 이미 떠 있으므로 로컬 설치 불필요. 백엔드 코드는 `SUPABASE_URL` + `SUPABASE_KEY`로 클라우드 PostgREST를 사용하도록 구성돼 있다.

### 마이그레이션 적용 (한 줄)

```bash
# Git Bash
cd backend
./scripts/migrate.sh migrations/067_xxx.sql
```

위 스크립트가 (1) `psql -f` 적용, (2) `NOTIFY pgrst, 'reload schema'`, (3) `check_schema.sh` 까지 한 번에 수행. (macOS의 `launchctl stop/start com.solarflow.postgrest` 대체.)

## 트러블슈팅

**증상: 프론트엔드 흰 화면, 콘솔에 `VITE_SUPABASE_URL ... 설정되지 않았습니다`**
→ `frontend/.env` 작성 후 `npm run dev` 재시작. 빌드 모드(`npm run build`)는 빌드 시점 env가 박혀들어가므로 재빌드 필요.

**증상: 백엔드가 즉시 종료**
→ `backend/.env` 누락. `go run .`은 working directory의 `.env`를 읽는다. `cd backend` 상태인지 확인.

**증상: `attachment` API에서 500 에러, "no such file or directory"**
→ `SOLARFLOW_FILE_ROOT` 미설정. 기본값(`/Users/Shared/SolarFlow/files`)은 Windows에 존재하지 않음.

**증상: Vite 프록시 `/api/*` 가 502**
→ 백엔드 터미널 죽음. 해당 터미널 확인 후 재기동.

**증상: 줄바꿈(CRLF) 문제로 `.sh` 스크립트 실행 실패**
→ Git for Windows 설치 시 `core.autocrlf=input` 권장. 또는 `git config --global core.autocrlf input` 설정 후 재체크아웃.

## 자동 재기동 (선택)

코드 수정 시 자동 재빌드 + 재기동을 원하면 도구를 설치한다 — 설치 후엔 `dev.ps1` 가 자동 감지해 사용한다.

```powershell
# Go 백엔드
go install github.com/air-verse/air@latest

# Rust 엔진
cargo install cargo-watch
```

설치 안 돼 있어도 dev.ps1 는 평소처럼 동작 (안내 메시지만 출력). 설정 파일은 `backend/.air.toml` (커밋됨).

## 하지 말 것 (Windows에서)

- NSSM 등으로 Windows 서비스화: 설치/관리 오버헤드 vs 이득 적음. 개발은 포그라운드 프로세스로 충분.
- WSL2 안에서 macOS 절차 그대로 따라 하기: launchd 없음, codesign 의미 없음. 그냥 이 문서 따르면 됨.
