import { useMemo } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { ALL_FLOWS } from "../flows"
import type { FlowDefinition, StepDefinition } from "./types"

/**
 * URL 쿼리(?tour=&step=)를 source of truth로 — Q10 결정.
 * 새로고침 견디고 공유 가능. tour만 있고 step 없으면 첫 단계 자동.
 */

export interface ActiveTour {
  flow: FlowDefinition
  step: StepDefinition
  stepIdx: number
  isFirst: boolean
  isLast: boolean
  goNext: () => void
  goPrev: () => void
  goClose: () => void
}

/** 현재 path에서 tour/step 쿼리 빼고 동일 path 유지 — [닫기] 시 사용. */
const stripTourQuery = (search: string): string => {
  const params = new URLSearchParams(search)
  params.delete("tour")
  params.delete("step")
  const s = params.toString()
  return s ? `?${s}` : ""
}

/** route 문자열(예: "/procurement?tab=lc")에 tour/step 쿼리 합쳐 반환. */
const withTourQuery = (route: string, flowId: string, stepId: string): string => {
  const [base, query] = route.split("?")
  const params = new URLSearchParams(query ?? "")
  params.set("tour", flowId)
  params.set("step", stepId)
  return `${base}?${params.toString()}`
}

export const useTourFromUrl = (): ActiveTour | null => {
  const location = useLocation()
  const navigate = useNavigate()

  return useMemo(() => {
    const params = new URLSearchParams(location.search)
    const tourId = params.get("tour")
    if (!tourId) return null

    const flow = ALL_FLOWS.find((f) => f.id === tourId)
    if (!flow) return null

    const stepId = params.get("step")
    const stepIdx = stepId ? flow.steps.findIndex((s) => s.id === stepId) : 0
    const safeIdx = stepIdx < 0 ? 0 : stepIdx
    const step = flow.steps[safeIdx]
    if (!step) return null

    const isFirst = safeIdx === 0
    const isLast = safeIdx === flow.steps.length - 1

    const goNext = () => {
      const nextStep = flow.steps[safeIdx + 1]
      if (!nextStep) return
      navigate(withTourQuery(nextStep.route, flow.id, nextStep.id))
    }

    const goPrev = () => {
      const prevStep = flow.steps[safeIdx - 1]
      if (!prevStep) return
      navigate(withTourQuery(prevStep.route, flow.id, prevStep.id))
    }

    const goClose = () => {
      navigate(`${location.pathname}${stripTourQuery(location.search)}`)
    }

    return { flow, step, stepIdx: safeIdx, isFirst, isLast, goNext, goPrev, goClose }
  }, [location.search, location.pathname, navigate])
}

/** 외부에서 사용 — 사이드바 메뉴, FirstLoginToast가 흐름 시작 링크 만들 때. */
export const startTourHref = (flow: FlowDefinition): string => {
  const first = flow.steps[0]
  if (!first) return "/"
  return withTourQuery(first.route, flow.id, first.id)
}
