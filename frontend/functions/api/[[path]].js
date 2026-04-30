// Cloudflare Pages Function: /api/* 를 백엔드로 프록시
// _redirects 의 200 rewrite 는 cross-domain 을 지원하지 않아서 Function 으로 처리
const BACKEND = 'https://api.topworks.ltd'

export async function onRequest({ request }) {
  const url = new URL(request.url)
  const target = BACKEND + url.pathname + url.search
  return fetch(new Request(target, request))
}
