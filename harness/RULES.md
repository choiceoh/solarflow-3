# SolarFlow 3.0 — 개발 규칙 (모든 작업에 적용)

## ⚡ 듀얼 product 관점 (헌법 #0)

이 프로젝트는 **두 개의 product 를 동시에 개발**한다 — 어느 한쪽이 다른 한쪽의 부속이 아님:

1. **ERP 시스템** — 무역/재고/회계 등 SolarFlow 그 자체 (도메인 product)
2. **GUI 메타 편집기** — Webflow/Figma/Builder.io 부류의 화면 편집 도구 (인프라 product)
   - `frontend/src/templates/{MetaForm,MetaDetail,ListScreen}.tsx` (런타임)
   - `frontend/src/pages/UIConfigEditor/*` (편집기)
   - `frontend/src/templates/registry.tsx` (코드 등록소)

### 판단 기준
- **반쪽 GUI 금지** — 새 메타 인프라 기능을 추가했는데 편집기에 픽커가 없으면 미완성. 한 PR 안에서 인프라 + 편집기 픽커 둘 다 들어가야 함.
- **runtime mimicry** — 편집기 UX 는 실제 화면과 닮게 (WYSIWYG). tabs 편집기 = 진짜 탭 네비, sections = 진짜 sections grid.
- **discoverable by GUI alone** — admin 이 docs 안 봐도 알 수 있어야 함. registry key (cellRendererId, permissionGuardId, asyncRefine.ruleId 등) 는 무조건 combobox / dropdown 으로 노출. 자유 텍스트 금지.
- **product polish 기준** — "내부 도구라 대충" 절대 금지. 편집기 작업도 ERP 도메인과 동등한 코드 리뷰 / UX / 검증 통과해야 commit.
- **우선순위 동등** — "도메인 작업 빨라야 하니 편집기는 나중에" 절대 금지. 새 메타 기능 추가 → 편집기 픽커 → 도메인 적용 순서.

## 아키텍처 원칙
- Go: 프론트엔드 (화면 UI, HTTP 처리, 자주 변경되는 부분)
- Rust: 백엔드 계산엔진 (원가, 환율, 재고집계, 마진, LC만기 등)
- Go↔Rust: REST API 게이트웨이로 통신
- DB: 로컬 PostgreSQL + PostgREST, 인증은 Supabase Auth 사용
- 이 구조를 임의로 변경하지 않음

## 코드 작성 규칙
1. 모든 데이터는 구조체(struct)로 타입 정의 (map[string]interface{} 사용 금지)
2. 모든 에러는 반드시 처리 (에러 무시 금지, _ 로 버리기 금지)
3. 모든 입력값은 핸들러에서 검증 (빈 값, 길이, 형식, 필수 여부)
4. 에러 응답은 구조화된 JSON (문자열 붙이기 금지)
5. 인증 미들웨어 통과 후에만 API 접근 가능 (/health, /login 제외)
6. Rust 계산 엔진 담당 로직은 Go에서 구현하지 않음:
   - Landed Cost 계산
   - 환율 환산 (시점별 비교)
   - 재고 집계 (물리적→가용→총확보량)
   - 마진/이익률 분석 (가중평균)
   - L/C 만기일 계산, 한도 복원 타임라인
   - 월별 수급 전망 (6개월)
   - 장기재고 판별
   - 수금 매칭 자동 추천
7. json.Unmarshal, json.NewDecoder 등 모든 직렬화 에러 처리 필수
8. HTTP 응답 전 반드시 Content-Type 헤더 설정
9. 주석은 한국어로, "비유:" 형태로 초보자가 이해할 수 있게

## 자동 검증 (매 작업 완료 시 반드시 실행)
1. go build ./... 성공 확인
2. go vet ./... 경고 0개 확인
3. 체크리스트 자체 평가:
   □ struct 타입 사용했는가?
   □ 모든 error 처리했는가?
   □ 입력값 검증 있는가?
   □ 설계문서(harness/SolarFlow_설계문서_통합판.md) 필드 누락 없는가?
   □ 에러 응답 형식 통일했는가?
   □ 인증 체크가 적용되었는가?
   □ Rust 담당 로직이 Go에 들어가지 않았는가?
4. 시니어 Go/Rust 개발자 관점 자체 리뷰 (10점 만점 + 감점 이유)
5. 문제 발견 시 스스로 수정 후 다시 검증
6. "괜찮아요", "충분해요", "나중에 해도 돼요" 금지 — 설계문서 기준으로만 판단

## 보고 형식 (매 작업 완료 시 필수)
---
✅ 작업: [작업명]
📋 체크리스트: 
  - struct 타입: [O/X]
  - 에러 처리: [O/X]
  - 입력값 검증: [O/X]
  - 설계문서 필드: [O/X]
  - 에러 응답 형식: [O/X]
  - 인증 체크: [O/X]
  - Rust 분리: [O/X]
🔍 자체 평가: [점수]/10
  감점 이유: [구체적으로]
⚠️ 알려진 제한: [있으면]
📌 다음 작업: [다음에 할 것]
---

## 참조 문서
- 설계문서: harness/SolarFlow_설계문서_통합판.md
- UI 표준 헌장 (버튼/테이블/필터/에러/상태 뱃지): harness/UI_STANDARDS.md
- 이 규칙은 모든 Go/Rust 코드 작업에 적용

---

## 감리 교훈 (감리 8차~17차에서 축적)

### 체크리스트 보고 규칙
- 미구현 항목은 "X — 미구현"으로 정직하게 적을 것. "예정"은 "완료"가 아님.
- 시공자 자체 평가 점수를 그대로 믿지 않음. 감리자가 별도 평가.
- 체크리스트만으로 합격 불가. 반드시 전체 코드(cat)를 제출할 것.

### 코드 패턴 규칙
- 익명 구조체 금지. 반드시 model 패키지에 명명 구조체를 만들 것.
- 공통 구조체(ToggleStatusRequest 등)는 model/common.go에 배치.
- Rust 담당 로직에 // TODO: Rust 계산엔진 연동 주석 필수. Go에서 임시 구현 금지.
- URL 파라미터를 req 구조체에 덮어쓰기 (보안: 클라이언트 body보다 URL이 우선).

### 검증 규칙
- 허용값 체크는 map[string]bool로 분리 (if-else 나열 금지).
- 양수 검증: 수량, 금액, 환율, 크기 등 물리적으로 양수인 필드는 <= 0 체크.
- 문자열 길이: utf8.RuneCountInString 사용 (한글 정확 측정).
- nullable 필드는 포인터 타입(*string, *int, *float64) 사용.

### 작업 흐름 규칙
- 커밋은 작업 단위별로 (한 번에 몰아서 하지 않음).
- 새 핸들러는 가장 복잡한 것 먼저 검증, 나머지는 패턴 신뢰.
- TASK는 시공자가 작성 → 감리자 검토 → 승인 후 작업 시작.

### 하네스 축적 규칙
- 매 TASK 완료 시 PROGRESS.md를 업데이트할 것 (완료 항목 이동, 다음 작업 갱신)
- 새로운 설계 판단이 있으면 DECISIONS.md에 추가할 것 (판단 번호 순차 부여)
- 이 두 파일 업데이트는 코드 커밋과 함께 포함할 것 (별도 커밋 아님)

### 즉시 수정 원칙
- 문제가 확인되면 바로 조치한다. 미루기 금지.
- "다음에", "나중에", "Phase 확장 시" 등으로 미루려면 반드시 DECISIONS.md에 이유를 기록할 것.
- 이유 없이 미루는 것은 규칙 위반.

### 멀티테넌트 (BARO/탑솔라) UI 규칙
- BARO 페이지의 시각적 디자인은 기본 페이지(탑솔라)를 그대로 따른다 — 테넌트별 별도 디자인 금지.
- `isBaroMode()` / `detectTenantScope()`는 **메뉴 가시성**(Sidebar.tsx), **사이드바 탭 테넌트 키**, **dev mock 프로필**(devMockMode.ts)에서만 사용 가능.
- 그 외 컴포넌트(레이아웃, 카드, 색상, 간격, 폰트, 배지, 버튼 등)에서는 절대 분기하지 않는다.
- 가드: `frontend/src/lib/tenantScope.test.ts`의 "tenantScope 사용처 가드"가 새 사용처를 차단. 정당한 사유로 추가하려면 ALLOWLIST를 늘리고 PR 리뷰에서 합의.

### 신규 도메인 추가 절차 (D-110 RegisterRoutes 패턴)
백엔드에 새 도메인(예: `/api/v1/foo`)을 추가할 때 다음 순서를 그대로 따른다:
1. **핸들러 파일**: `backend/internal/handler/{prefix}_foo.go`에 `FooHandler` 구조체와 `NewFooHandler(db *supa.Client) *FooHandler` 생성자, 그리고 메서드(`List`, `GetByID`, `Create` 등)를 작성한다. **prefix는 영역별로 강제** — `master_`(마스터 CRUD), `tx_`(트랜잭션), `baro_`(바로 전용), `sys_`(시스템·관리), `ai_`(AI/OCR), `io_`(import/export). 패키지는 단일 `handler`를 유지하므로 import 경로는 변하지 않음.
2. **RegisterRoutes 메서드**: `backend/internal/handler/routes.go`의 알파벳 자리에 `func (h *FooHandler) RegisterRoutes(r chi.Router, g middleware.Gates)`를 추가한다. 가드는 `r.With(g.Write)`, `r.Use(g.TopsolarOnly)` 형태로 직접 적용한다.
3. **router.go 1줄 추가**: `backend/internal/router/router.go`의 알파벳 자리에 `handler.NewFooHandler(a.DB).RegisterRoutes(r, a.Gates)` 1줄을 추가한다.
4. **golden 갱신**: `cd backend && go test ./internal/router -run TestRouteSnapshot -update`로 `testdata/routes.golden`을 갱신한다. (이 명령은 라우트 추가/변경 시 항상 실행 — 잊으면 CI에서 깨짐)
5. **테넌트 한정 라우트면**: D-108/D-109/D-119 동기화 규칙에 따라 `harness/{module,cable,baro}.md`의 라우트 표를 같은 PR에서 갱신한다.
6. **검증**: `go build ./... && go vet ./... && go test ./...` 모두 통과. 모델 필드를 추가했다면 위 "Go 모델 필드 변경 시 필수 절차"(CLAUDE.md)도 함께 수행.

⚠️ **router.go에 직접 `r.Route("/foo", ...)` 등록 금지** — 반드시 핸들러의 RegisterRoutes 메서드로 캡슐화한다. PR 충돌·가드 누락의 주된 원인이었음(D-110 도입 배경).

### 도메인별 인덱스 동기화 규칙
- 한쪽 테넌트 한정 기능(예: `tenants: ['baro']`, `tenants: ['topsolar', 'cable']`, `topsolarOnly`/`baroOnly` 미들웨어)을 추가·삭제·이동하면 **반드시** `harness/{module,cable,baro}.md`의 해당 섹션을 같은 PR에서 갱신할 것.
  - 활성 메뉴, `*Only` 미들웨어 적용 라우트 표, 「관련 결정」 D-NNN 링크 — 셋 중 영향 받는 곳을 갱신.
- 새 결정은 DECISIONS.md(정본)에 D-NNN으로 추가하고, 테넌트 한정이면 그 도메인 파일의 「관련 결정」에 1줄 색인만 추가. 결정 본문 복제 금지(SoT는 DECISIONS).
- 이 규칙을 지키지 않으면 도메인 파일이 곧 거짓이 되어, 새 사람이 들어왔을 때 어떤 사이트에 어떤 기능이 있는지 잘못 인식한다(CRM처럼 양쪽에 박는 실수의 재발 방지).

## 모듈 품질 체크리스트 (모든 CRUD 화면 공통)
1. 등록: 모든 필드가 Go API로 정확히 전달되는지
2. 수정: 기존 데이터가 폼에 정확히 로드되고 저장되는지
3. 삭제: 확인 다이얼로그 후 정상 삭제되는지
4. 상세조회: 모든 값이 한글로 표시되는지 (UUID/영문 금지)
5. 상태변경: 드롭다운에 전체 상태 목록 표시되고 선택 가능한지
6. 하위항목: 부모와 함께 저장/조회/삭제되는지
7. 드롭다운 전체: 선택 후 한글 라벨 유지 (UUID/영문 표시 금지)
8. 반응형: 창 크기 변해도 레이아웃 안 깨지는지
9. Go API: POST/PUT/DELETE에서 모든 필드 정확히 처리하는지
10. 에러처리: 실패 시 구체적 사유 표시, 성공 시에만 화면 닫기

### TASK 범위 준수 원칙
- 시공자(AI)는 승인된 TASK의 범위 내에서만 코드를 작성·수정한다.
- TASK에 명시되지 않은 파일 변경, 설계 변경, 구조 변경은 반드시 사전에 Alex에게 보고하고 승인을 받아야 한다.
- "이것도 같이 하면 좋을 것 같아서 했습니다"는 금지.
- 예외: 빌드 에러 수정, import 추가 등 TASK 수행에 필수적인 최소 변경은 허용하되 보고할 것.
