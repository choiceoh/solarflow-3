# SolarFlow 진행 상황

## 현재 상태 요약 (최종 업데이트: 2026-03-31)

| 항목 | 상태 |
|------|------|
| 현재 Phase | Phase 4 진행 중 |
| 다음 작업 | Step 27 — 면장/원가 |
| Go 백엔드 | 배포 완료 (solarflow-backend.fly.dev) |
| Rust 엔진 | 배포 완료 (solarflow-engine.fly.dev) |
| 프론트엔드 | Step 26 완료 (재고+입고+발주+출고+수주수금) |
| DB 테이블 | 20개 생성 완료 |
| Go 테스트 | 86개 PASS |
| Rust 테스트 | 75개 PASS |
| 총 테스트 | 161개 PASS |
| Rust API | 15개 엔드포인트 |
| Go CalcProxy | 15개 엔드포인트 (프론트→Go→Rust) |
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

### Phase 4: 프론트엔드 + 연동 (진행 중)
| 작업 | 감리 점수 | 비고 |
|------|----------|------|
| Step 20: 인증 + CORS + CalcProxy | 감리 대기 | CORS, 프록시 15개, users/me, 로그인 UI |
| Step 21: 레이아웃 + 마스터 CRUD 6개 | 감리 대기 | AppLayout, Sidebar(역할별), DataTable, 6개 마스터 페이지+폼 |
| Step 22: 재고 화면 + 수급 전망 | 감리 대기 | 3탭(재고/미착품/수급전망), 요약카드, 장기재고Badge, insufficient경고 |
| Step 23: 입고 관리 (B/L+라인) | 감리 대기 | 목록/상세/생성/수정, 상태6단계, 입고유형4종, 라인아이템CRUD |
| Step 24: 발주/결제 (PO+LC+TT+단가) | 감리 대기 | 4탭, PO 5서브탭, 입고진행률바, LC만기임박, 단가인상/인하표시 |
| Step 25: 출고/판매 | 감리 대기 | 2탭(출고관리/매출현황), 취소3단계, Wp단가자동계산, 그룹거래Switch, 세금계산서Badge |
| Step 26: 수주/수금+매칭 | 감리 대기 | 3탭(수주/수금/매칭), 충당소스Badge, 매칭3단계(선택→체크→확정), 자동추천, 차액표시 |

#### Phase 4 남은 작업
- Step 21: 대시보드 레이아웃 (역할별)
- 엑셀 Import/Export
- 아마란스10 내보내기
- 결재안 자동 생성 (6유형)
- 메모 + 검색 UI
- 수금 매칭 UI (체크박스 + 실시간 합계)
