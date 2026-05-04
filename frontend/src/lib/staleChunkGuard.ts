import { notify } from '@/lib/notify'

// 새 배포 후 사용자의 옛 index.html 가 사라진 해시 청크(`*-XXXX.js`)를 fetch 하면
// "Failed to fetch dynamically imported module" 로 터진다. Vite 는 이 상황을
// `vite:preloadError` window 이벤트로 알려준다 — 한 번만 자동 reload 해서 새 번들을 받는다.
//
// 무한 루프 방지: sessionStorage 에 마지막 reload 시각을 남기고, 60 초 안에 또 터지면
// reload 대신 수동 강력 새로고침을 안내한다 (네트워크/확장프로그램 같은 다른 원인일 가능성).

const FLAG = 'solarflow:stale-chunk-reload-ts'
const COOLDOWN_MS = 60_000

export function installStaleChunkGuard() {
  window.addEventListener('vite:preloadError', (event) => {
    const last = Number(sessionStorage.getItem(FLAG) || '0')
    const now = Date.now()

    if (now - last < COOLDOWN_MS) {
      notify.error('새 버전 로드 실패 — Ctrl+Shift+R (Mac: Cmd+Shift+R) 로 강력 새로고침 해주세요')
      return
    }

    sessionStorage.setItem(FLAG, String(now))
    event.preventDefault()
    window.location.reload()
  })
}
