# 작업: Step 12 — Go↔Rust 통신 테스트
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.

## 파일 1: internal/engine/client.go (신규)

Rust 엔진 HTTP 클라이언트 모듈.

EngineClient 구조체:
- BaseURL string
- HTTPClient *http.Client (Timeout: 10초)

NewEngineClient(baseURL string) *EngineClient:
- http.Client 생성 (Timeout: 10초)
- baseURL 끝에 / 있으면 제거

CheckHealth() (HealthResponse, error):
- GET {BaseURL}/health/ready 호출
- 200이면 HealthResponse 파싱 반환
- 200 아니면 에러 반환 (상태코드 포함)
- 타임아웃/연결실패 시 에러 반환
- 모든 에러에 log.Printf 기록

HealthResponse 구조체:
- Status string json:"status"
- DB string json:"db"

CallCalc(path string, body interface{}) ([]byte, error):
- POST {BaseURL}/api/calc/{path} 호출
- body를 JSON 직렬화 -> 요청 본문
- Content-Type: application/json 설정
- 200이면 응답 바이트 반환
- 200 아닌 상태코드 -> 에러 (상태코드 + 응답 본문 포함)
- 주석 필수 (감리 지적):
  // 참고: Rust 엔진은 fly.io auto_stop으로 꺼져 있을 수 있음.
  // 첫 요청 시 콜드 스타트 1~3초 지연 가능. 타임아웃 10초로 충분.
  // 재시도 로직은 필요 시 추가 (현재 불필요).

## 파일 2: internal/engine/client_test.go (신규)

httptest.NewServer로 mock Rust 서버 테스트:
- TestCheckHealth_Success: 200 + {"status":"ready","db":"connected"} -> 성공
- TestCheckHealth_ServerDown: 연결 불가능한 URL -> 에러 반환
- TestCheckHealth_DBDisconnected: 503 -> 에러 반환
- TestCallCalc_Success: 200 + JSON -> 바이트 반환
- TestCallCalc_ServerError: 500 -> 에러 반환

## 파일 3: main.go 수정

환경변수 추가:
- ENGINE_URL: Rust 엔진 URL
  로컬: http://localhost:8081
  fly.io: http://solarflow-engine.internal:8081
  없으면 빈 문자열 (Rust 없이 Go만 동작)

서버 시작 시:
- ENGINE_URL이 있으면 EngineClient 생성 + CheckHealth() 호출
  성공: log.Println("Rust 엔진 연결 성공")
  실패: log.Println("경고: Rust 엔진 연결 실패 — 계산 기능 비활성")
  (Go 서버는 정상 시작 — Rust 없이도 CRUD 동작해야 함)
- ENGINE_URL이 없으면: log.Println("ENGINE_URL 미설정 — Rust 엔진 미사용")

EngineClient를 핸들러에 전달 준비:
- 이번 Step에서는 main.go에서 EngineClient 생성 + 연결 확인까지만
- Step 13에서 핸들러에 실제 전달

## DECISIONS.md 수정/추가

D-017 수정:
- 변경 전: "sqlx 직접 연결 (pgBouncer 아닌 이유)"
- 변경 후: "Supabase Session pooler 사용. Direct connection은 IPv6 전용이라
  fly.io에서 연결 불가. Session pooler(포트 5432)는 IPv4 지원하며
  prepared statements도 정상 동작."

D-020 추가: Go↔Rust 통신 패턴
- Go에서 Rust가 다운되어도 CRUD 기능 유지 (graceful degradation).
- Rust 엔진은 계산 전용이므로, 다운 시 계산 기능만 비활성화.
- 모든 Rust 호출은 EngineClient.CallCalc()을 통해 일관되게 수행.
- fly.io auto_stop 시 콜드 스타트 1~3초, 타임아웃 10초로 대응.

## PROGRESS.md 업데이트
- Step 12 Go↔Rust 통신 테스트 완료 기록
- 현재 단계: Step 13 (재고 집계) 대기

## 완료 기준
1. go build + go vet 성공
2. go test ./... 성공 (engine/client_test.go 포함)
3. bash scripts/lint_rules.sh 통과
4. 로컬 테스트:
   - Rust 서버 실행 중: Go 시작 시 "Rust 엔진 연결 성공" 로그
   - Rust 서버 미실행: Go 시작 시 "경고: Rust 엔진 연결 실패" + Go 정상 시작
5. CHECKLIST_TEMPLATE.md 양식으로 보고
6. 전체 파일 코드(cat) 보여주기
