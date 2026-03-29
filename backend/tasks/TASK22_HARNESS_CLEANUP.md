# 작업: Phase 4 전 정리 — 하네스 구조 개선 + 문서 정합성
RULES.md를 반드시 따를 것. CHECKLIST_TEMPLATE.md 양식으로 보고할 것.
감리 1건 추가 반영: PROGRESS.md 영구적 컨텍스트 앵커 강화.

## 작업 1: CLAUDE.md 생성 (프로젝트 루트 ~/solarflow-3/CLAUDE.md)

내용은 아래와 같이 작성:

---
# SolarFlow 3.0 — Claude Code 작업 안내

## 읽기 순서
이 프로젝트에서 작업하기 전에 아래 순서로 읽으세요:
1. harness/PROGRESS.md — 현재 위치 확인 (이것만 읽으면 지금 어디인지 파악)
2. harness/RULES.md — 개발 규칙 + 감리 교훈 (헌법)
3. harness/AGENTS.md — 역할 정의 (시공자/감리자/Alex)
4. harness/SolarFlow_설계문서_통합판.md — 유일한 설계 정본
5. harness/DECISIONS.md — 설계 판단 기록 (왜 이렇게 했는지)
6. 할당된 TASK 파일

## 프로젝트 구조
- backend/ — Go API 게이트웨이 (chi v5, 포트 8080, fly.io solarflow-backend)
- engine/ — Rust 계산엔진 (Axum 0.8.8, 포트 8081, fly.io solarflow-engine)
- frontend/ — React + Vite + TypeScript + Tailwind (Phase 4, Cloudflare Pages)
- harness/ — 하네스 파일 (규칙, 설계, 판단 기록)

## 핵심 원칙
1. 설계문서 통합판이 유일한 정본. 임의 변경 금지.
2. Go+Rust 분리: 한 행 사칙연산=Go, 여러 테이블 조합=Rust.
3. CHECKLIST_TEMPLATE.md 양식으로 보고.
4. 커밋은 작업 단위별.
5. Rust 담당 로직에 // TODO: Rust 계산엔진 연동 주석 필수.

## DB 연결
- Supabase PostgreSQL (Session pooler, 포트 5432)
- Go 풀 약5개, Rust 풀 5개
- 프로젝트: aalxpmfnsjzmhsfkuxnp.supabase.co
---

## 작업 2: PROGRESS.md 강화

파일: ~/solarflow-3/harness/PROGRESS.md
기존 내용을 아래로 교체. 맨 위에 현재 상태 요약 섹션.

---
# SolarFlow 진행 상황

## 현재 상태 요약 (최종 업데이트: 2026-03-29)

| 항목 | 상태 |
|------|------|
| 현재 Phase | Phase 4 전 정리 중 |
| 다음 작업 | Phase 4 — 프론트엔드 + 연동 |
| Go 백엔드 | 배포 완료 (solarflow-backend.fly.dev) |
| Rust 엔진 | 배포 완료 (solarflow-engine.fly.dev) |
| 프론트엔드 | 미착수 |
| DB 테이블 | 20개 생성 완료 |
| Go 테스트 | 78개 PASS |
| Rust 테스트 | 75개 PASS |
| 총 테스트 | 153개 PASS |
| Rust API | 15개 엔드포인트 |
| 감리 점수 | Phase 2: 9-10/10, Phase 3: 전부 10/10 |

### 핵심 미해결 사항
1. 수금매칭 outbound 기준 -> Phase 4에서 sale 기준 스키마 개선 (D-042)
2. LC 수수료 수동 보정 기능 -> Phase 4 (D-030)
3. 제조사/거래처 별칭 DB 테이블 이동 -> Phase 확장 (D-043)
4. FIFO 원가 매칭 -> Phase 확장 (D-022, D-031)
5. 실시간 환율 API -> Phase 확장 (D-024)

### Rust API 엔드포인트 (15개)
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

### Phase 4: 프론트엔드 + 연동 (미착수)
- 대시보드 (역할별)
- 엑셀 Import/Export
- 아마란스10 내보내기
- 결재안 자동 생성 (6유형)
- 메모 + 검색 UI
- 수금 매칭 UI (체크박스 + 실시간 합계)
---

## 작업 3: AGENTS.md 업데이트

harness/AGENTS.md 파일에서 인수인계 조건을 아래로 변경:

변경 전: "RULES.md, AGENTS.md, 설계문서, PROGRESS.md, DECISIONS.md를 먼저 읽을 것"
변경 후:
"새 대화창을 열 때:
- Claude Code: 프로젝트 루트의 CLAUDE.md가 자동으로 읽기 순서 지정
- 웹 대화창(시공자/감리자): harness/PROGRESS.md 먼저 -> 현재 위치 파악 후 나머지 참조
읽기 순서:
1. harness/PROGRESS.md (현재 위치 확인)
2. harness/RULES.md (헌법)
3. harness/AGENTS.md (역할)
4. harness/SolarFlow_설계문서_통합판.md (설계 정본)
5. harness/DECISIONS.md (판단 기록)"

## 작업 4: DECISIONS.md 모순 검토

harness/DECISIONS.md를 읽고 D-001부터 D-047까지 전체 검토.

검토 관점:
1. 논리적 모순: A 판단과 B 판단이 충돌
2. 시효 만료: 초기 판단이 이후 변경으로 무효화
3. 번호 누락/중복
4. 설명 부정확: 이후 변경으로 현재와 맞지 않음

결과 형식 (각 항목별):
- 유효: 현재 상태와 일치
- 수정 필요: 설명이 현재와 다름 (수정 내용 명시하고 직접 수정)
- 폐기: 더 이상 유효하지 않음 (삭제하지 않고 폐기 사유 추가)
- 통합: 다른 D-번호와 중복 (통합 가능)

검토 후 수정이 필요한 항목은 직접 수정.
검토 결과 요약을 보고에 포함.

## 작업 5: 설계문서 통합판 업데이트

harness/SolarFlow_설계문서_통합판.md에 Step 11A-19 확정 내용 반영:

Section 1.6 아키텍처에 추가:
- Rust: Axum 0.8.8, sqlx 0.8.6, fly.io solarflow-engine.fly.dev (nrt 리전)
- Go-Rust: REST API, .internal 네트워크
- Supabase: Session pooler (D-017)
- Rust 엔진 인증 불필요 (Go가 게이트웨이, 내부 전용)
- Rust API 15개 엔드포인트 목록 표

Section 4.5 수주에 추가:
- management_category 6개: sale/construction/spare/repowering/maintenance/other
- fulfillment_source: stock/incoming (D-015)

Section 4.6 출고에 추가:
- status: active/cancel_pending/cancelled (D-013)
- usage_category 9개 (D-014, ERP 1881건 기반):
  sale/sale_spare/construction/construction_damage/maintenance/disposal/transfer/adjustment/other

Section 4.7 재고 집계 공식 업데이트:
  물리적 = 입고(completed/erp_done) - 출고(active)
  예약 = fulfillment_source=stock + sale/spare/maintenance/other 수주잔량
  배정 = fulfillment_source=stock + construction/repowering 수주잔량
  가용재고 = 물리적 - 예약 - 배정
  미착품 = PO(contracted/shipping) 잔량 - 해당PO 입고완료
  미착품예약 = fulfillment_source=incoming 수주잔량
  가용미착품 = 미착품 - 미착품예약
  총확보량 = 가용재고 + 가용미착품

Section 4.4 원가에 추가:
- Landed Cost save 옵션 (D-025)
- 부대비용 배분: capacity_kw 비율 (D-023)
- allocated_expenses: 동적 맵 (D-026)

Section 4.8 LC에 추가:
- 수수료 단일 공식 (개설: amount x rate x exchange_rate, 인수: amount x rate x days/360 x exchange_rate)
- fee_note (D-030)
- 한도 복원: maturity_date 기준 (D-028)

Section 4.10 검색에 업데이트:
- 키워드 패턴 매칭 (D-044)
- 별칭 매핑 (D-043, D-047)
- 의도 6가지 + fallback
- spec_wp 범위: 400-900

Section 8 작업 순서 업데이트:
- Phase 1: 완료
- Phase 2: 완료
- Phase 3: 완료 (153개 테스트)
- Phase 4: 다음

## DECISIONS.md에 추가할 항목
- D-048: harness/ 폴더 분리. 이유: 하네스와 코드 분리. Go/Rust 공통 규칙 참조 용이.
- D-049: CLAUDE.md 도입. 이유: Claude Code 새 세션에서 자동 읽기 순서 지정.
- D-050: PROGRESS.md 영구적 컨텍스트 앵커 역할. 이유: 누구든 이 파일만 읽으면 현재 위치 즉시 파악.

## 완료 기준
1. CLAUDE.md 생성 완료
2. PROGRESS.md 현재 상태 요약 추가 완료
3. AGENTS.md 경로 업데이트 완료
4. DECISIONS.md 모순 검토 완료 + 결과 보고
5. 설계문서 통합판 업데이트 완료
6. CHECKLIST_TEMPLATE.md 양식으로 보고
