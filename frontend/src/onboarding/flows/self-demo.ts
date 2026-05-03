import type { FlowDefinition } from "../engine/types"

/**
 * 셀프 데모 흐름 — Q14 결정 (PR #1 인프라 검증용).
 *
 * 박물관 표본 데이터 0, 마이그레이션 0. tour 엔진의 모든 기능을 검증:
 * - URL 쿼리 라우팅 (페이지 간 이동)
 * - data-onboarding-step anchor 부착
 * - MutationObserver fallback (anchor 없는 단계 = 화면 중앙 풍선)
 * - 진척 저장 + 완료 마킹
 *
 * 실제 도메인 흐름(po-flow, baro-sales-flow 등)은 PR #2·#3에서 추가.
 */
export const selfDemoFlow: FlowDefinition = {
  id: "self-demo",
  label: "튜토리얼 사용법",
  description: "안내 풍선·페이지 이동·완료까지 한 번 따라가보기 (3단계)",
  steps: [
    {
      id: "self-demo.sidebar.intro",
      route: "/inventory",
      title: "튜토리얼 풍선이 떴어요",
      body: "주황 테두리가 화면의 한 부분을 가리키면 그 자리를 보세요.\n[다음] 버튼으로 단계를 넘어갑니다. [닫기]는 언제든 가능 — 진척은 저장됩니다.",
      placement: "right",
    },
    {
      id: "self-demo.topbar.actions",
      route: "/inventory",
      title: "풍선이 화면 위치를 가리킵니다",
      body: "지금 풍선은 우측 상단 작업 영역(검색·알림·편집모드 등)을 가리키고 있어요.\n[다음]을 누르면 다른 페이지로 이동하면서 흐름이 이어집니다.",
      placement: "bottom",
    },
    {
      id: "self-demo.assistant.entry",
      route: "/assistant",
      title: "페이지 이동 + 완료",
      body: "페이지가 바뀌었지만 풍선은 그대로 따라옵니다 — URL이 흐름의 위치를 기억하기 때문입니다.\n실제 흐름(PO→LC→BL→면장→원가)은 곧 추가됩니다. 이번 데모는 여기까지 — [완료]를 누르세요.",
      placement: "bottom",
    },
  ],
}
