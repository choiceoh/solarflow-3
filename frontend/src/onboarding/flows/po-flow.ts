import type { FlowDefinition } from '../engine/types';

/**
 * 탑솔라 PO 흐름 — Q1·Q2 결정 (도메인 시퀀스 5단계).
 *
 * PO → L/C → B/L → 면장/원가 → 매출분석. 한 건의 수입 거래가 자연스럽게
 * 거치는 5개 화면을 차례로 안내한다. 신입이 "이 화면이 어디고 무슨 칸이 있는지"
 * 손가락으로 짚어주는 코스.
 *
 * 박물관 표본 데이터는 후속 PR(#2-B)에서 시드 — 시드 진입 시
 * URL에 sample_po_id 같은 식별자를 더해 readonly 모드로 fetch한다.
 *
 * Anchor 약속:
 *  - 각 step의 id는 페이지 컴포넌트에 박힌 `data-onboarding-step="..."` attribute와 짝.
 *  - 누락 시 회귀 테스트(flows.test.ts)는 정적 무결성만 잡고, anchor 4초 timeout
 *    fallback으로 화면 중앙 풍선 표시 (OnboardingTour).
 */
export const poFlow: FlowDefinition = {
  id: 'po-flow',
  label: '탑솔라 수입 흐름 (PO → LC → BL → 면장 → 원가)',
  description: '수입 모듈 1건이 발주부터 매출까지 거치는 5개 화면을 따라가요',
  steps: [
    {
      id: 'po.list.add',
      route: '/procurement',
      title: '1단계 — P/O 발주',
      body: '해외 공급사와의 계약을 등록하는 곳입니다. 공급사·계약 유형(spot/frame)·결제 조건·라인아이템(품번·수량·단가)을 입력하면 한 건의 P/O가 만들어져요.\n신규 발주는 우측 상단 [+ 신규] 버튼.',
      placement: 'bottom',
    },
    {
      id: 'lc.list.open',
      route: '/procurement?tab=lc',
      title: '2단계 — L/C 개설',
      body: 'PO에 묶인 신용장(L/C)을 은행에 개설하는 곳입니다. 어떤 PO에 대한 L/C인지·금액·만기·은행을 지정해요.\nD-090: L/C도 PO 라인아이템 단위로 추적합니다.',
      placement: 'bottom',
    },
    {
      id: 'bl.list.inbound',
      route: '/procurement?tab=bl',
      title: '3단계 — B/L 입고',
      body: '실제 선적·입고를 기록하는 곳입니다. 한 PO가 여러 차례 분할선적될 수 있어 B/L 1건 = 한 회차 입고로 봐요.\nD-061: PO 입고현황은 여기 B/L 수량을 합산해서 표시됩니다.',
      placement: 'bottom',
    },
    {
      id: 'customs.declaration.attach',
      route: '/customs',
      title: '4단계 — 면장 / 원가',
      body: '수입신고(면장)를 등록하고 부대비용을 배분해 Landed Cost를 계산하는 곳입니다. HS 코드·환율·관세·운임·보험을 입력하면 capacity_kw 비율로 자동 배분돼요.\nD-024: 현재 환율은 최근 면장 환율을 사용합니다.',
      placement: 'bottom',
    },
    {
      id: 'sales.summary.cost',
      route: '/sales-analysis',
      title: '5단계 — 매출 분석 (원가 흐름 끝)',
      body: '입고된 모듈이 출고·매출과 연결되어 마진을 보여주는 화면입니다. 5단계 흐름의 결말 — PO 한 건이 결국 회사에 얼마를 남겼는지 확인할 수 있어요.\nD-031: 마진 원가는 품번별 가중평균.',
      placement: 'bottom',
    },
  ],
};
