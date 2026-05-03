import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { GraduationCap, X } from "lucide-react"
import { ALL_FLOWS } from "../flows"
import { startTourHref } from "../engine/useTourFromUrl"
import {
  readFirstLoginDismissed,
  useDismissedSync,
  writeFirstLoginDismissed,
} from "../engine/useOnboardingProgress"

/**
 * 첫 로그인 안내 toast — Q6 결정 (PR #301 OnboardingHint 패턴 복제).
 *
 * - dismissed 키 영속(localStorage). 한 번 닫으면 다시 안 뜸.
 * - tour 진행 중(URL에 ?tour=)이거나 /tutorial 페이지면 표시 X (중복 방지).
 * - 1초 딜레이 후 표시 (다른 toast/모달과 겹치지 않게).
 */
export const FirstLoginToast = () => {
  const location = useLocation()
  const [dismissed, setDismissed] = useDismissedSync()
  const [visible, setVisible] = useState(false)

  // 활성 tour 또는 /tutorial 페이지면 toast 숨김.
  const params = new URLSearchParams(location.search)
  const inTour = params.has("tour")
  const onTutorialPage = location.pathname === "/tutorial"

  useEffect(() => {
    if (dismissed || inTour || onTutorialPage) {
      setVisible(false)
      return
    }
    const t = window.setTimeout(() => setVisible(true), 1000)
    return () => window.clearTimeout(t)
  }, [dismissed, inTour, onTutorialPage])

  // localStorage 직접 읽기로 (다른 탭에서 변경 즉시 반영)
  useEffect(() => {
    if (readFirstLoginDismissed()) setVisible(false)
  }, [location.pathname])

  const onDismiss = () => {
    writeFirstLoginDismissed(true)
    setDismissed(true)
    setVisible(false)
  }

  if (!visible) return null

  // 첫 흐름(셀프 데모) 시작 링크. PR #2 이후 persona/테넌트별 추천 흐름으로 발전 가능.
  const firstFlow = ALL_FLOWS[0]
  if (!firstFlow) return null
  const startHref = startTourHref(firstFlow)

  return (
    <div
      data-onboarding-ui="true"
      className="fixed bottom-5 left-5 z-[120] w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-amber-300 bg-white shadow-2xl dark:border-amber-700/40 dark:bg-slate-900"
      role="status"
    >
      <header className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-700/40 dark:bg-amber-900/20">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
          <GraduationCap className="h-4 w-4" />
          처음이신가요?
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/30"
          aria-label="닫기"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="space-y-2 p-3 text-xs text-slate-700 dark:text-slate-300">
        <p>
          업무 흐름을 한 번 따라가보는{" "}
          <span className="font-medium text-amber-900 dark:text-amber-200">튜토리얼</span>이 있어요.
          PO·LC·BL·면장·원가 같은 흐름이 곧 추가됩니다 — 지금은 사용법 데모(3단계)로 짧게
          둘러보세요.
        </p>
        <p className="rounded border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          나중에 찾을 땐 사이드바 <span className="font-medium">🎓 튜토리얼</span>에서 다시 볼 수
          있어요.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <Link
            to={startHref}
            onClick={onDismiss}
            className="flex-1 rounded bg-amber-500 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-amber-600"
          >
            지금 시작
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            나중에
          </button>
        </div>
      </div>
    </div>
  )
}
