// Cloudflare Pages Function: /health 를 백엔드로 프록시
const BACKEND = 'https://api.topworks.ltd'

export async function onRequest({ request }) {
  return fetch(new Request(BACKEND + '/health', request))
}
