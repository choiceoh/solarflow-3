// Cloudflare Pages Function: /api/* 를 백엔드로 프록시
// _redirects 의 200 rewrite 는 cross-domain 을 지원하지 않아서 Function 으로 처리
const BACKEND = 'https://api.topworks.ltd'

function jsonError(status, message) {
  return new Response(JSON.stringify({ code: status, message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export async function onRequest({ request }) {
  const url = new URL(request.url)
  const target = BACKEND + url.pathname + url.search
  try {
    const response = await fetch(new Request(target, request))
    const contentType = response.headers.get('content-type')?.toLowerCase() || ''
    if (!response.ok && !contentType.includes('application/json')) {
      return jsonError(
        response.status,
        `API 서버 연결이 일시적으로 실패했습니다. 잠시 후 다시 시도해주세요. (HTTP ${response.status})`,
      )
    }
    return response
  } catch {
    return jsonError(502, 'API 서버 연결이 일시적으로 실패했습니다. 잠시 후 다시 시도해주세요. (HTTP 502)')
  }
}
