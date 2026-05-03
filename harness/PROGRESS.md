# SolarFlow 진행 상황

## 현재 상태 요약 (최종 업데이트: 2026-05-03)

| 항목 | 상태 |
|------|------|
| 현재 Phase | **실데이터 이관 + 운영 기능 보강 진행 중** |
| 다음 작업 | Excel Import Hub 중심 운영 입력 전환 마무리 + PO/LC/T/T import 스펙·서버 검증 추가 + PR19 구매/판매/금융 화면 데스크톱 정밀 비교 + 아마란스 RPA 리허설 |
| 인프라 | Mac mini (Go+Rust+PostgREST+Caddy+PostgreSQL) + Supabase Auth(인증만) + Tailscale(외부접속) |
| 프론트엔드 | Caddy 정적 서빙 (dist/) — localhost:5173, Tailscale 100.123.70.19:5173 |
| DB | 로컬 PostgreSQL + PostgREST (D-075, D-076) |
| Go 테스트 | 240+ PASS (router snapshot 2건 + guard matrix 50 + pure function 62 sub-case) |
| Rust 테스트 | 75개 PASS |
| DECISIONS | D-001~D-118 (D-080/D-081 번호 공백) |
| launchd | 5개 서비스 자동 시작 |

---

## 2026-05-03 세션 — 자료실 사이드바 진입 추가

### 완료
- 왼쪽 사이드바 `도구` 그룹에 `자료실` 메뉴 추가 (`/library`)
- `library` 메뉴 권한 키 추가 — admin 전체, operator/executive/manager/viewer 모두 자료실 진입 가능
- `/library` 페이지 추가
  - 사용자 권한과 테넌트(topsolar/baro)에 따라 열 수 있는 자료 카드만 표시
  - 엑셀 입력 양식, B/L 서류 보관, 구매이력, BARO 입고예정/구매이력, 결재안, 기준정보, AI OCR, 개인 설정으로 연결
- 상단 라우트 타이틀/브레드크럼에 `자료실` 추가

### 검증
- `cd frontend && npm ci` 성공 — 워크트리 로컬 의존성 복원
- `cd frontend && npm run build` 성공 — 기존 AssistantPage dynamic import warning 1건 유지
- `cd frontend && npm run test` 성공 — 8 files / 65 tests
- `cd frontend && npm run lint` 종료코드 0 — 기존 baseline 경고 85건 출력
- `git diff --check` 성공
- `graphify update .` 성공 — 3213 nodes / 5496 edges / 337 communities

---

## 2026-05-03 세션 — 런타임 인스펙터 제거

### 완료
- 상단 헤더의 편집 모드 진입 버튼, 전역 선택 오버레이, 우측 인스펙터 패널, context menu, 온보딩 toast를 제거
- `frontend/src/components/inspector/` 전체와 전용 eye-dropper helper 삭제
- Zustand 전역 상태에서 인스펙터 선택 대상, 역할 미리보기, 토큰 override, className draft 상태 제거
- `usePermission`의 인스펙터 역할 미리보기 override 제거 — 권한 표시는 실제 JWT 역할만 기준으로 복귀
- Assistant page context에서 인스펙터 선택 요소 주입 제거
- 백엔드 assistant system prompt에서 `selected_element` 처리와 "인스펙터로 클릭한 element" 문맥 제거
- D-118 결정 기록 추가 — 런타임 인스펙터는 폐기하고 `/ui-config-editor`를 정식 UI 편집 경로로 유지

### 검증
- `cd backend && go build ./...` 성공
- `cd backend && go vet ./...` 성공
- `cd backend && go test ./...` 성공
- `cd frontend && npm ci` 성공 — 누락된 로컬 의존성 복원
- `cd frontend && npm run build` 성공 — Vite dynamic import warning 1건은 기존 assistant drawer/static import 구조 경고
- `cd frontend && npm run test` 성공 — 7 files / 63 tests
- `cd frontend && npm run lint` 종료코드 0 — 기존 baseline 경고 86건 출력
- `graphify update .` 성공 — 3192 nodes / 5420 edges / 348 communities

---

## 2026-05-03 세션 — BARO 입고예정/ETA + 구매이력 보드

### 완료
- BARO 영업이 module 담당자에게 묻지 않고 직접 확인할 수 있는 `/baro/incoming` 화면 추가
- `GET /api/v1/baro/incoming` BARO 전용 sanitized API 추가
  - B/L 원본/라인 API를 그대로 노출하지 않고 품번·수량·용량·ETD·ETA·입고일·창고·상태만 반환
  - 환율/L/C/T/T/면장/인보이스 금액/단가/CIF/Landed Cost 필드 제외
- BARO 자체 구매이력 `/baro/purchase-history` 화면 추가
- `GET /api/v1/baro/purchase-history` BARO 전용 API 추가
  - 조회 범위는 `company_code='BR'` 법인 B/L 라인으로 고정
  - 국내 타사/그룹내 매입 단가(`unit_price_krw_wp`, `unit_price_usd_wp`)와 추정 매입금액 제공
  - `admin`/`operator`/`executive`만 접근, `manager`/`viewer`는 원가 조회 차단
- 사이드바 메뉴 `baro_incoming`, `baro_purchase_history` 추가, BARO 테넌트에서만 노출
- `harness/baro.md`, `harness/module.md`, D-116/D-117 결정 기록 동기화

### 검증
- `cd backend && go build ./...` 성공
- `cd backend && go vet ./...` 성공
- `cd backend && go test ./...` 성공
- `cd backend && go test ./internal/router -run TestRouteSnapshot -update` 성공 — routes.golden 갱신
- `TestBaroPurchaseHistoryCostRoleGate` 추가 — BARO operator 통과, BARO manager 차단, 탑솔라 토큰 차단
- `cd frontend && npm run build` 성공
- `cd frontend && npm run test` 성공 — 9 files / 75 tests
- `cd frontend && npm run lint` 종료코드 0 — 기존 baseline 경고 149건 출력
- `git diff --check` 성공
- `graphify update .` 성공
- `curl -I http://baro.localhost:5173/baro/purchase-history` → 200

---

## 2026-05-03 세션 — Excel Import Hub 중심 입력 전환

### 완료
- 설계 정본을 "웹 직접 입력 보조"에서 "Excel Import Hub 단일 입력 경로 + 웹 조회/분석" 원칙으로 갱신.
- D-115 추가: 운영 데이터 생성은 Excel Import Hub로 모으고, 웹 수정은 연결 지정·상태 전환·수금 매칭·서류 첨부 중심으로 제한.
- 그룹 입고 요청은 원장 입력이 아니라 회사 간 요청/승인/출고연결 워크플로우 예외로 D-115에 명시.
- 프론트엔드에서 전역 빠른 등록과 업무 화면의 직접 생성 CTA를 제거하는 작업 진행.

### 다음 작업
- PO/LC/T/T 구매 계약 데이터용 Excel import 스펙과 서버 검증 추가.
- 숨겨진 예외/관리자 입력 경로를 점검해 운영 메뉴에서 노출되지 않도록 후속 정리.

---

## 2026-05-02 세션 — 나머지 5개 import 파서 추출 (Outbound/Sales/Declaration+Cost/Expenses/Orders)

### 완료
PR #206에서 Receipts/Inbound 그룹핑만 추출했던 것을 7종 모두로 확장:
- `parseExpenseRow(rowNum, row, companyID, blID)` — 부대비용
- `parseOutboundRow(rowNum, row, companyID, productID, warehouseID, wattageKW, orderID, targetCompanyID)` — 출고
- `parseOrderRow(rowNum, row, companyID, customerID, productID, wattageKW)` — 수주 (receipt_method/management/fulfillment 허용값 포함)
- `parseSaleRow(rowNum, row, outboundID, customerID, outboundQuantity, specWP)` — 매출 (자동 EA단가/VAT/합계)
- `parseDeclarationRow(rowNum, row, blID, companyID)` — 면장
- `parseDeclarationCostRow(rowNum, row, declID, productID, wattageKW)` — 원가 (자동 cif_wp_krw)

각 핸들러는 FK 해석 후 pure 함수에 위임. 5개 핸들러 메서드가 평균 80→30줄로 축소.

### 검증
- `go build ./...` 성공
- `go vet ./...` 경고 0
- `go test ./...` 모두 PASS — 5 신규 파서 테스트 (~22 sub-case)
- 핸들러 동작 보존

### LOC
- io_import.go: 1381(원본) → 1083 (-298줄, 22% 축소)
- io_import_parsers.go: 374줄 (7개 파서 + 1개 그룹핑)
- io_import_parsers_test.go: 552줄

---

## 2026-05-02 세션 — 복잡 핸들러 pure function 추출 (테스트 가능 단위 5종)

### 완료 (B 옵션 — 풀 service/repository 대신 좁힌 추출)

5개 영역에서 비즈니스 로직을 pure 함수로 분리하고 단위테스트 추가:

1. **io_import 기존 18개 utility 단위테스트 보강** (`io_import_test.go`)
   - 추가: `TestAssertFloat` (15 sub-case — float32/int64/json.Number/string 등 변환)
   - `TestGetInt`, `TestGetFloatPtr`, `TestGetStringPtr`, `TestGetIntPtr`
   - `TestRequireFloat`, `TestRequireInt`, `TestValidateAllowedValues`
   - 기존 4건(`TestGetString`, `TestGetFloat`, `TestGetBoolPtr`, `TestValidateRequired`) + 신규 8건
   - 회귀 위험: `assertFloat`의 타입 단정 실패가 zero value로 흘러 VAT 0원 같은 무성 손상 발생 — 테스트로 차단
2. **tx_outbound 용량 계산 pure 추출** (`tx_outbound.go` + `tx_outbound_test.go` 신규)
   - `computeOutboundCapacityKW(quantity, explicitKW, productWattageKW)` 분리. DB 의존 없는 pure 함수.
   - `resolveOutboundCapacityKW`(handler 메서드)는 DB 조회 후 pure 함수에 위임
   - 9 sub-case (explicit 양수/음수/0, wattage nil/0/음수 조합)
3. **tx_intercompany 상태 전이 validator 추출** (`tx_intercompany_request.go` + 테스트 신규)
   - `validateIntercompanyTransition(current, target)` pure 함수 + `intercompanyAllowedTransitions` 명세
   - 13 sub-case — 4개 허용 전이 + 8개 무효 전이 + 종결 상태에서의 전이 시도
   - 상태 머신을 코드 한 곳(map)에 못박음
4. **io_export 워크북 빌더 추출** (`io_export.go` + 테스트 추가)
   - `buildAmaranthInboundWorkbook(bls, lines, lookups)` 155줄 pure 함수로 분리
   - `inboundLineForExport`, `inboundExportLookups` 타입 정의
   - 4 테스트 — Domestic VAT 10%, Import 영세, Empty input, ETA fallback
5. **io_import row parser 추출 (Receipts 전체 + Inbound 그룹핑)** (`io_import_parsers.go` 신규 + 테스트 신규)
   - `parseReceiptRow(rowNum, row, customerID)` — FK 해석은 호출 측, 검증·페이로드 빌드는 pure
   - `groupInboundRowsByBL(rows)` — 130줄짜리 그룹핑·검증 로직을 pure로 분리
   - 11 sub-case — 정상/음수/0/형식오류, 단일/멀티라인, 메타 불일치 경고, 필수 누락, 허용값 위반
   - **future**: Outbound/Sales/Declarations/Expenses/Orders 5개 핸들러는 동일 패턴으로 추후 확장 가능

### 검증
- `go build ./...` 성공
- `go vet ./...` 경고 0
- `go test ./...` 모두 PASS — 신규 sub-case ~62건 (#1 26 + #4 9 + #5 13 + #3 4 + #2 10)
- 핸들러 동작 보존 — 추출은 모두 동일 결과를 내는 리팩터

### 다음 작업
- 5번의 future: 나머지 import 5종 동일 패턴 추출 (Outbound 152줄/Sales 155/Declarations 190/Expenses 117/Orders 153) — 각 30분~1시간씩
- (큰 변경) service/repository 풀 도입은 보류 — ROI 낮음 (마스터 CRUD엔 과잉, 8개 복잡 핸들러는 본 PR로 대부분 해소)
- 통합 테스트 인프라 (옵션 E from grill) — docker-compose로 로컬 PG+PostgREST 띄우기 — 추후 검토

---

## 2026-05-02 세션 — 핸들러 파일 prefix 정리 + ai_assistant_tools god-file 분할 (F+B)

### 완료
- **F (파일 prefix 컨벤션)**: `internal/handler/` 평면 50개 파일을 카테고리별 prefix로 rename — `master_`(7)/`tx_`(21)/`baro_`(4)/`sys_`(7)/`ai_`(5)/`io_`(4). 패키지는 단일 `handler` 유지 → import 경로·private 캡슐화 변화 0.
  - 신규 도메인 추가 시 prefix를 강제(RULES.md "신규 도메인 추가 절차" 갱신, routes.go 헤더 주석에 컨벤션 명시)
  - audit/rpc/util 등 cross-file private 함수가 그대로 보존됨 (정통 패키지 분할 안의 부작용을 회피)
- **B (god-file 분할)**: `ai_assistant_tools.go` 1,632줄 → 3개 파일로 분리.
  - `ai_assistant_tools.go` 195줄 (core: assistantTool 타입, roleIn/tenantIs, fetch helpers, proposeWrite, assistantToolCatalog, dispatchAssistantTool, clampLimit)
  - `ai_assistant_tools_search.go` 705줄 (13개 read-only search 도구)
  - `ai_assistant_tools_write.go` 765줄 (CRUD 제안 도구 — note·partner·order·outbound·receipt·declaration)
  - 효과: 매번 그 파일 손댈 때 PR 충돌·리뷰 부담 감소

### 검증
- `go build ./...` 성공
- `go vet ./...` 경고 0
- `go test ./...` 모두 PASS (router 51건 PASS — TestRouteSnapshot/NoEngine + TestGuardMatrix 49)
- 라우트 변화 없음 (rename + 분할은 동작 보존) — `routes.golden` 갱신 불필요

---

## 2026-05-02 세션 — Go 백엔드 라우팅 D-110 RegisterRoutes 빅뱅

### 완료
- 설계 판단 D-110 추가: `App` 컨테이너 + 핸들러 `RegisterRoutes` 패턴으로 라우팅 통일
- 신규 파일
  - `backend/internal/app/app.go` — `App{DB,Eng,OCR,Cfg,Gates}` + `New(cfg)` + `HasEngine()`
  - `backend/internal/middleware/gates.go` — `Gates{Write,AdminOnly,TopsolarOnly,BaroOnly}` + `NewGates()`
  - `backend/internal/handler/routes.go` — 50개 핸들러의 `RegisterRoutes` 메서드 알파벳 정렬 1파일 (516줄)
  - `backend/internal/router/router_test.go` — `TestRouteSnapshot`(222 라우트 골든파일 비교) + `TestRouteSnapshot_NoEngine`(엔진 미설정 시 calc/engine 라우트 미마운트 검증)
  - `backend/internal/router/testdata/routes.golden` — 222 라우트 정렬 캡처
- 수정
  - `backend/main.go` 44줄 → 23줄 (cfg → app.New → router.New → ListenAndServe)
  - `backend/internal/router/router.go` 500줄 → 86줄 (알파벳 정렬 RegisterRoutes 호출만)
  - `backend/internal/handler/assistant.go` `NewAssistantHandler(db, ocrH, matchH)` — alias 위임용 의존성 주입
  - `harness/RULES.md` "신규 도메인 추가 절차" 섹션 추가 (RegisterRoutes 패턴 + golden 갱신 단계)

### 검증
- `cd backend && go build ./...` 성공
- `cd backend && go vet ./...` 성공
- `cd backend && go test ./...` 성공 — 131 PASS (router 2건 신규)
- 라우트 222개 골든파일 캡처 — 신규 도메인 추가 시 `go test ./internal/router -run TestRouteSnapshot -update`로 갱신

### 다음 작업
- handler 패키지 도메인 폴더 분할(`handler/master/`, `handler/po/` 등) 검토 — 빅뱅 후속, 평면 50개 유지가 부담되면 진행

---

## 2026-05-02 세션 — D-111 alias 라우트 영구 유지 결정

### 완료
- 설계 판단 D-111 추가: `/api/v1/assistant/{ocr,match}/*` alias 3개는 영구 유지
- 프론트 호출처 grep 결과 정리:
  - `/assistant/match/receipts/auto` ← `frontend/src/components/orders/AutoMatchSection.tsx:61` (정식 `/receipt-matches/auto`는 호출처 0 — alias가 사실상 정식)
  - `/assistant/ocr/extract` ← `frontend/src/pages/AssistantPage.tsx:151` (통합 챗 OCR). 정식 `/ocr/extract`는 `frontend/src/components/inbound/BLForm.tsx:1300` (B/L 입력 OCR) — 사용 맥락 다름
  - `/assistant/ocr/health` ← 호출처 0이지만 워밍업 모니터링 가능성 + 단독 제거 가치 낮아 묶어서 유지
- PROGRESS.md "다음 작업"에서 alias 정리 항목 제거

---

## 2026-05-01 세션 — 바로(주) 테넌트 분기 1단계

### 완료
- 설계 판단 D-108 추가: 바로(주) 분리는 단일 DB + URL 기반 테넌트 + 코드 레벨 마스킹으로 운영 (통합 설계문서 1.4절 "별도 앱·별도 DB" 갱신)
- 마이그레이션 `backend/migrations/040_tenant_scope.sql` 추가
  - `companies`에 바로(주) 시드(`company_code='BR'`)
  - `user_profiles.tenant_scope` 컬럼 추가, CHECK(`topsolar`/`baro`), 기본값 `topsolar`
- 백엔드 테넌트 가드 미들웨어
  - `internal/middleware/tenant_scope.go`의 `RequireTenantScope`
  - `internal/middleware/context.go`에 `keyTenantScope`, `GetTenantScope`, 상수 `TenantScopeTopsolar`/`TenantScopeBaro` 추가
  - `internal/middleware/auth.go`가 `user_profiles.tenant_scope`을 읽어 context에 주입(자동 프로비저닝 신규는 `topsolar`)
  - 라우터에서 `lcs`/`tts`/`declarations`/`cost-details`/`expenses`/`limit-changes`/`price-histories`/`export/amaranth`에 가드 적용
  - calc 프록시의 `landed-cost`/`exchange-compare`/`lc-fee`/`lc-limit-timeline`/`lc-maturity-alert`/`margin-analysis`/`price-trend`에 가드 적용
- 회귀 테스트 `tenant_scope_test.go` 추가(탑솔라 통과/바로 차단/기본값 보정)
- 프론트엔드 호스트네임 분기
  - `frontend/src/lib/tenantScope.ts` (`baro.topworks.ltd` → BARO 모드)
  - 사이드바 `MenuItem`에 `tenants` 필드 추가, BARO 모드에서 LC/T/T/B/L/면장/LC 한도/매출이익 분석 메뉴 자동 숨김
  - `tenantScope.test.ts` 회귀 테스트

### 검증
- `cd backend && go build ./...` 성공
- `cd backend && go vet ./...` 성공
- `cd backend && go test ./...` 성공 (middleware 4 PASS 추가)
- `cd frontend && npm run lint` 성공
- `cd frontend && npm run build` 성공
- `cd frontend && npm run test` 성공 — 5 files / 15 tests
- `git diff --check` 성공

### 격리 범위
- 같은 그룹 계열사이므로 격리는 1단계(원가/LC/면장/T/T/한도/단가 이력/부대비용/landed-cost·lc-fee·lc-limit-timeline·lc-maturity-alert·exchange-compare·margin-analysis·price-trend)로 끝낸다.
- 공유 엔드포인트(`/pos`, `/bls`, `/outbounds`, `/orders`, `/sales`, `/receipts`, 마스터, 가용재고)는 row-level `company_id` 필터를 추가하지 않고 계열사 데이터로 공유한다 (D-108 갱신).

### 제한
- 본 세션은 worktree에서 진행되어 `psql`/`launchctl`/`cargo` 미설치 — DB 마이그레이션 적용, PostgREST 캐시 갱신, Rust 테스트는 운영 PC에서 실행 필요.
- DNS `baro.topworks.ltd` Caddy 매핑은 운영 환경에서 별도 설정 필요(같은 dist를 서빙하면 됨).

### 다음 작업
- 운영 PC에서 `psql -d solarflow -f backend/migrations/040_tenant_scope.sql` → PostgREST 재시작 → `./scripts/check_schema.sh` 통과 확인
- Caddy에 `baro.topworks.ltd` 호스트 매핑(같은 dist 서빙)
- 바로 테스트 사용자 1명을 `tenant_scope='baro'`로 등록 후 사이드바/원가 API 차단 직접 확인

---

## 2026-05-01 세션 — 바로(주) 테넌트 운영 적용

### 완료
- **Supabase 적용 확인**: 마이그레이션 040은 운영 DB(`aalxpmfnsjzmhsfkuxnp`)에 이미 반영됨 (`user_profiles.tenant_scope` 컬럼 + CHECK + `companies` 바로(주) 시드 `BR` 존재)
- **PostgREST 스키마 캐시 갱신**: 운영 DB에 `NOTIFY pgrst, 'reload schema'` 발행
- **Go 백엔드 CORS 갱신**: `backend/.env`의 `CORS_ORIGINS`에 `https://baro.topworks.ltd` 추가, `systemctl --user restart solarflow-go` 적용. Probe로 `Access-Control-Allow-Origin: https://baro.topworks.ltd` 확인
- **Cloudflare DNS 추가**: zone `topworks.ltd`에 CNAME `baro` → `topworks-module-git.pages.dev` (proxied) 추가. `module.topworks.ltd`와 동일 Pages 프로젝트로 라우팅
- **바로 테스트 사용자 등록**:
  - Supabase Auth: `baro-test@topworks.ltd` (user_id `bb92d083-b39e-4a41-b69b-ade420aced70`, password `Baro!Test260501`)
  - `user_profiles`: `tenant_scope='baro'`, `role='manager'`, `company_id=BR(e41f100b-...)`
- **테넌트 격리 직접 검증**(바로 토큰으로 운영 API 호출):
  - 차단 1단계 (`403`): `/api/v1/lcs`, `/declarations`, `/cost-details`, `/expenses`, `/price-histories`, `/limit-changes`, `/tts`
  - calc 프록시 차단 (POST `403`): `/calc/landed-cost`, `/lc-fee`, `/margin-analysis`, `/exchange-compare`, `/price-trend`, `/lc-limit-timeline`, `/lc-maturity-alert`
  - 공유 (`200`): `/pos`, `/orders`, `/outbounds`, `/sales`, `/companies`
  - 공유 calc (`400` 빈 body 정상): `/calc/inventory`, `/customer-analysis`, `/supply-forecast`

### 검증
- `curl -H 'Authorization: Bearer <baro-token>' http://localhost:8080/api/v1/lcs` → `403`
- `curl http://localhost:8080/health` → `200`
- DNS: `baro.topworks.ltd → 104.21.32.174 / 172.67.153.41` (Cloudflare)
- 라이브: `https://baro.topworks.ltd` HTTP/2 200, SolarFlow 앱 서빙 (Pages `topworks-module-git` 프로젝트에 커스텀 도메인 등록 완료)

### BARO 테넌트 진화 방향
- 같은 코드베이스를 공유하지만 시간이 갈수록 메인 흐름과 의도적으로 분기. 바로 전용 업무 절차 연결, 추가 정보 구간이 점차 추가될 예정.
- 새 기능 설계 시 "두 테넌트 모두에 동일 적용" 가정 금지. 사이드바 메뉴는 `tenants: ['topsolar' | 'baro']` 태그로 분기, 백엔드 차단은 D-108 1단계에 한정.

---

## 2026-05-01 세션 — PR19 면장/원가 좌표 정렬

### 완료
- 면장/원가 화면의 본문 좌표계를 다른 PR19 운영 섹션과 같은 14px 외곽 인셋 + 8px 내부 간격으로 정렬
- KPI 시작점, 중앙 카드 시작점, 우측 레일 시작점을 `/procurement`, `/orders`, `/banking` 기준선과 맞춤
- 우측 레일을 PR19 카드 레일 계열로 보정해 본문 카드와 같은 x/y 축에서 시작하도록 변경

### 검증
- 설치된 테스트용 Chromium 1480×900에서 `/customs` 좌표 확인
  - KPI: `x=226`, `y=70`, `width=976`
  - 중앙 카드: `x=226`, `y=172.92`, `width=976`
  - 우측 레일: `x=1210`, `y=70`, `width=256`
- 같은 좌표가 `/procurement`, `/orders`, `/banking` 기준선과 일치함 확인
- in-app browser에서 `/customs` 렌더 확인

### 다음 작업
- PR19 구매/판매/금융 화면을 같은 기준으로 데스크톱 폭 정밀 비교

---

## 2026-05-01 세션 — PR19 상단 검색축 고정

### 완료
- 상단 커맨드바를 flex 배치에서 좌측 정보 / 중앙 검색 / 우측 액션 3컬럼 그리드로 변경
- 전역 검색창을 `.sf-global-search` 기준 컴포넌트로 분리해 페이지 제목 길이와 무관하게 중앙에 고정
- 720px 이하에서는 제목/액션 1행, 검색창 2행 전체 폭으로 접히도록 반응형 규칙 보정
- 설계 판단 D-107 추가: 상단 검색창은 헤더 전체 축을 기준으로 고정

### 검증
- `cd frontend && npm run lint` 성공
- `cd frontend && npm run build` 성공
- `cd frontend && npm run test` 성공 — 4 files / 10 tests
- `git diff --check` 성공
- 설치된 테스트용 Chromium 1480×900에서 `/dashboard`, `/inventory`, `/customs`, `/procurement`, `/orders`, `/banking`, `/sales-analysis` 검색창 중심과 헤더 중심이 모두 `846px`로 일치함 확인

### 다음 작업
- PR19 구매/판매/금융 화면을 같은 기준으로 데스크톱 폭 정밀 비교

---

## 2026-05-01 세션 — PR19 목업 재현도 보정

### 완료
- PR19 v3 목업의 공통 밀도 기준에 맞춰 `TileB`, `CardB`, `RailBlock`의 여백, 헤더 높이, 숫자 크기, 스파크라인 위치를 보정
- 대시보드 본문 중복 제목을 제거하고 셸 제목 아래 KPI + 본문 + 256px 우측 레일 구조로 재배치
- 재고 화면을 목업의 `ScreenInv_B` 구조에 맞춰 KPI, 중앙 재고 카드, 카드 헤더 필터, 우측 레일로 재구성
- 면장/원가 화면을 KPI + 부대비용 카드 + 카드 헤더 필터/액션 + 256px 우측 레일 구조로 재구성
- 환율 비교 패널의 중첩 카드를 제거하고 PR19 표/요약 스트립 밀도로 보정
- 상단 커맨드바의 검색/알림/빠른 등록 버튼 크기를 PR19 소형 버튼 계열로 정렬
- 공통 CSS 변수와 패널/표/반응형 규칙을 PR19 목업 기준에 가깝게 보정
- 설계 판단 D-106 추가: PR19 재현도는 공통 부품과 256px 레일 구조를 기준으로 맞춘다

### 검증
- `cd frontend && npm run lint` 성공
- `cd frontend && npm run build` 성공
- `cd frontend && npm run test` 성공 — 4 files / 10 tests
- `git diff --check` 성공
- in-app browser에서 목업 로그인 상태로 `/inventory`, `/dashboard` 렌더 확인
- 설치된 테스트용 Chromium에서 목업 세션으로 `/customs` 1480×900 렌더 스크린샷 확인 (`/tmp/solarflow-customs-1480.png`)

### 제한
- `/customs`는 1480px 렌더까지 확인했지만, PR19 정적 목업에 별도 면장/원가 단독 화면이 없어 `ScreenBL_B`와 공통 B-shell 기준으로 구조를 맞춤

### 다음 작업
- PR19 구매/판매/금융 화면을 같은 기준으로 데스크톱 폭 정밀 비교
- 대시보드 우측 레일 내부 카드 밀도를 목업의 단일 레일 블록 계열로 추가 정리

---

## 2026-05-01 세션 — 운영/개발 PR19 목업 로그인

### 완료
- 로그인 화면에 운영/개발 공통 `목업 데이터로 보기` 버튼 추가
- 목업 세션은 Supabase 로그인/세션 조회 없이 보호 라우트에 진입하도록 분리
- 목업 모드에서는 `fetchWithAuth`가 실제 Go/PostgREST/Rust API를 호출하지 않고 프론트 목업 응답을 반환
- PR19 v3 목업 기준 제조사, 품번, 재고, P/O, L/C, B/L, 수주, 출고, 매출, 수금, 면장, 부대비용, 검색, OCR, 계산 API 목업 데이터 추가
- 설계 판단 D-105 추가: 목업 로그인은 실데이터 API 앞에서 차단

### 검증
- `cd frontend && npm run build` 성공
- `cd frontend && npm run lint` 성공
- `cd frontend && npm run test` 성공 — 4 files / 10 tests
- `git diff --check` 성공
- `graphify update .` 성공
- in-app browser에서 `목업 데이터로 보기` 클릭 후 `/inventory` 진입 확인

### 제한
- 목업 저장/삭제 요청은 실제 DB에 쓰지 않고 성공 형태의 임시 응답만 반환

### 다음 작업
- 목업 로그인 상태에서 대시보드/재고/구매/판매/설정 반응형 직접 확인
- 디자인이 PR19 정적 목업과 어긋나는 화면부터 재이관

---

## 2026-05-01 세션 — OCR 확인창 품목 후보 확정

### 완료
- 아마란스 RPA 패키징 작업은 이번 순서에서 제외
- 면장 OCR 확인창의 품목 후보에 실제 품번 매칭 결과를 표시
- OCR 자동 후보가 틀린 경우 확인창에서 품번을 직접 선택해 반영할 수 있도록 변경
- 확인창 진입 시 활성 품번 목록을 미리 불러와 제조사 미선택 상태에서도 후보를 볼 수 있게 함
- 수동 선택한 품번을 `확인 후 입력칸에 반영` 시 실제 B/L 라인아이템에 사용
- OCR 품목이 한 제조사로만 매칭되면 공급사도 함께 보정
- 설계 판단 D-104 추가: OCR 품목 후보는 확인창에서 사람이 확정

### 검증
- `cd frontend && npm run build` 성공
- `cd frontend && npm run lint` 성공
- `cd frontend && npm run test` 성공 — 4 files / 10 tests
- `git diff --check` 성공
- `graphify update .` 성공

### 제한
- 실제 면장 샘플 5~10건으로 필드별 인식률을 다시 측정하지는 않음
- 낮은 신뢰도 색상 표시와 원본 OCR 텍스트 병렬 비교는 아직 남아 있음

### 다음 작업
- 실사용 면장 샘플 5~10건으로 OCR 필드별 인식률 확인
- 로그인 세션이 있는 상태에서 PR19 권한별 반응형 화면 확인
- E2E smoke 로컬 DB 실행 확인

---

## 2026-05-01 세션 — PR19 운영 신호 실제 데이터 배선

### 완료
- PR19 좌측 사이드바의 목업 숫자 배지를 제거하고 실제 `useAlerts` 알림 건수에서 파생하도록 변경
  - 재고: 장기재고 주의/심각
  - L/C·은행: LC 만기/한도 부족
  - B/L: 입항 예정
  - 수주/출고/수금: 납기 임박, 현장 미등록, 계산서 미발행, 미수금 주의/연체
- 헤더 알림 벨과 사이드바 배지가 같은 알림 계산 결과를 사용하도록 `AlertBell` 입력을 정리
- 대시보드 우측 레일에 실제 운영 워크큐, 미착품 ETA, 수주 잔량/납기 데이터를 연결
- `useAlerts`의 미수금 계산을 현재 `customer-analysis.items` 응답 스키마에 맞게 보정
- 계산서 미발행 조건을 “매출 없음 또는 세금계산서 발행일 없음”으로 보정
- 알림 계산 회귀 테스트 `useAlerts.test.tsx` 추가
- 설계 판단 D-102 추가: PR19 내비게이션 배지는 운영 알림 훅을 정본으로 사용

### 검증
- `cd frontend && npm run test` 성공 — 4 files / 10 tests
- `cd frontend && npm run lint` 성공
- `cd frontend && npm run build` 성공
- in-app browser에서 `/login` 렌더 확인

### 다음 작업
- 로그인 세션이 있는 상태에서 대시보드/재고/구매/판매/설정의 권한별 반응형 화면 직접 확인
- 아마란스 RPA 배포 ZIP 생성 및 운영 PC 1회 로그인 리허설
- OCR 실사용 샘플 기반 품목/거래처 후보 매칭 고도화

---

## 2026-05-01 세션 — PR19 반응형 셸 보강

### 완료
- 640px 이하 화면에서 PR19 좌측 사이드바를 하단 가로 아이콘 도크로 전환
- 모바일 도크에서도 실제 운영 알림 배지가 보이도록 `sf-nav-badge` 표시 규칙 보정
- 대시보드 KPI 영역을 공통 `sf-command-kpis` 반응형 그리드로 변경
- 좁은 화면에서 표는 원래 컬럼 구조를 유지하면서 가로 스크롤되도록 보정
- 대시보드 라우트 외곽 패딩을 모바일에서 줄여 본문 가독성 확보
- 설계 판단 D-103 추가: PR19 모바일 셸은 하단 아이콘 도크로 전환

### 검증
- `cd frontend && npm run build` 성공
- `cd frontend && npm run lint` 성공
- `cd frontend && npm run test` 성공 — 4 files / 10 tests
- in-app browser에서 `/login` 모바일 폭 렌더 확인

### 제한
- 실제 로그인 세션이 필요한 protected 내부 화면의 권한별 모바일 클릭 검증은 아직 별도 확인 필요

### 다음 작업
- 로그인 세션이 있는 상태에서 대시보드/재고/구매/판매/설정의 권한별 반응형 화면 직접 확인
- 아마란스 RPA 배포 ZIP 생성 및 운영 PC 1회 로그인 리허설
- OCR 실사용 샘플 기반 품목/거래처 후보 매칭 고도화

---

## 2026-04-30 세션 — PR19 디자인 실제 프론트 1차 배선

### 완료
- PR19 `frontend/mockups/v3` 정적 목업의 CSS와 JS 컴포넌트 구조를 실제 React/TypeScript 화면으로 포팅하기 시작
- 로그인 화면을 PR19 다크 오퍼레이션 콘솔 스타일로 교체
- 기존 TopNav 기반 레이아웃을 PR19 좌측 사이드바 + 상단 커맨드바 셸로 교체
- 대시보드와 재고관리 화면에 PR19 타일, 패널, 우측 레일, 필터 칩 디자인 적용
- 구매/입고 화면의 P/O, 계약금, L/C, B/L, 단가이력 탭을 PR19 KPI + 중앙 패널 + 우측 레일 구조로 정리
- 판매/수금 화면의 수주, 출고, 판매/계산서, 수금, 수금매칭 탭을 PR19 운영 콘솔 구조로 정리
- 수입금융 화면의 한도 현황, 만기 알림, 변경 이력, 수요 예측 탭을 PR19 운영 콘솔 구조로 정리
- 매출분석 화면을 PR19 필터 패널, KPI 타일, 차트/거래처 패널, 우측 레일 구조로 정리
- 통관/부대비용 화면의 부대비용, 환율 비교 탭을 PR19 KPI + 중앙 패널 + 우측 레일 구조로 정리
- 법인, 제조사, 품번, 거래처, 창고/장소, 은행, 공사 현장 마스터 화면을 PR19 마스터 콘솔 구조로 정리
- L/C, B/L 입고, 출고/판매 단독 라우트를 PR19 운영 콘솔 구조로 정리
- 결재안 자동 생성, OCR, 메모, 검색, 설정 화면을 PR19 유틸 콘솔 구조로 정리
- PR19 공통 UI 조각을 `MockupPrimitives`로 분리해 다음 화면 이관 기반 마련
- `MasterConsole`을 확장해 마스터/업무/유틸 화면의 KPI, 중앙 데이터 패널, 우측 운영 레일을 재사용

### 검증
- `cd frontend && npm run build` 성공

### 다음 작업
- PR19 더미 데이터에서만 표현되던 경보/워크큐/미착 흐름을 실제 API 데이터와 더 깊게 연결
- 로그인 후 실제 권한별 화면에서 대시보드, 재고관리, 구매/입고, 판매/수금, 설정 레이아웃 반응형 확인

---

## 2026-04-30 세션 — 아마란스 RPA 사용자 배포 버튼

### 완료
- 아마란스 출고 내보내기 창에 `자동화 받기` 버튼 추가
  - `/api/v1/export/amaranth/rpa-package`에서 Windows 자동화 ZIP 다운로드
  - 서버가 다운로드 시 `.env`에 SolarFlow API 주소, RPA 토큰, 아마란스 업로드 URL 주입
- RPA 워커 브라우저 정책 변경
  - `AMARANTH_BROWSER_CHANNEL=auto`
  - 설치된 Chrome 우선, 없으면 Windows 기본 Edge 사용
  - 별도 Chromium 다운로드는 fallback으로만 사용
- 사용자용 Windows 배치 파일 추가
  - 로그인 세션 저장, 1회 실행, 감시 실행, 시작프로그램 등록/해제
- 운영자용 패키징 스크립트 추가
  - portable Node와 `node_modules`를 포함한 배포 ZIP 생성

### 검증
- `cd rpa/amaranth-uploader && npm run check` 성공
- `cd backend && go test ./... && go vet ./... && go build ./...` 성공
- `cd frontend && npm run build` 성공
- `git diff --check` 성공
- `graphify update .` 성공

### 제한
- 실제 배포 ZIP에는 Windows용 portable Node.js를 `runtime/node/node.exe`에 넣어야 함
- 운영 환경변수 `SOLARFLOW_AMARANTH_RPA_PACKAGE`, `SOLARFLOW_PUBLIC_API_URL`, `AMARANTH_OUTBOUND_UPLOAD_URL` 설정 필요

---

## 2026-04-30 세션 — 입고관리 드래그 OCR 자동입력 정리

### 완료
- 입고관리 화면에서 PDF/사진 파일을 드래그하면 입고등록 창으로 바로 진입하도록 변경
  - 입고 구분은 해외직수입으로 자동 선택
  - OCR 입력값 확인창을 먼저 표시
  - 사용자가 확인해야 B/L 입력칸에 반영
- B/L 입력 폼 내부에서도 PDF/사진 선택 또는 드래그 업로드 가능
- `harness/OCR_AUTOFILL_ROADMAP.md` 추가
  - 완료된 OCR 자동입력 기능
  - 알려진 제한
  - 다음 작업 순서 정리
- 설계 판단 D-099 추가: 입고관리 전체 드롭은 “입고등록 자동 진입 + 확인 후 반영” 흐름으로 운영

### 검증
- `npm run build` 성공
- `git diff --check` 성공
- `graphify update .` 성공

### 다음 작업
- 실사용 수입필증/면장 샘플 5~10건으로 필드별 인식률 확인
- 모델/규격 기반 품목 매칭 고도화
- 수입자/무역거래처를 마스터 후보로 제시하는 확인창 개선
- OCR 후보와 원본 파일을 B/L 상세 첨부/감사 로그로 연결

---

## 2026-04-30 세션 — 면장 PDF OCR 자동채움 1차 구현

### 완료
- `POST /api/v1/ocr/extract`에 `document_type=customs_declaration` 구조화 후보 응답 추가
  - 면장번호, B/L(AWB)번호, 입항일, CIF 원화금액, 환율, HS코드, 세관, 항구, 수입자, 운송주선인, 무역거래처 후보
  - 모델/규격, 수량, 단가(USD/Wp), 금액(USD) 라인 후보
- 이미지 기반 수입필증 스캔본 대응
  - 일반 텍스트 추출이 안 되는 PDF는 기존 RapidOCR sidecar 사용
  - 한글 라벨 OCR이 깨져도 좌표/영문/숫자 패턴으로 샘플 필드 추정
- B/L 입력/수정 폼에 `면장 PDF 자동채움` 버튼 추가
  - PDF 선택 후 B/L번호, 실제입항일, 포워더, 항구, 입고품목, 면장 CIF 원화금액, 환율 자동 채움
  - 수입자/무역거래처/신고일/HS/세관 등 직접 저장하지 않는 값은 참고 요약으로 표시
- 설계 판단 D-098 추가: 자동 저장 금지, 폼 후보 반영 후 확인 저장

### 검증
- `bash scripts/setup_ocr_sidecar.sh` 성공
- 샘플 PDF `DFS815002444 탑솔라 수입필증 2026.04.16.pdf` RapidOCR 실행 성공
- `cd backend && go test ./...` 성공
- `cd backend && go build ./... && go vet ./...` 성공
- `cd frontend && npm ci` 후 `npm run build` 성공

### 제한
- 수입자/무역거래처를 마스터와 자동 매칭해 법인/제조사를 바꾸는 것은 아직 하지 않음
- 품목 자동채움은 OCR 모델/규격 문자열이 현재 제조사의 품번명 또는 품번코드와 매칭될 때만 적용
- `graphify update .`는 별도 확인 필요

---

## 2026-04-30 세션 — 아마란스 웹 출고 업로드 RPA 워커 초안

### 완료
- `rpa/amaranth-uploader` Node/Playwright 워커 추가
  - `npm run login`: 사람이 아마란스 로그인 후 브라우저 프로필 저장
  - `npm run once`: `pending` 출고 업로드 작업 1회 처리
  - `npm run watch`: 대기열을 주기적으로 감시하며 처리
- 아마란스 자동화 흐름 반영
  - `출고등록엑셀업로드` 화면 확인
  - 로그인 화면 감지 시 `AMARANTH_AUTO_LOGIN=true` 환경에서 회사코드/아이디/비밀번호 자동 입력 fallback
  - `기능모음 → 엑셀 업로드 → 변환확인`
  - 성공 문구 미확인 시 `manual_required`로 남김
- 실패 복구 기반 추가
  - `artifacts/` 스크린샷 저장
  - `last_error`에 오류 코드와 캡처 경로 기록
  - 화면 문구 변경은 `.env` 정규식으로 조정
- RPA 인증 보강
  - `SOLARFLOW_AMARANTH_RPA_TOKEN` 설정 시 `/api/v1/export/amaranth/*` 경로에서만 operator 권한으로 통과
  - 사용자 access token 직접 복사 없이 워커 실행 가능
- Go API에 작업 선점 엔드포인트 추가
  - `POST /api/v1/export/amaranth/jobs/{id}/claim`
  - `pending` 작업만 `running`으로 바꾸고 attempts를 1 증가
  - 이미 다른 워커가 가져간 작업은 409로 차단
- 설계 판단 D-100 추가: 아마란스 웹 자동화는 별도 Playwright 워커 + 수동확인 안전장치로 시작

### 제한
- 실제 아마란스 계정/세션으로 브라우저 리허설 필요
- `SOLARFLOW_AMARANTH_RPA_TOKEN`은 운영 환경변수로 길고 임의적인 값을 지정해야 함
- `AMARANTH_PASSWORD`는 자동화 전용 PC의 로컬 `.env`에만 두고 저장소에 포함 금지
- Windows 시작프로그램/launchd 등록은 실제 PC 리허설 후 고정

---

## 2026-04-30 세션 — 문서 OCR 워크벤치 내장

### 완료
- `../module` 프로젝트의 PaddleOCR/RapidOCR ONNX sidecar 패턴을 SolarFlow에 맞게 이식
- `POST /api/v1/ocr/extract` 추가
  - multipart `images` 여러 개 처리
  - 이미지/PDF를 임시 파일로 전달하고 persistent sidecar가 OCR 수행
  - OCR 결과는 DB 자동 저장 없이 원문 텍스트, 줄별 신뢰도, 좌표로 반환
- `GET /api/v1/ocr/health` 추가
  - sidecar 설정/실행/ready 상태 확인
  - `warm=1`로 PaddleOCR 모델 로드까지 사전 점검
- `/ocr` 프론트 화면 추가
  - 이미지/PDF 선택, 추출 실행, 원문 텍스트 편집, 줄별 좌표 확인, 텍스트 복사
  - OCR sidecar 준비 상태 표시와 수동 상태 확인 버튼 추가
  - 사이드바 도구 메뉴에 `문서 OCR` 추가
- `scripts/setup_ocr_sidecar.sh` 추가
  - `backend/.venv-ocr` 생성, `rapidocr-onnxruntime`/`PyMuPDF` 설치, sidecar `--check` 실행
- 설계 판단 D-096 추가: OCR은 자동 저장 전 미리보기 워크벤치로 운영

### 제한
- 명시적 ONNX 모델 파일은 운영 정확도 검증 후 `backend/internal/ocr/sidecar-src/models/` 또는 환경변수 경로로 배치
- OCR 결과 자동 등록과 제조사별 좌표 파서는 별도 TASK로 확장
- 검증: `go build ./...`, `go vet ./...`, `go test ./...` 성공
- 검증: `./scripts/apply_go.sh` 성공(현재 환경은 `codesign`/`launchctl` 없음으로 해당 단계 스킵)
- 검증: `node node_modules/vite/bin/vite.js build` 성공, `npm run build`는 현재 환경의 `node_modules/.bin/tsc` 없음으로 실패
- 검증: `scripts/setup_ocr_sidecar.sh` 실행 성공, `backend/.venv-ocr` 설치 및 sidecar `{"ready": true}` 확인
- 검증: 실제 sidecar에 PNG 경로 입력 → `{"ready": true}` 후 `{"raw": []}` 응답 확인
- 제한: `graphify update .`는 현재 환경에 `graphify` 명령이 없어 미실행

---

## 2026-04-30 세션 — 아마란스 웹 출고 업로드 기반

### 출고 export 실물 양식 반영
- 아마란스 웹 `출고등록엑셀업로드` 실물 파일 기준으로 출고 export 구조 보정
  - 1행: 한글 헤더
  - 2행: ERP 필드코드
  - 3행: 타입/길이/필수 여부 설명
  - 4행부터 데이터
- 출고 기본 정책 결정
  - `PLN_CD`: 기본 `A001` (`AMARANTH_DEFAULT_PLN_CD`로 override 가능)
  - `MGMT_CD`: 기본 `LS10` (`AMARANTH_OUTBOUND_MGMT_CD` 또는 `AMARANTH_DEFAULT_MGMT_CD`로 override 가능)
  - `VAT_UM`: 실물 샘플과 동일하게 공란

### 아마란스 업로드 작업 대기열
- `amaranth_upload_jobs` 테이블 추가
  - 생성된 `.xlsx` 파일 경로, 파일명, SHA-256, 행 수, 상태, 생성자, 시도 횟수, 결과 메시지 추적
  - `job_type + file_sha256` unique로 동일 파일 중복 작업 생성 방지
- Go API 추가
  - `POST /api/v1/export/amaranth/outbound/jobs`: 출고 엑셀 생성 + 파일 저장 + 작업 생성
  - `GET /api/v1/export/amaranth/jobs`: 작업 목록
  - `GET /api/v1/export/amaranth/jobs/{id}/download`: 저장된 엑셀 다운로드
  - `PUT /api/v1/export/amaranth/jobs/{id}/status`: RPA 상태 갱신
- 프론트 `AmaranthExportDialog`에 출고용 `업로드 작업` 버튼 추가

---

## 2026-04-28 세션 문서 최신화 — 코드 기준 TODO 정리

### 완료로 확인한 이전 TODO
- **PODetailView 서브테이블 개선**: `LCSubTable`, `TTSubTable`, 종합정보 요약 카드, 4단계 MW 진행률(계약 → LC → 선적 → 입고완료) 구현 확인
- **LCForm defaultPoId 연결**: PO 목록/PO 상세의 `+ L/C 추가`가 `defaultPoId`를 전달하고, 신규 LCForm에서 해당 PO를 잠금 선택 상태로 표시
- **B/L별 개별 MW 표시**: PO 목록 펼침 영역에서 B/L 라인별 `capacity_kw` 합산 → `blMwMap`으로 개별 MW 표시

### 코드 기준 추가 반영된 기능
- `lc_line_items` 기반 LC 품목 명세 저장/조회 (`GET /api/v1/lcs/{id}/lines`)
- `module_demand_forecasts` 운영 forecast API + 재고 화면 수요 계획 패널
- `document_files` 첨부파일 메타데이터/업로드/미리보기/다운로드 API + B/L 상세 서류 탭
- 출고별 운송비 입력 패널 (`expenses`의 `transport`, `outbound_id` 필터)
- Rust 계산 API에 `/api/calc/inventory-turnover` 추가

---

## 2026-04-28 세션 — 개발속도 가속 기반 작업

### 검증/반영 원클릭화

- 루트 `scripts/` 추가
  - `verify_all.sh`: Go build/vet/test, 백엔드 규칙 lint, Request 구조체↔DB 스키마 검사, Rust test, 프론트 build 일괄 실행
  - `apply_go.sh`: Go 빌드 → 코드서명 → launchd bootout/bootstrap
  - `apply_rust.sh`: Rust release 빌드 → 코드서명 → launchd stop/start
  - `apply_frontend.sh`: Caddy 정적 서빙용 `dist/` 빌드
  - `scripts/README.md`: 사용법과 옵션 정리
- 기존 백엔드 RULES lint 부채 33건이 있어 기본 실행에서는 advisory로 표시, `STRICT_RULES=1`일 때 차단하도록 설정

### 프론트 반복 UI 부품화

- `frontend/src/components/common/GroupedMiniTable.tsx` 추가
  - LC/T/T/B/L 등 하위 미니 테이블 재사용 기반
- `frontend/src/components/common/StatusPill.tsx` 추가
  - 상태 라벨 pill 공통화
- `frontend/src/components/common/ProgressMiniBar.tsx` 추가
  - T/T, LC, MW 진행률 바 공통화
- `PODetailView`의 LC/T/T 서브테이블과 진행률 표시에 공통 컴포넌트 우선 적용

### 검증 결과

- `npm run build` 성공
- `./scripts/verify_all.sh` 성공
  - Go build/vet/test 성공
  - Rust test 성공 (75개 PASS)
  - Frontend build 성공
- 제한: 현재 작업 환경에 `psql` 없음 → schema check skip
- 제한: 기존 RULES lint 부채 33건 advisory 표시
- `graphify update .` 시도했으나 현재 환경에 `graphify` 명령 없음

### 추가 가속 작업

- `scripts/verify_changed.sh` 추가
  - 변경 파일 기준으로 backend / engine / frontend / shell syntax 검증을 선택 실행
  - 기준 브랜치는 upstream이 있으면 upstream, 없으면 `origin/main`
  - 알 수 없는 경로 변경 시 `verify_all.sh`로 자동 전환
- `GroupedMiniTable` 확장
  - 행 클릭, 행 title, 행 뒤 추가 렌더링 지원
  - 삭제 에러 행이 있는 리스트 테이블에도 적용 가능
- 공통 UI 적용 확대
  - `POListTable`: `StatusPill`, `ProgressMiniBar` 적용
  - `POInboundProgress`: `ProgressMiniBar` 적용
  - `LCListTable`: `StatusPill`, `ProgressMiniBar` 적용
  - `TTListTable`: `GroupedMiniTable`, `StatusPill` 적용

---

## 2026-04-28 세션 정리 — Rust 연동 표식 + Phase 확장 앵커

### 완료된 Rust 연동 TODO 정리
- 오래된 `TODO: Rust 계산엔진 연동` 주석 제거/정정
  - Landed Cost: `/api/v1/calc/landed-cost` 프록시 사용
  - LC 수수료/한도/만기: `/api/v1/calc/lc-fee`, `/lc-limit-timeline`, `/lc-maturity-alert` 프록시 사용
  - 재고/마진/수금/검색 계열: 기존 Rust CalcProxy 경로 기준으로 주석 정리
- `LandedCostPanel` 응답 필드 오류 수정: Rust 응답 `items` 기준으로 렌더링
- `ExchangeComparePanel`을 Rust `/api/v1/calc/exchange-compare` 응답 구조에 맞게 수정

### Phase 확장 미해결 항목 코드 앵커 추가
- D-022: `engine/src/calc/inventory.rs` — FIFO 전까지 최초 입고일 기준 장기재고 판별 명시
- D-024: `engine/src/calc/landed_cost.rs`, `frontend/src/hooks/useExchange.ts` — 실시간 환율 API 전까지 최근 면장 환율 사용 명시
- D-030: `backend/internal/handler/lc.go` — LC 수수료 수동 보정 Phase 확장 앵커
- D-031: `engine/src/calc/margin.rs`, `backend/internal/handler/outbound.go` — FIFO 원가/출고 검증 Phase 확장 앵커
- D-064: `backend/internal/handler/attachment.go` — PDF 보관과 PDF 자동 입력 Phase 5 분리 명시
- D-067: `/api/v1/export/amaranth/sales` 501 응답 추가 — 실물 양식 확보 전 미구현 상태 명확화

---

## 2026-04-28 세션 완료 — E2E smoke test 작성

### PO → LC → BL → 면장 → 재고 → 수주 → 출고 → 매출 → 수금 자동 검증

- `harness/e2e_solarflow_smoke.sql` 보강
  - `SF-E2E-*` 접두어 테스트 데이터를 생성
  - PO 라인 → LC 품목 명세(`lc_line_items`) → B/L 라인(`po_line_id`) 연결 검증
  - 면장(`import_declarations`) + 원가(`cost_details`) + 부대비용(`incidental_expenses`) 생성
  - 재고 기준 수량 검증: 완료 B/L 3,200kW - active 출고 640kW = 2,560kW
  - 수주 완료, 출고, 매출, 수금 매칭 후 미수금 0원 검증
- `harness/run_e2e_smoke.sh` 추가
  - `psql -v ON_ERROR_STOP=1`로 실행하여 SQL 내부 `RAISE EXCEPTION` 발생 시 자동 실패 처리
  - `DATABASE_URL` 또는 `SUPABASE_DB_URL` 환경변수 사용 가능

---

## 2026-04-28 세션 긴급 수정 — 핸들러 에러 처리 + 트랜잭션화

### 생산 데이터 정합성 보강

#### DB / Go API
- `backend/migrations/036_handler_transaction_rpcs.sql` 추가
  - 출고 생성/수정/삭제: `sf_create_outbound`, `sf_update_outbound`, `sf_delete_outbound`
  - PO 삭제: `sf_delete_purchase_order`
  - 면장 삭제: `sf_delete_declaration`
  - 수주 출고 진행률: `sf_recalculate_order_progress`
- Go 핸들러의 다단계 DB 변경을 PostgREST RPC 1회 호출로 전환
  - 중간 실패 시 PostgreSQL 트랜잭션 전체 롤백
  - 출고 B/L 연결, 매출 연결 해제/삭제, 수주 진행률 갱신 포함
- 첨부파일 삭제는 파일을 `.deleting`으로 먼저 이동한 뒤 DB 레코드를 삭제하고, DB 삭제 실패 시 파일을 원위치로 복구
- 대상 파일의 무시된 `Delete`, `os.Remove`, `json.Unmarshal`, `map[string]interface{}` 패턴 제거

#### 검증
- `go build ./...` PASS
- `go vet ./...` PASS
- `go test ./...` PASS
- `git diff --check` PASS
- `lint_rules.sh` PASS (0건)

---

## 2026-04-28 세션 완료 작업 — 프론트엔드 회귀 테스트 기반 구축

### Vitest + Testing Library 도입
- `frontend`에 `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` 추가
- `npm test` / `npm run test:watch` 스크립트 추가
- `vite.config.ts`에 jsdom 테스트 환경과 `src/test/setup.ts` 공통 polyfill 설정 추가

### 최근 회귀 위험 컴포넌트 테스트 추가
- `src/test/fixtures.ts`, `src/test/mockApi.ts`: 공통 fixture, Zustand store 초기화, `fetchWithAuth` mock, JSON body 파서 헬퍼 추가
- `OrderForm.test.tsx`: 가용재고 예약 → 수주 전환 prefill, `customer_hint` 거래처 자동 매칭, 수량/단가/발주번호/현장명 표시, 저장 payload, 미착품→실재고 자동 전환, `alloc_id` 기반 법인 복원 검증
- `AllocationForm.test.tsx`: 모달 헤더/푸터 고정 + 본문 `overflow-y-auto` 스크롤 구조, 수정 모드 notes의 `[발주번호:X]` 파싱/저장, 현재고+미착품 분할 예약 group_id 검증
- `POListTable.test.tsx`: PO 라인/LC/TT 집계 우선 로드, 행 펼침 시 B/L lazy-load와 B/L별 MW 표시, `+ L/C 추가`, B/L 행 선택, 초안 PO 삭제 전 T/T 연동 삭제 경고, 빈 목록 액션 검증
- `POListTable` React key 경고 수정: PO 행 그룹 Fragment에 `key` 부여

### 검증 결과
- `npm test` 통과: 3개 테스트 파일 / 9개 테스트 PASS
- `npm run build` 통과
- `npm run lint`는 기존 프론트 전체 lint 198건으로 실패 (신규 테스트 파일 원인 아님)
- `graphify update .` 실행 시도했으나 이 worktree에 `graphify` 명령과 `graphify-out/` 디렉터리가 없어 갱신 불가

---

## 2026-04-28 세션 추가 — 감사 로그 + 운영 데이터 취소 보존

### PO/LC/출고/매출 감사 추적

#### DB / Go API
- `backend/migrations/037_audit_logs_and_soft_cancel.sql` 추가
  - `audit_logs` 테이블 생성: 대상 테이블, 대상 ID, action(create/update/delete), 요청자 user_id/user_email, API 경로, 변경 전후 JSON 저장
  - PO/LC 상태에 `cancelled` 허용, `sales.status` 추가
  - `sf_delete_outbound`, `sf_delete_purchase_order`를 soft cancel 방식으로 재정의
- `GET /api/v1/audit-logs` 추가: entity_type/entity_id/action/user_id 필터 지원
- PO/LC/출고/매출 생성·수정·삭제 요청 시 감사 로그 기록
- 출고/매출 엑셀 Import 생성 건도 `note='excel_import'`로 감사 로그 기록

#### Soft cancel 정책
- PO DELETE → `purchase_orders.status='cancelled'`
- LC DELETE → `lc_records.status='cancelled'`
- 출고 DELETE → `outbounds.status='cancelled'`, 출고 기준 매출은 취소 처리 또는 수주 기준 매출의 outbound 연결 해제
- 매출 DELETE → `sales.status='cancelled'`
- Rust 마진/미수금/단가추이/검색 계산에서 취소 매출 제외

#### 프론트엔드
- PO/LC/출고 삭제 문구를 취소 처리로 변경
- PO/LC/매출 타입에 cancelled 상태 반영

#### 검증
- `backend`: `go test ./...`, `go vet ./...`, `go build ./...` PASS
- `engine`: `cargo test` PASS
- `frontend`: `npm run build`는 현재 환경에 `tsc`가 없어 실행 실패
- DB 마이그레이션 적용은 현재 환경에 `psql`이 없어 미실행
- `graphify update .`는 현재 환경에 `graphify`가 없어 미실행

---

## 2026-04-28 세션 안정성 수정 — 부분 실패/재고 검증/프론트 예외

### DB / Go API
- LC 등록/라인 저장과 LC 라인 교체 수정을 PostgREST RPC 트랜잭션으로 전환
- PO 삭제, 출고 등록/수정/삭제는 기존 핸들러 RPC 흐름 위에서 중간 실패 시 전체 롤백 유지
- 출고 Create/Update 전에 Rust 재고 집계 결과로 active 출고 가용재고 부족 차단
- LC RPC 응답 본문 처리를 위해 PostgREST RPC 실패 상태를 Go error로 반환하는 `internal/dbrpc` 추가

### 프론트엔드 / 검증
- 공통 fetch가 204/빈 응답/JSON 아닌 성공 응답을 안전하게 처리
- 전체 법인 계산 중 일부 법인 실패를 더 이상 조용히 merge하지 않고 오류로 노출
- OrdersPage setter 선언 순서와 SearchInput render 중 ref 갱신 lint 후보 수정
- `.gitattributes`의 shell LF 규칙으로 검증 스크립트 CRLF 회귀 방지

---

## 2026-04-27 세션 긴급 수정 — LC 다품목 PO 대응

### PO 라인아이템 → LC 품목 명세 연동

#### DB / Go API
- `lc_line_items` 테이블 추가: LC별 `po_line_id`, `product_id`, 수량, 용량, 금액, 단가, 유상/무상, 본품/스페어 저장
- `CreateLCRequest` / `UpdateLCRequest`에 `line_items` 추가
- `GET /api/v1/lcs/{id}/lines` 추가
- LC 등록/수정 시 본문은 `lc_records`, 품목은 `lc_line_items`로 분리 저장

#### 프론트엔드
- `LCForm`에서 PO 선택 시 유상 PO 품목을 LC 품목 명세로 자동 표시
- 품목별 LC 수량 조정 가능, 합계 수량/MW/USD는 자동 계산되어 LC 본문에 반영
- 과거 LC는 저장된 LC 품목이 없으면 기존 `target_qty` 기준으로 PO 라인에서 복원

---

## 2026-04-27 세션 보안 정리

### 공개 repo / Supabase 키 정리

- Git 추적 대상에서 로컬 `.env` 파일 제거, 예시 파일만 유지
- Supabase 백엔드 관리자 키를 `service_role` JWT에서 새 Secret API Key로 교체
- 실수로 삭제된 Publishable key는 새 `sb_publishable_...` 키로 복구하고 프론트 env에 반영
- Supabase DB password reset 완료
- `postgrest.conf`의 DB 접속 문자열을 `$(SUPABASE_DB_URL)` 환경변수 참조로 변경
- 로컬 PostgREST JWT secret을 `SUPABASE_JWT_SECRET`에서 `POSTGREST_JWT_SECRET`으로 분리
- Go 백엔드의 로컬 PostgREST 접근용 `SUPABASE_KEY`를 새 로컬 전용 JWT로 교체

---

## 2026-04-16 세션 완료 작업 (2차 — 가용재고↔수주 연동)

### 가용재고 배정 → 수주 자동 연동 (배정예정 → 수주 pre-fill + alloc 연결)

#### `frontend/src/pages/InventoryPage.tsx`
- `handleConfirmAlloc`: status 변경 제거, URL 파라미터로 수주 폼 pre-fill 데이터 전달
  - `alloc_id`, `product_id`, `quantity`, `customer`, `mgmt_cat`, `site`, `order_no` URL 파라미터 생성
  - notes 필드에서 `[발주번호:X]` 태그 파싱 → `order_no` 파라미터
  - `window.location.href`로 Orders 페이지 이동 (전체 리로드)
- `productMap`에 `manufacturer_name` 추가 → 배정 현황 테이블에 **제조사** 열 표시
- `useLocation` import + `location.key` → fetchAllocations useEffect 의존성 추가 (탭 이동 후 자동 갱신)

#### `frontend/src/components/inventory/AllocationForm.tsx`
- **스크롤 불가 수정**: DialogContent에 `flex flex-col max-h-[90vh] p-0 gap-0` 적용
  - DialogHeader: `shrink-0` (고정 헤더)
  - 폼 영역: `flex-1 overflow-y-auto px-6 py-4` (중간만 스크롤)
  - DialogFooter: `shrink-0 border-t` (고정 푸터)
- **고객 발주번호 입력란 추가** (purpose==='sale' 시만 표시)
  - `customerOrderNo` state
  - 저장 시 notes 앞에 `[발주번호:X]` 태그 prefix
  - 수정(edit) 모드: notes에서 파싱하여 자동 채우기

#### `frontend/src/components/orders/OrderForm.tsx`
- `OrderPrefillData` interface export (product_id, quantity, management_category, fulfillment_source, customer_hint, site_name, order_number)
- `prefillData?: OrderPrefillData | null` prop 추가
- 파란 배너: "📦 가용재고 배정에서 자동 입력" (prefill 시 표시)
- **거래처 자동 매칭 useEffect**: customer_hint(이름) → partners 목록에서 partner_id 역조회 → setValue

#### `frontend/src/pages/OrdersPage.tsx`
- URL 파라미터 읽기 useEffect (`?new=1&alloc_id=...&...`) — 빈 deps `[]`
- `pendingAllocId`, `orderFormPrefill` state 추가
- `handleCreateOrder`: 수주 생성 후 alloc에 `order_id` + `status: 'confirmed'` PUT 자동 연결
- OrderForm에 `prefillData` prop 전달

#### DB 수정 (PostgreSQL)
- `products` 테이블: `wattage_kw > 1.0` 레코드 `spec_wp / 1000`으로 일괄 수정
  - M-RS0635-01: `wattage_kw 635.000 → 0.635` (635Wp × 1000개 = 635kW 정상)

---

## 2026-04-16 세션 완료 작업 (1차)

### Rust 엔진
- **무상스페어 공제 SQL 수정** (`engine/src/calc/inventory.rs`)
  - `fetch_alloc_stock` / `fetch_alloc_incoming` — `status IN ('pending')` 조건에 `notes LIKE '[무상스페어]%'` 조건 추가
  - JKM640N 무상스페어 3200kW 정상 공제 확인

### 프론트엔드 — UI 대규모 개선

#### PO 발주/결제 페이지 (`ProcurementPage.tsx`)
- **우측 슬라이드 패널** 구현 (Sheet 컴포넌트 → 커스텀 드래그 패널로 교체)
  - 왼쪽 드래그 핸들: 패널 폭 520px~화면전체 자유 조절
  - 프리셋 버튼: 600px / 800px / 1000px / 1200px 원클릭
  - 헤더에 현재 폭(px) 실시간 표시
  - 닫기: × 버튼 / ESC 키 / 뒤 오버레이 클릭
  - 기본 폭: 900px (세션 내 유지)

#### POListTable (`components/procurement/POListTable.tsx`) — 전면 재작성
- **메인 행**: 품목/MW / 계약조건 / 계약금액+결제 / **L/C 현황(신규)** 칼럼 분리
  - L/C 칼럼: 개설금액 + 미니바 % + **개설MW** + **미개설MW** 표시
- **펼침 영역** 3개 섹션 추가:
  1. **MW 3단계 진행률 바**: 계약 → L/C 개설 → 입고완료 (가로 막대)
  2. **L/C 현황 미니 테이블**: LC번호/은행/금액/MW/만기일/상태/수정✎/합계행 + `+ L/C 추가` 버튼
  3. **입고 현황 미니 테이블**: B/L번호/ETD/ETA/상태 + 입고완료MW 합계행 + `+ 입고 등록` 버튼
- **Lazy-load**: 행 펼칠 때만 BL API 호출 (초기 로드 속도 유지)
- Props: `onEditLC`, `onNewLC` 추가 → ProcurementPage에서 LCForm 직접 오픈

#### DepositStatusPanel (`components/procurement/DepositStatusPanel.tsx`) — 전면 재작성
- PO 체인 탐색 (`buildChain()`) — parent_po_id 역추적, 사이클 감지
- `supersededIds`: parent로 참조된 PO는 별도 행 표시 안 함
- **행 클릭 동작 분기**:
  - 미납부 행 클릭 → 지급 등록 폼 즉시 오픈 (파란 hover + `+` 아이콘)
  - 납부완료 행 클릭 → T/T 이력 펼침/접힘
- TTSection / TTRow / ProgressBar 내부 컴포넌트화
- `onEditTT` prop으로 T/T 수정 폼 연결

#### TTListTable (`components/procurement/TTListTable.tsx`)
- **PO번호/제조사 미표시 버그 수정** → `useProcurement.ts`에서 `purchase_orders` nested 응답 flatten
- 행 전체 클릭 → 수정 (cursor-pointer + hover 강조)
- 연필 아이콘 hover 시 진해지는 효과

#### TTForm (`components/procurement/TTForm.tsx`)
- **환율 입력 → 원화 자동 계산**: `amount_usd × exchange_rate` = `amount_krw`
- USD 금액 변경 시에도 환율 있으면 자동 재계산
- 환율 필드: 예시 "예: 1,380.50", `(원/USD)` 단위 표기
- "환율 자동 계산" 파란 텍스트 힌트

#### PODetailView (`components/procurement/PODetailView.tsx`)
- **capacity_kw × quantity 이중계산 버그 수정** — `capacity_kw`는 라인 전체 kW이므로 quantity 곱셈 제거

#### 기타 테이블 5컬럼 그룹화 (이전 세션)
- `LCListTable`: 16컬럼 → 5컬럼 그룹화
- `BLListTable`: 13컬럼 → 5컬럼 그룹화
- `OrderListTable`: 14컬럼 → 5컬럼 그룹화

---

## 미완료 / 다음 작업 후보

### 즉시 처리 권장
1. **라이젠에너지 T/T 데이터 검증** — DepositStatusPanel의 PO 체인/분납/미납 표시를 실제 데이터로 대조
2. **운영 이관 입고 상태값 처리** — 기초재고 업로드 시 `completed`/`erp_done`으로 생성 또는 일괄 보정 옵션 확정
3. **첨부파일 운영 검증** — `SOLARFLOW_FILE_ROOT` 저장 경로, PDF 미리보기/다운로드/삭제 권한 점검
4. **출고 운송비 실사용 검증** — 출고 상세 운송비 패널과 결재안 운송비 월정산 데이터 흐름 확인
5. **수요예측 실사용 검증** — `module_demand_forecasts` 수동 계획이 재고/수급전망 판단에 맞게 보이는지 확인
6. **프론트엔드 회귀 테스트 확장** — Vitest 기반 9개 회귀 테스트는 구축 완료. 아직 전체 컴포넌트/useEffect 커버리지는 낮으므로 주요 CRUD 폼과 페이지 단위 테스트 추가 필요

### 중기 작업
7. 전체 UI 색상/아이콘 개선 (사용자 요청: 단조로운 디자인 개선, 밤/낮 배경색 등)
8. PODetailView 종합정보 LC 개설 38.82 MW 표시 정확성 확인 (실제 데이터 2개 LC 합계)
9. 코드 주석 TODO 중 실제 Rust 연동이 끝난 항목(LandedCostPanel 등) 표현 정리

### Phase 확장 미해결 (장기)
- LC 수수료 수동 보정 (D-030) — 코드 앵커: `backend/internal/handler/lc.go`
- FIFO 원가 매칭/출고 검증 (D-022, D-031) — 코드 앵커: `engine/src/calc/inventory.rs`, `engine/src/calc/margin.rs`, `backend/internal/handler/outbound.go`
- 실시간 환율 API (D-024) — 코드 앵커: `engine/src/calc/landed_cost.rs`, `frontend/src/hooks/useExchange.ts`
- PDF 자동 데이터 입력 (D-064) — 코드 앵커: `backend/internal/handler/attachment.go`
- 아마란스 매출마감 내보내기 (D-067) — 코드 앵커: `backend/internal/handler/export.go`, `frontend/src/components/excel/ExcelToolbar.tsx`

---

## 서비스 재시작 명령어 (자주 쓰는 것)

```bash
# Go 백엔드 수정 후 (반드시 이 순서)
cd ~/solarflow-3/backend && go build -o solarflow-go .
codesign -f -s - solarflow-go
launchctl bootout gui/501 ~/Library/LaunchAgents/com.solarflow.go.plist 2>/dev/null || true
launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.solarflow.go.plist

# Rust 엔진 수정 후
cd ~/solarflow-3/engine && cargo build --release
codesign -f -s - target/release/solarflow-engine
launchctl bootout gui/501 ~/Library/LaunchAgents/com.solarflow.engine.plist 2>/dev/null || true
launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.solarflow.engine.plist

# 프론트엔드 빌드 (Caddy 서빙용)
cd ~/solarflow-3/frontend && npm run build
```

### Rust API 엔드포인트 (16개)
- /health, /health/ready
- /api/calc/inventory (재고 집계)
- /api/calc/landed-cost (Landed Cost)
- /api/calc/exchange-compare (환율 비교)
- /api/calc/lc-fee (LC 수수료)
- /api/calc/lc-limit-timeline (한도 복원)
- /api/calc/lc-maturity-alert (만기 알림)
- /api/calc/margin-analysis (마진 분석)
- /api/calc/customer-analysis (거래처 분석)
- /api/calc/price-trend (단가 추이)
- /api/calc/supply-forecast (수급 전망)
- /api/calc/outstanding-list (미수금 목록)
- /api/calc/receipt-match-suggest (수금 매칭 추천)
- /api/calc/search (자연어 검색)
- /api/calc/inventory-turnover (재고 회전율)

## Phase 완료 이력

### Phase 1: Go 기초 보강 완료
| 작업 | 감리 점수 |
|------|----------|
| DB 14개 테이블 | 합격 |
| 마스터 6개 핸들러 | 8-9/10 |
| 인증 미들웨어 | 9/10 |
| PO/LC/TT/BL 핸들러 | 9/10 |

### Phase 2: 핵심 거래 모듈 완료
| 작업 | 감리 점수 |
|------|----------|
| Step 7: 면장/원가 | 9/10 |
| Step 8: 수주/수금 | 9/10 |
| Step 9: 출고/판매 | 9/10 |
| Step 10: 한도변경 + omitempty | 10/10 |
| Step 11A: 스키마 변경 | 10/10 |

### Phase 3: Rust 계산엔진 완료
| 작업 | 감리 점수 | 테스트 |
|------|----------|--------|
| Step 11B: Rust 초기화 + fly.io | 10/10 | - |
| Step 12: Go-Rust 통신 | 10/10 | 63개 |
| Step 13: 재고 집계 | 10/10 | 69개 |
| Step 14: Landed Cost + 환율 | 10/10 | 74개 |
| Step 15: LC 만기/수수료/한도 | 10/10 | 88개 |
| Step 16: 마진/이익률 + 단가 | 10/10 | 100개 |
| Step 17: 월별 수급 전망 | 10/10 | 110개 |
| Step 18: 수금 매칭 추천 | 10/10 | 127개 |
| Step 19: 자연어 검색 | 10/10 | 153개 |

### Phase 4: 프론트엔드 + 연동 + 배포 (완료)
| 작업 | 감리 점수 | 비고 |
|------|----------|------|
| Step 20: 인증 + CORS + CalcProxy | ✅ 완료 | CORS, 프록시 16개, users/me, 로그인 UI |
| Step 21: 레이아웃 + 마스터 CRUD 6개 | ✅ 완료 | AppLayout, Sidebar(역할별), DataTable, 6개 마스터 페이지+폼 |
| Step 22: 재고 화면 + 수급 전망 | ✅ 완료 | 3탭(재고/미착품/수급전망), 요약카드, 장기재고Badge, insufficient경고 |
| Step 23: 입고 관리 (B/L+라인) | ✅ 완료 | 목록/상세/생성/수정, 상태6단계, 입고유형4종, 라인아이템CRUD |
| Step 24: 발주/결제 (PO+LC+TT+단가) | ✅ 완료 | 4탭, PO 5서브탭, 입고진행률바, LC만기임박, 단가인상/인하표시 |
| Step 25: 출고/판매 | ✅ 완료 | 2탭(출고관리/매출현황), 취소3단계, Wp단가자동계산, 그룹거래Switch, 세금계산서Badge |
| Step 26: 수주/수금+매칭 | ✅ 완료 | 3탭(수주/수금/매칭), 충당소스Badge, 매칭3단계(선택→체크→확정), 자동추천, 차액표시 |
| Step 27: 면장/원가 | ✅ 완료 | 3탭(수입면장/부대비용/환율비교), 원가3단계(FOB→CIF→Landed), Badge, LandedCost 미리보기/저장, 부대비용11유형, price-histories Go라우트추가 |
| Step 28A: 은행/LC+수요예측 | ✅ 완료 | 4탭(한도현황/만기알림/한도변경/LC수요예측), 요약카드4+3개, 사용률bar, Recharts AreaChart, D-Day Badge, 수수료펼침, PO별미개설, 3개월예측+대응방안(D-062) |
| Step 28B: 대시보드 | ✅ 완료 | 역할별분기(admin=Manager/executive=Executive), 카드6개, BarChart+LineChart, 알림9가지, 미착품/수주잔량/미수금프리뷰, Promise.allSettled 섹션별 독립로딩, 장기재고경고 |
| Step 29A: 엑셀 양식 다운로드+업로드 미리보기 | ✅ 완료 | 양식7종(입고/출고/매출/면장/부대비용/수주/수금), ExcelJS dynamic import(별도chunk 930KB), 드롭다운+코드표, 업로드파싱→검증→미리보기, 면장2시트탭, 에러행다운로드, 확정등록비활성(29B), D-063/D-064 |
| Step 29B: 엑셀 확정 등록 + Import API 7개 | ✅ 완료 | 29A즉시수정(통화하드코딩), 지적1(매출outbound_id), 지적2(면장+원가한번에전송), 지적3(B/L기본정보불일치경고), Go Import핸들러7개(inbound/outbound/sales/declarations/expenses/orders/receipts), FK해소+자동계산, ImportResultDialog, ConfirmDialog, 테스트13개PASS |
| Step 29C: 아마란스10 내보내기 | ✅ 완료 | 입고34컬럼+출고35컬럼 excelize, GET /export/amaranth/inbound·outbound, 거래구분/과세구분 매핑, 외화단가/원화단가 자동계산, 기간선택 AmaranthExportDialog, D-067/D-068 |
| Step 30: 결재안 자동 생성 6유형 | ✅ 완료 | 6유형카드선택, LC/BL/PO/거래처 기반 데이터조회, 수입통관부가세(CIF×0.1), approvalTemplates 텍스트생성, 미리보기Textarea수정, 클립보드복사, 수동입력(노란배경), Go변경없음 |
| Step 31: 메모+검색+알림 | ✅ 완료 | Go Note CRUD(소유권검사), 포스트잇 MemoPage+LinkedMemoWidget, Ctrl+K GlobalSearchBar(500ms디바운스), Rust search API연동, SearchPage(이력+예시), useAlerts 분리(useDashboard에서 추출), AlertBell+AlertDropdown, 5분자동갱신, 테스트8개 |
| Step 32: 배포+검증 | ✅ 완료 | ES256 JWKS인증(D-069), RLS비활성화(D-070), 전체법인합산(D-071), user_profiles 컬럼명 정렬, 구형파일삭제, 프론트Cloudflare+Go/Rust fly.io 3레이어 배포완료 |
| Step 33: Lightsail 서울 이전 | ✅ 완료 | Fly.io 도쿄→AWS Lightsail 서울(D-072), solarflow3.com 도메인(D-073), Caddy 리버스프록시+자동SSL(D-074), 직접바이너리+systemd, Docker미사용, 대시보드6초→2초 |
| Step 34: Mac mini 로컬 이전 | ✅ 완료 | PostgREST 로컬(D-075), Caddy 경로변환(D-076), auto-provision(D-077), Tailscale 외부접속(D-078), 프론트 정적서빙(D-079), launchd 5개 서비스, 재부팅테스트 성공 |
