import { describe, expect, it } from "vitest"
import { ALL_FLOWS } from "./index"

/**
 * 회귀 테스트 — Q5 결정.
 *
 * 흐름 정의의 메타 무결성을 보장. anchor가 실제 DOM에 존재하는지는
 * Playwright e2e에서 검증(PR #2 이후 — 페이지가 실제 데이터 fetch 후에 mount되는 케이스 다수).
 *
 * 여기서는 정적 검증만:
 *  1) flow id가 unique
 *  2) flow 안 step id가 unique
 *  3) 모든 step에 route + title + body가 채워져 있음
 *  4) step id 네이밍 규칙(<page>.<element>.<action>) — 최소 dot 2개
 */
describe("Onboarding flows — 정적 무결성", () => {
  it("flow id가 unique", () => {
    const ids = ALL_FLOWS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("각 flow 안 step id가 unique", () => {
    for (const flow of ALL_FLOWS) {
      const ids = flow.steps.map((s) => s.id)
      expect(new Set(ids).size, `flow ${flow.id} step id 중복`).toBe(ids.length)
    }
  })

  it("모든 step의 필수 필드(route/title/body)가 비어있지 않음", () => {
    for (const flow of ALL_FLOWS) {
      for (const step of flow.steps) {
        expect(step.route, `${flow.id}/${step.id} route 누락`).toBeTruthy()
        expect(step.title, `${flow.id}/${step.id} title 누락`).toBeTruthy()
        expect(step.body, `${flow.id}/${step.id} body 누락`).toBeTruthy()
      }
    }
  })

  it("step id 네이밍 규칙 — dot-notation (최소 2개)", () => {
    for (const flow of ALL_FLOWS) {
      for (const step of flow.steps) {
        const dots = (step.id.match(/\./g) ?? []).length
        expect(
          dots,
          `${flow.id}/${step.id} step id는 dot-notation 권장 (예: po.line.add)`,
        ).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it("흐름이 최소 1개 이상 등록되어 있음 (인프라 검증)", () => {
    expect(ALL_FLOWS.length).toBeGreaterThan(0)
  })
})
