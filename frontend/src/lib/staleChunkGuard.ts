// 새 배포 후 사용자의 옛 index.html 가 사라진 해시 청크(`*-XXXX.js`)를 fetch 하면
// "Failed to fetch dynamically imported module" 로 터진다. Vite 는 이 상황을
// `vite:preloadError` window 이벤트로 알려준다 — 한 번만 자동 reload 해서 새 번들을 받는다.
//
// 무한 루프 방지: sessionStorage 에 마지막 reload 시각을 남기고, 60 초 안에 또 터지면
// reload 대신 키보드 강력 새로고침을 안내한다 (네트워크/확장프로그램 같은 다른 원인일 가능성).
//
// reload 직전에 풀스크린 안내 오버레이를 띄워서, 흰 화면 대신 "업데이트 진행중" 메시지를
// 보여준다. 청크 로드 실패 상태라 React 트리 일부가 깨졌을 수 있어 vanilla DOM 으로 주입.

const FLAG = 'solarflow:stale-chunk-reload-ts'
const COOLDOWN_MS = 60_000
const OVERLAY_ID = 'solarflow-update-overlay'
const STYLE_ID = 'solarflow-update-overlay-style'
const AUTO_RELOAD_DELAY_MS = 1500

function ensureOverlayStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = '@keyframes solarflow-update-spin{to{transform:rotate(360deg)}}'
  document.head.appendChild(style)
}

function showUpdateOverlay(opts: { autoReload: boolean }) {
  if (document.getElementById(OVERLAY_ID)) return
  ensureOverlayStyles()

  const overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.setAttribute('role', 'alertdialog')
  overlay.setAttribute('aria-live', 'assertive')
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;background:rgba(255,255,255,0.96);' +
    'display:flex;align-items:center;justify-content:center;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a'

  const card = document.createElement('div')
  card.style.cssText =
    'max-width:420px;width:calc(100% - 32px);padding:32px 28px;' +
    'border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;text-align:center'

  const spinner = document.createElement('div')
  spinner.style.cssText =
    'width:36px;height:36px;margin:0 auto 20px;' +
    'border:3px solid #e2e8f0;border-top-color:#3b82f6;border-radius:50%;' +
    'animation:solarflow-update-spin 0.8s linear infinite'

  const title = document.createElement('div')
  title.textContent = '업데이트가 진행 중입니다'
  title.style.cssText = 'font-size:18px;font-weight:600;margin-bottom:8px'

  const desc = document.createElement('div')
  desc.textContent = opts.autoReload
    ? '잠시 후 새로고침을 눌러주세요'
    : '키보드 강력 새로고침이 필요합니다 — Ctrl+Shift+R (Mac: ⌘+Shift+R)'
  desc.style.cssText = 'font-size:14px;color:#475569;margin-bottom:20px;line-height:1.5'

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = '지금 새로고침'
  button.style.cssText =
    'padding:8px 20px;border:none;border-radius:8px;' +
    'background:#3b82f6;color:#ffffff;font-size:14px;font-weight:500;cursor:pointer'
  button.addEventListener('click', () => window.location.reload())

  card.append(spinner, title, desc, button)
  overlay.append(card)
  document.body.append(overlay)
}

export function installStaleChunkGuard() {
  window.addEventListener('vite:preloadError', (event) => {
    const last = Number(sessionStorage.getItem(FLAG) || '0')
    const now = Date.now()

    event.preventDefault()

    if (now - last < COOLDOWN_MS) {
      // 한 번 reload 했는데 또 터졌다 — 무한 루프 방지로 자동 reload 안 함.
      showUpdateOverlay({ autoReload: false })
      return
    }

    sessionStorage.setItem(FLAG, String(now))
    showUpdateOverlay({ autoReload: true })
    setTimeout(() => window.location.reload(), AUTO_RELOAD_DELAY_MS)
  })
}
