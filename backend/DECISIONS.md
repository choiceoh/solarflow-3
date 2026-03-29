# SolarFlow 설계 판단 기록

모든 주요 설계 판단의 "왜?"를 기록합니다.
새 대화창에서 "왜 이렇게 했지?"라는 질문이 나오면 이 문서를 참조합니다.

## D-001: Go+Rust 아키텍처 분리
- **결정**: Go(프론트+API) + Rust(계산엔진)
- **이유**: Go는 변경이 잦은 UI/API에 적합, Rust는 복잡한 계산(Landed Cost, 재고집계)에 안정적
- **분리 기준**: 한 행 사칙연산=Go, 여러 테이블 조합=Rust
- **날짜**: 2026-03

## D-002: 엑셀 기반 입력 방식 채택
- **결정**: SolarFlow = 입력 시스템 → 엑셀 Import/Export 허브 + 분석 시스템
- **이유**: (1) SolarFlow 다운 시 엑셀 원본이 실무자 PC에 있어 업무 마비 없음 (2) 디원/화신은 ERP 없어서 SolarFlow가 유일한 시스템, 다운 리스크 큼 (3) 실무자 업무 방식 변경 최소화
- **날짜**: 2026-03-29

## D-003: ToggleStatusRequest를 common.go에 배치
- **결정**: model/company.go가 아닌 model/common.go에 배치
- **이유**: is_active 토글은 company, manufacturer, product 등 여러 핸들러에서 공통 사용
- **날짜**: 2026-03-29

## D-004: 감리자-시공자 분리 도입
- **결정**: 코드 작성(시공자)과 설계 검증(감리자)을 별도 대화창으로 분리
- **이유**: 시공자(Claude)가 3번의 대화창에서 반복적으로 "Go만으로 충분" 하며 설계를 임의 변경. 감리자가 설계문서 대비 코드를 대조하여 이 패턴을 차단.
- **날짜**: 2026-03-28

## D-005: Validate()가 error가 아닌 string 반환
- **결정**: Validate() 메서드가 Go 관례(error)가 아닌 string 반환
- **이유**: 시공자의 초기 구현. 동작에 문제없고 모든 핸들러에 일관 적용됨. 전체 변경 비용 대비 이득이 적어 유지.
- **날짜**: 2026-03-29

## D-006: 자동 검증 3층 구조 도입
- **결정**: (1층) go build+vet+test+CI+린터 (2층) 감리자 대화창 (3층) 상사 코드 리뷰(미확보)
- **이유**: 감리자 수동 검증의 한계. 기계가 잡을 수 있는 것은 기계에게 맡기고, 감리자는 설계 방향 판단에 집중.
- **날짜**: 2026-03-29

## D-007: 엑셀 양식 기반 입력 + 서버 검증
- **결정**: 실무자가 SolarFlow에서 빈 양식 다운로드 → PC에서 입력 → 업로드 시 서버 검증
- **이유**: (1) 엑셀에 드롭다운(제조사, 창고 등) 넣으면 입력 오류 감소 (2) 업로드 시 행별 에러 반환으로 잘못된 데이터 차단
- **날짜**: 2026-03-29

## D-008: receipt_matches.outbound_id FK 지연 추가
- **결정**: outbound 테이블이 아직 없으므로 UUID 컬럼만 생성, FK는 Step 9 이후 ALTER TABLE로 추가
- **이유**: 테이블 생성 순서 의존성. receipts/receipt_matches는 Step 8, outbound는 Step 9.
- **날짜**: 2026-03-29

## D-009: 수금 매칭 합계 검증 Go 허용
- **결정**: receipt_matches의 SUM(matched_amount) ≤ receipt.amount 체크를 Go에서 수행
- **이유**: 두 테이블 조회이지만 단순 합산. Go+Rust 분리 기준의 "한 행 사칙연산" 범위 내.
- **날짜**: 2026-03-29

## D-010: deposit_rate 0~100 범위 검증 추가
- **결정**: 수주의 계약금 비율(deposit_rate)에 0~100 범위 검증 추가
- **이유**: 시공자 자체 판단으로 추가. 계약금 비율이 100%를 넘는 건 실무에서 불가능.
- **날짜**: 2026-03-29

## D-011: limit_changes에 Update/Delete 없음
- **결정**: 한도 변경이력 테이블에 수정/삭제 API를 제공하지 않음 (List, Create만)
- **이유**: 한도 변경은 이력이므로 수정/삭제하면 감사 추적 불가. 잘못 입력 시 새 이력으로 정정.
- **날짜**: 2026-03-29

## D-012: omitempty 일괄 적용
- **결정**: 19개 UpdateRequest 구조체의 모든 포인터 필드에 `json:",omitempty"` 태그 일괄 적용
- **이유**: UpdateRequest의 포인터 필드에 omitempty가 없으면 null 필드도 DB에 전송되어 의도치 않은 덮어쓰기 가능. 부분 업데이트 시 전송하지 않은 필드가 null로 초기화되는 문제 방지.
- **날짜**: 2026-03-29

## D-013: 출고 취소 3단계 (active/cancel_pending/cancelled)
- **결정**: 출고 상태를 active → cancel_pending → cancelled 3단계로 관리
- **이유**: 실무자가 취소 여부를 즉시 결정 못할 수 있음. cancel_pending은 가용재고 미차감. 실무자가 판단 후 삭제 또는 복원.
- **날짜**: 2026-03-29

## D-014: ERP 관리구분과 usage_category 일치
- **결정**: 출고 usage_category를 ERP 관리구분 기반으로 재설계 (기존 7개 → 9개)
- **이유**: ERP 내보내기 시 매핑 정확성. ERP 1,881건 분석 기반으로 재설계. replacement는 construction_damage로 대체. repowering은 outbounds에서 제거, orders.management_category에는 유지.
- **날짜**: 2026-03-29

## D-015: 수주 충당 소스 구분 (fulfillment_source: stock/incoming)
- **결정**: 수주에 fulfillment_source 컬럼 추가 (stock/incoming)
- **이유**: 미착품에도 판매/공사 예약이 걸릴 수 있음. "총확보량"이 실제보다 부풀려지는 것을 방지. 실무자가 "이 수주는 미착품에서 충당"이라는 의사결정을 기록.
- **날짜**: 2026-03-29

## D-016: Axum 선택
- **결정**: Rust 웹 프레임워크로 Axum 채택
- **이유**: SolarFlow 계산엔진은 극한 성능이 아닌 정확한 계산이 목적. Tokio 팀 제작, 타입 안전, 메모리 효율 최고, 학습 곡선 완만. sqlx/serde 등 Tokio 생태계와 자연스럽게 통합.
- **날짜**: 2026-03-29

## D-017: Supabase Session pooler 사용
- **결정**: Supabase Session pooler(포트 5432)를 사용하여 sqlx로 연결
- **이유**: Direct connection은 IPv6 전용이라 fly.io에서 연결 불가. Session pooler(포트 5432)는 IPv4 지원하며 prepared statements도 정상 동작.
- **날짜**: 2026-03-29

## D-018: Cargo.lock 커밋
- **결정**: Cargo.lock을 .gitignore에 넣지 않고 커밋
- **이유**: Rust 공식 권장 — 바이너리 프로젝트는 Cargo.lock을 커밋해야 빌드 재현성(reproducibility) 보장.
- **날짜**: 2026-03-29

## D-019: /health와 /health/ready 분리
- **결정**: 헬스체크를 /health(서버 생존)와 /health/ready(DB 연결)로 분리
- **이유**: /health는 fly.io 헬스체크용 (항상 200, DB 무관). /health/ready는 DB 연결 확인용 (Go에서 Rust 호출 전 상태 확인). DB 장애 시 서버는 살아있지만 계산은 불가능한 상태를 구분.
- **날짜**: 2026-03-29

## D-020: Go↔Rust 통신 패턴
- **결정**: Go에서 Rust가 다운되어도 CRUD 기능 유지 (graceful degradation)
- **이유**: Rust 엔진은 계산 전용이므로, 다운 시 계산 기능만 비활성화. 모든 Rust 호출은 EngineClient.CallCalc()을 통해 일관되게 수행. fly.io auto_stop 시 콜드 스타트 1~3초, 타임아웃 10초로 대응.
- **날짜**: 2026-03-29
