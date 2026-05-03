/**
 * Onboarding Tour 엔진 타입 — multi-flow 전제.
 *
 * Flow = 도메인 시퀀스 한 줄 (예: PO → LC → BL → 면장 → 원가).
 * Step = Flow 안의 한 단계, 한 페이지의 한 anchor를 가리킴.
 *
 * 단계 간 이동은 URL 쿼리(?tour=&step=)가 source of truth.
 * Anchor는 페이지 컴포넌트에 박힌 `data-onboarding-step="..."` attribute로 찾는다.
 */

export type OnboardingStepId = string

export interface StepDefinition {
  /** dot-notation: <page>.<element>.<action> 권장. flow 안에서 unique. */
  id: OnboardingStepId
  /** 단계 진입 시 navigate 되는 경로. URL 쿼리는 자동 부여(tour, step). */
  route: string
  /** 풍선 본문 (한국어). */
  title: string
  body: string
  /** 풍선 위치 — anchor 기준. 기본 'bottom'. */
  placement?: "top" | "bottom" | "left" | "right"
}

export interface FlowDefinition {
  /** URL 쿼리 ?tour=<id>. 디렉토리·파일명과 일치 권장. */
  id: string
  /** 사이드바 🎓 튜토리얼 메뉴에 노출되는 라벨. */
  label: string
  /** 메뉴에서 라벨 아래 한 줄 설명. */
  description: string
  steps: StepDefinition[]
}
