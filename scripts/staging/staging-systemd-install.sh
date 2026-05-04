#!/usr/bin/env bash
# staging-systemd-install.sh (D-122)
# solarflow-go-staging.service 를 사용자 systemd 에 등록한다.

set -euo pipefail

REPO="${REPO:-/home/choiceoh/공개/solarflow-3}"
TEMPLATE="$REPO/scripts/staging/solarflow-go-staging.service.template"
DEST="$HOME/.config/systemd/user/solarflow-go-staging.service"
ENV_FILE="$REPO/scripts/staging/staging.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE 없음"
  echo "→ scripts/staging/staging.env.example 를 복사해 staging.env 만들고 secret 채워 넣을 것"
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
cp "$TEMPLATE" "$DEST"
echo "[$(date -Iseconds)] $DEST 설치 완료"

systemctl --user daemon-reload
systemctl --user enable solarflow-go-staging.service
echo "[$(date -Iseconds)] enable 완료. 시작은 직접:"
echo "    systemctl --user start solarflow-go-staging.service"
echo "    curl http://localhost:8082/health"
