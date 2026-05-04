#!/usr/bin/env bash
# staging-down.sh (D-122)
# 명시적 staging 정리: systemd disable + DB drop + 환경 파일 백업.
# cloudflared 라우트 제거는 ~/.cloudflared/solarflow.yml 수동 편집 필요.

set -euo pipefail

STAGING_DB="${STAGING_DB:-solarflow_staging}"

echo "[$(date -Iseconds)] === staging tear down 시작 ==="

systemctl --user stop solarflow-go-staging.service || true
systemctl --user disable solarflow-go-staging.service || true
rm -f "$HOME/.config/systemd/user/solarflow-go-staging.service"
systemctl --user daemon-reload

dropdb --if-exists "$STAGING_DB"

# 환경 파일은 secret 포함이라 단순 삭제 안 함 — backup 만
ENV_FILE="/home/choiceoh/공개/solarflow-3/scripts/staging/staging.env"
if [ -f "$ENV_FILE" ]; then
  mv "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  echo "[$(date -Iseconds)] $ENV_FILE 백업 (재시작 시 재사용 가능)"
fi

echo "[$(date -Iseconds)] === staging tear down 완료 ==="
echo "남은 수동 작업: ~/.cloudflared/solarflow.yml 에서 staging.topworks.ltd 라우트 제거 + cloudflared 재시작"
