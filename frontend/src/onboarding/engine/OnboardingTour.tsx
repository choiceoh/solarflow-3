import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, GraduationCap, X } from "lucide-react"
import { useTourFromUrl } from "./useTourFromUrl"
import { useOnboardingProgress } from "./useOnboardingProgress"

const ANCHOR_TIMEOUT_MS = 4000
const PADDING = 8
const BUBBLE_GAP = 12

interface AnchorRect {
  top: number
  left: number
  width: number
  height: number
}

/** anchor element rect — viewport 좌표. 없으면 null (= fallback 중앙 풍선). */
const measure = (el: Element | null): AnchorRect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

/**
 * Spotlight + 풍선 — Q3·Q4·Q5·Q11 결정.
 *
 * - URL 쿼리(?tour=&step=)가 있으면 활성. 없으면 null.
 * - Anchor: `[data-onboarding-step="<id>"]` MutationObserver로 watch (4초).
 *   못 찾으면 spotlight 생략, 풍선만 화면 하단 중앙에 표시(fallback).
 * - Spotlight = 4-rect 어두운 마스크 (anchor 주변만 환하게).
 * - 풍선 위치는 placement에 따라 anchor 옆.
 */
export const OnboardingTour = () => {
  const tour = useTourFromUrl()
  const { markLastSeen, markCompleted } = useOnboardingProgress()
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null)
  const [anchorTimedOut, setAnchorTimedOut] = useState(false)
  const observerRef = useRef<MutationObserver | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  // 마지막 본 위치 저장 (디바이스 한정).
  useEffect(() => {
    if (tour) markLastSeen(tour.flow.id, tour.stepIdx)
  }, [tour, markLastSeen])

  // Anchor watch — MutationObserver + 4초 timeout.
  useEffect(() => {
    if (!tour) {
      setAnchorRect(null)
      setAnchorTimedOut(false)
      return
    }
    setAnchorRect(null)
    setAnchorTimedOut(false)

    const stepId = tour.step.id
    const find = () =>
      measure(document.querySelector(`[data-onboarding-step="${CSS.escape(stepId)}"]`))

    // 즉시 1회.
    const initial = find()
    if (initial) {
      setAnchorRect(initial)
      return
    }

    const observer = new MutationObserver(() => {
      const r = find()
      if (r) {
        setAnchorRect(r)
        observer.disconnect()
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    observerRef.current = observer

    timeoutRef.current = window.setTimeout(() => {
      setAnchorTimedOut(true)
      observer.disconnect()
      console.warn(
        `[onboarding] anchor not found within ${ANCHOR_TIMEOUT_MS}ms: ${stepId} on ${tour.step.route}`,
      )
    }, ANCHOR_TIMEOUT_MS)

    return () => {
      observer.disconnect()
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    }
  }, [tour])

  // Anchor가 잡힌 뒤에도 스크롤·리사이즈 따라 rect 갱신.
  useLayoutEffect(() => {
    if (!tour || !anchorRect) return
    const stepId = tour.step.id
    const update = () => {
      rafRef.current = window.requestAnimationFrame(() => {
        const r = measure(document.querySelector(`[data-onboarding-step="${CSS.escape(stepId)}"]`))
        if (r) setAnchorRect(r)
      })
    }
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
    }
  }, [tour, anchorRect])

  if (!tour) return null

  const { flow, step, stepIdx, isFirst, isLast, goNext, goPrev, goClose } = tour
  const total = flow.steps.length
  const showSpotlight = !!anchorRect

  const onComplete = () => {
    markCompleted(flow.id)
    goClose()
  }

  // 풍선 위치 계산 — anchor 있으면 옆, 없으면 화면 하단 중앙.
  const bubblePos = (() => {
    if (!anchorRect) {
      return { bottom: 32, left: "50%", transform: "translateX(-50%)" } as const
    }
    const placement = step.placement ?? "bottom"
    if (placement === "bottom") {
      return {
        top: anchorRect.top + anchorRect.height + BUBBLE_GAP,
        left: Math.max(16, Math.min(window.innerWidth - 376, anchorRect.left)),
      } as const
    }
    if (placement === "top") {
      return {
        top: anchorRect.top - BUBBLE_GAP - 200, // 풍선 추정 높이
        left: Math.max(16, Math.min(window.innerWidth - 376, anchorRect.left)),
      } as const
    }
    if (placement === "right") {
      return {
        top: anchorRect.top,
        left: anchorRect.left + anchorRect.width + BUBBLE_GAP,
      } as const
    }
    // left
    return {
      top: anchorRect.top,
      left: Math.max(16, anchorRect.left - 376 - BUBBLE_GAP),
    } as const
  })()

  return (
    <div data-onboarding-ui="true" className="fixed inset-0 z-[200] pointer-events-none">
      {/* Spotlight 마스크 — anchor 있을 때만 */}
      {showSpotlight && anchorRect ? (
        <svg
          className="absolute inset-0 h-full w-full pointer-events-auto"
          onClick={goClose}
          aria-hidden
        >
          <defs>
            <mask id="sf-onboarding-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={anchorRect.left - PADDING}
                y={anchorRect.top - PADDING}
                width={anchorRect.width + PADDING * 2}
                height={anchorRect.height + PADDING * 2}
                rx={6}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(15,23,42,0.55)"
            mask="url(#sf-onboarding-mask)"
          />
          {/* anchor 강조 테두리 */}
          <rect
            x={anchorRect.left - PADDING}
            y={anchorRect.top - PADDING}
            width={anchorRect.width + PADDING * 2}
            height={anchorRect.height + PADDING * 2}
            rx={6}
            fill="none"
            stroke="rgb(245, 158, 11)"
            strokeWidth={2}
          />
        </svg>
      ) : (
        // Anchor 없을 때도 클릭 차단용 반투명 백드롭 (옅게)
        <div
          className="absolute inset-0 bg-slate-900/30 pointer-events-auto"
          onClick={goClose}
          aria-hidden
        />
      )}

      {/* 풍선 */}
      <div
        role="dialog"
        aria-label={`튜토리얼 ${stepIdx + 1}/${total}`}
        className="pointer-events-auto absolute w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-amber-300 bg-white shadow-2xl dark:border-amber-700/40 dark:bg-slate-900"
        style={bubblePos as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-700/40 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            <GraduationCap className="h-4 w-4" />
            {flow.label}
            <span className="sf-mono text-[10px] text-amber-700 dark:text-amber-300">
              {stepIdx + 1}/{total}
              {anchorTimedOut ? " ⚠" : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={goClose}
            className="rounded p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/30"
            aria-label="닫기"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <div className="space-y-2 p-3 text-xs text-slate-700 dark:text-slate-300">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{step.title}</p>
          <p className="whitespace-pre-line">{step.body}</p>
          {anchorTimedOut ? (
            <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
              이 단계의 정확한 위치 안내가 표시되지 않습니다. 화면을 살펴본 뒤 [다음]을 눌러
              진행하세요.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              disabled={isFirst}
              onClick={goPrev}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> 이전
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={onComplete}
                className="rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
              >
                완료
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
              >
                다음 <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
