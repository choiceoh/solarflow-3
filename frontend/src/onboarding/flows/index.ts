import type { FlowDefinition } from "../engine/types"
import { selfDemoFlow } from "./self-demo"
import { poFlow } from "./po-flow"

/**
 * 흐름 등록 — Q8 결정 (코드 디렉토리 컨벤션).
 *
 * 새 흐름 추가 = 이 디렉토리에 *.ts 파일 1개 + 아래 배열에 import.
 * 회귀 테스트(`onboarding.flows.test.ts`)가 모든 step ID에 대해
 *  1) flow 안 unique
 *  2) `data-onboarding-step` anchor가 route 페이지 어딘가에 존재
 * 를 검증한다.
 *
 * PR #2: po-flow.ts (탑솔라 PO → LC → BL → 면장 → 원가)
 * PR #3: baro-sales-flow.ts (BARO 영업 견적 → 수주 → 출고 → 수금 → 미수금)
 */
export const ALL_FLOWS: FlowDefinition[] = [selfDemoFlow, poFlow]

export { selfDemoFlow, poFlow }
