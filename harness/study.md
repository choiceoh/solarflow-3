# 신입 교육 — `study.topworks.ltd`

> 이 문서는 **신입사원 학습 도메인에서만 의미 있는 것**을 모아둔 인덱스다.
> 결정 본문은 [DECISIONS.md](DECISIONS.md)가 정본이고 여기는 study 관점의 색인 + 운영 메모만 담는다.

## 운영 컨텍스트

| 항목 | 값 |
|---|---|
| URL | `study.topworks.ltd` |
| 목적 | 신입사원 온보딩과 SolarFlow 업무 학습 |
| 테넌트 식별 | `user_profiles.tenant_scope = 'study'` |
| 호스트 검출 | 프론트의 `detectTenantScope()`가 `^study\.` 또는 `^study-` 패턴으로 `study` 모드 결정 |
| 기본 feature | `study.learning` |

`study`는 ERP 운영 테넌트가 아니다. `topsolar`/`cable`/`baro`가 공유하는 재고·수주·출고·수금·마스터·WMS 표면을 상속하지 않고, 서버의 `StudyTenantFence`가 `/api/v1/study/*`와 `/api/v1/users/me*` 외 호출을 403으로 막는다.

## 1차 학습 도메인

첫 스키마는 화면보다 먼저 아래 3단 계약을 고정한다.

| 테이블 | 역할 |
|---|---|
| `study_learning_domains` | 학습 분야. 회사 기본, SolarFlow 업무 지도, 수입/통관, BARO 영업, 데이터 품질, 제품·현장 기초 등 |
| `study_learning_plans` | 온보딩 플랜 헤더. 대상, 목표, 기간, 상태를 가진다 |
| `study_learning_plan_steps` | 플랜의 실제 단계. 분야, 순서, 설명, 예상 시간, 평가 방식을 가진다 |

기본 seed:
- `new_employee_10_day` — 신입사원 10일 온보딩
- 학습 분야 6개 — 회사·보안 기본, SolarFlow 업무 지도, 수입·통관 흐름, BARO 영업 흐름, 데이터 품질, 태양광 제품·현장 기초
- 기본 단계 8개 — 계정/보안, 업무 지도, 마스터 원칙, P/O→B/L, 원가, BARO 응대, 제품 용어, Import Hub 점검

## 백엔드 엔드포인트

모든 엔드포인트는 `feature.IDStudyLearning`으로 보호되며 `tenant_scope='study'`에서만 동작한다.

| 경로 | 용도 |
|---|---|
| `GET /api/v1/study/domains/` | 학습 분야 목록 |
| `POST /api/v1/study/domains/` | 학습 분야 등록 |
| `GET/PUT/PATCH/DELETE /api/v1/study/domains/{id}` | 학습 분야 상세/수정/삭제 |
| `GET /api/v1/study/plans/` | 학습 플랜 목록 |
| `POST /api/v1/study/plans/` | 학습 플랜 등록, 단계 동시 등록 가능 |
| `GET/PUT/PATCH/DELETE /api/v1/study/plans/{id}` | 학습 플랜 상세/수정/삭제 |
| `POST /api/v1/study/plans/{id}/steps/` | 플랜 단계 추가 |
| `PUT/PATCH/DELETE /api/v1/study/plans/{id}/steps/{step_id}` | 플랜 단계 수정/삭제 |

## 다음 제작 순서

1. 학습 목록/플랜 상세 페이지: domain filter, plan timeline, step detail.
2. 진도/과제 도메인: `study_learning_assignments`, trainee별 status/progress, manager review.
3. 평가/퀴즈 도메인: checklist/quiz/submission 타입별 결과 저장.
4. 운영 배포: Cloudflare Pages custom domain `study.topworks.ltd`, API CORS `https://study.topworks.ltd`, 사용자 `tenant_scope='study'` 프로비저닝.

## 관련 결정

- [D-153](DECISIONS.md#d-153) — `study.topworks.ltd`를 신입 교육 전용 테넌트로 추가하고, 화면보다 학습 도메인/플랜 계약을 먼저 만든다.
- [D-145](DECISIONS.md#d-145) — 테넌트 모듈화. 새 도메인 추가 절차는 registry + tenant check migration + feature wiring으로 통일한다.

## 변경 시 체크리스트

새 study 기능을 추가할 때:
1. `backend/internal/feature/catalog.go`에 `study.*` feature 추가 + `harness/FEATURE-WIRING-MATRIX.md` 행 추가.
2. 라우트에 `r.Use(g.Feature(feature.IDStudy...))` 적용.
3. `StudyTenantFence` 허용 경로가 필요한지 검토. 기본은 `/api/v1/study/*`만 허용.
4. 화면이 생기면 별도 `study-domain` pack을 추가하고 `study` 전용 nav만 노출한다.
5. DECISIONS.md와 이 문서의 관련 결정/엔드포인트 표를 같이 갱신한다.
