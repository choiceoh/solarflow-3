# SolarFlow TASK 표준 템플릿

TASK는 시공자가 초안 작성 → 감리자 검토 → Alex 승인 후 시작한다. 아래 항목을 채우지 못하면 작업 전 범위가 불명확한 상태로 본다.

## 1. 작업명
- 제목:
- 작성자:
- 작성일:
- 관련 결정 ID:

## 2. 배경과 목표
- 현재 문제:
- 완료 후 달라지는 점:
- 하지 않는 것:

## 3. 영향 범위
| 항목 | 해당 여부 | 파일/화면/엔드포인트 |
|------|-----------|----------------------|
| frontend | O/X | |
| backend Go | O/X | |
| engine Rust | O/X | |
| DB migration | O/X | |
| Excel Import/Export | O/X | |
| feature catalog/matrix | O/X | |
| tenant index(module/cable/baro/study) | O/X | |
| 운영 배포/마이그레이션 | O/X | |

## 4. 설계 기준
- 설계 정본 위치:
- 관련 DECISIONS:
- Go/Rust 분리 판단:
- 테넌트/권한 판단:
- UI 표준 판단:

## 5. 구현 계획
1.
2.
3.

## 6. 데이터/마이그레이션 계획
- 새 migration 파일:
- auto-apply 헤더 필요 여부:
- PostgREST schema cache 확인 방법:
- 롤백/복구 판단:

## 7. 운영 검증
- 로컬 검증:
- 운영 반영 후 확인:
- 로그 확인:
  - `scripts/prod-logs.sh postdeploy`
  - 필요한 경우 `scripts/prod-logs.sh errors 2h`
  - 필요한 경우 `scripts/prod-logs.sh db 2h`

## 8. Acceptance 기준
- 사용자가 화면에서 확인할 수 있는 완료 조건:
- API/DB 기준 완료 조건:
- 실패 케이스에서 보여야 하는 메시지:

## 9. 완료 보고 체크리스트
| 항목 | O/X | 비고 |
|------|-----|------|
| TASK 범위만 수정 | | |
| PROGRESS.md 업데이트 | | |
| DECISIONS.md 업데이트(필요 시) | | |
| feature catalog/matrix 동기화(필요 시) | | |
| migration 적용/검증 경로 명시(필요 시) | | |
| `scripts/verify_changed.sh` 또는 동등 검증 실행 | | |
| code 파일 수정 시 `graphify update .` 시도 | | |
