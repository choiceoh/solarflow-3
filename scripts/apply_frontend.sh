#!/usr/bin/env bash
# 프론트엔드 빌드 반영 (Caddy 정적 서빙용 dist 갱신)
# 사용법: ./scripts/apply_frontend.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"

echo "SolarFlow frontend apply"
echo "frontend: ${FRONTEND_DIR}"

cd "${FRONTEND_DIR}"
bun run build

echo "Frontend dist build completed."
