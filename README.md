# SolarFlow 3.0

Energy operations tool — repo independent of original fork.

- Backend: Go (chi v5) on port 8080
- Engine: Rust (Axum 0.8) on port 8081
- Frontend: React + Vite (Cloudflare Pages: `module.topworks.ltd`, `cable.topworks.ltd`, `baro.topworks.ltd`)
- Public API: `https://api.topworks.ltd` (Cloudflare Tunnel → on-prem DGX)
