# B/L 입고·통관·면장 화면

ERP 의 *수입 측* 흐름. 해외 공급사 P/O → 선적(B/L) → 입항 → 통관(면장) → 재고 입고 → 원가 확정 순서. **B/L 한 건이 입고의 단위**, **면장 한 건이 회계상 매입 인식의 단위**.

## 공통 규칙

- **B/L 입고 = 선하증권 단위**. 한 PO 가 여러 B/L 로 나뉘어 들어올 수 있음 (분할 선적). 반대로 한 B/L 에 여러 PO 라인이 섞일 수도 있음.
- **B/L 상태 흐름**: scheduled(예정) → shipping(선적중) → arrived(입항) → customs(통관중) → completed(통관완료) → erp_done(회계처리완료). 재고 증가는 *completed* 시점.
- **원가는 3 단계로 누적**: FOB(공급사 송장) → CIF(운임·보험 포함) → Landed Cost(부대비용 포함). Rust 계산엔진이 매번 재계산하며, *save=true* 로 저장해야 운영에 반영.
- **회계용 원가와 실무용 원가가 분리**되어 저장됨 (cost_details). 마진 분석은 Landed Cost 기준.

## 화면별

- **B/L 목록 (`/inbound`, `/bls`)**: 수입/국내/그룹내/외주 4 가지 입고 유형. 각 유형 별로 워크플로우가 약간 다름.
- **B/L 상세 (`/inbound/{id}`)**: ETD(선적일)·ETA(입항예정일)·실제 입항일, 통관 진행률.
- **통관·면장 (`/customs`)**: 수입신고번호, 반출일, HS 코드, 세관별 등록.
- **원가 명세 (`/customs/{id}` 안)**: FOB→CIF→Landed 단계별 단가. 부대비용(dock charge, LC fee, 통관비) 추가 시 즉시 재계산.

## 권한 주의

- **viewer**: 통관비·수입 부대비용·Landed Cost 차단. "이 B/L 매입원가?" 류 질문에 답하지 말 것.
- **staff**: B/L 입고 상태 조회만. 비용 입력·원가 저장 불가.
- **manager+**: Landed Cost 프리뷰(save=false) 후 저장(save=true) 권한.

## 자주 묻는 질문 패턴

- "7 일 내 입항 예정 B/L?" → bl_shipments.eta BETWEEN today AND today+7.
- "이번 달 입고 완료된 품번별 원가는?" → 면장 목록 + cost_details 조인. viewer 면 거절.
- "미착품(아직 안 들어온 PO 잔량)?" → PO 계약량 - BL 누적입고량.
- "부대비용 더하면 Landed Cost 얼마?" → 원가 화면에서 save=false 프리뷰. 확정은 manager.
- "면장이 발급됐는데 재고가 안 늘어났다" → status 가 completed 가 아닐 가능성. 통관 화면에서 release_date 확인.

## 연결

- **procurement** P/O → 이 B/L 의 lc_id 가 가리키는 LC 로 자금 결제. PO 분할 선적 시 한 PO 에 여러 BL.
- **재고/outbound**: B/L completed → 재고 +1 → outbound 가능. 통관 지연으로 재고가 부족하면 outbound 등록이 막힘.
- **banking**: B/L 도착 → LC 결제 → 한도 복원 (LC 만기일 기준).
