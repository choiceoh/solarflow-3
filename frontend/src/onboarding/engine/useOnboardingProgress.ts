import { useCallback, useEffect, useState } from "react"

/**
 * 진척 추적 — Q9 결정.
 * - 단계별 진척: localStorage (디바이스 한정, 즉각).
 * - 흐름 완료: DB (`POST /users/me/onboarding/complete`) — PR #2 이후 추가. 현재는 localStorage만.
 *
 * 완료 인정 = 마지막 단계까지 도달 + [완료] 명시 클릭. dismiss/건너뛰기는 진척만 저장.
 */

const LOCAL_KEY = "sf.onboarding.local"
const TOAST_DISMISSED_KEY = "sf.onboarding.first-login-dismissed"

interface LocalState {
  /** 마지막으로 본 위치 — 사이드바 🎓 메뉴에서 "이어보기" 표시용. */
  lastSeen?: { flowId: string; stepIdx: number }
  /** 본 디바이스에서 완료한 flow id 집합. DB 동기화는 PR #2 이후. */
  completedFlows: string[]
}

const empty: LocalState = { completedFlows: [] }

const read = (): LocalState => {
  if (typeof window === "undefined") return empty
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<LocalState>
    return { completedFlows: parsed.completedFlows ?? [], lastSeen: parsed.lastSeen }
  } catch {
    return empty
  }
}

const write = (next: LocalState) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
  } catch {
    /* noop */
  }
}

export const useOnboardingProgress = () => {
  const [state, setState] = useState<LocalState>(read)

  const markLastSeen = useCallback((flowId: string, stepIdx: number) => {
    setState((prev) => {
      const next = { ...prev, lastSeen: { flowId, stepIdx } }
      write(next)
      return next
    })
  }, [])

  const markCompleted = useCallback((flowId: string) => {
    setState((prev) => {
      if (prev.completedFlows.includes(flowId)) return prev
      const next = { ...prev, completedFlows: [...prev.completedFlows, flowId] }
      write(next)
      // PR #2 이후: POST /users/me/onboarding/complete { flowId } 추가.
      return next
    })
  }, [])

  const isCompleted = useCallback(
    (flowId: string) => state.completedFlows.includes(flowId),
    [state.completedFlows],
  )

  return { state, markLastSeen, markCompleted, isCompleted }
}

export const readFirstLoginDismissed = (): boolean => {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(TOAST_DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}

export const writeFirstLoginDismissed = (v: boolean) => {
  if (typeof window === "undefined") return
  try {
    if (v) window.localStorage.setItem(TOAST_DISMISSED_KEY, "1")
    else window.localStorage.removeItem(TOAST_DISMISSED_KEY)
  } catch {
    /* noop */
  }
}

/** SSR-safe localStorage 변경 watch — 다른 탭/창에서 변경 시 동기화. */
export const useDismissedSync = () => {
  const [dismissed, setDismissed] = useState(readFirstLoginDismissed)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOAST_DISMISSED_KEY) setDismissed(readFirstLoginDismissed())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])
  return [dismissed, setDismissed] as const
}
