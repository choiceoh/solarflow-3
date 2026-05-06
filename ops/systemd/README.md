# systemd user unit 파일

운영 박스(`gx10-f96e`)의 `~/.config/systemd/user/` 에 배치되는 unit 파일의 정본.
저장소에 두는 이유: 변경 이력 추적 + 코드 리뷰 + 신규 운영 박스 셋업 자동화.

## 적용 방법

```bash
# 1. 운영 박스에서:
cd ~/공개/solarflow-3
cp ops/systemd/solarflow-go.service     ~/.config/systemd/user/
cp ops/systemd/solarflow-engine.service ~/.config/systemd/user/

# 2. systemd 에 변경사항 알림 + 재시작 1회 (다음부터는 SIGHUP 으로 zero-downtime)
systemctl --user daemon-reload
systemctl --user restart solarflow-go.service solarflow-engine.service

# 3. 검증
systemctl --user show -p ExecReload --value solarflow-go.service
# → /bin/kill -HUP $MAINPID  형태로 출력되면 OK
```

## 핵심 변경 (D-123)

| 항목 | 이전 | 이후 |
|---|---|---|
| Go ↔ Engine | `Requires=solarflow-engine.service` (엔진 죽으면 Go 도 같이 죽음) | `Wants=` 로 약결합. Go 의 EngineClient 가 retry 로 단절 흡수 |
| Reload | 없음 (`systemctl restart` 만) | `ExecReload=/bin/kill -HUP $MAINPID` → tableflip zero-downtime |
| Shutdown | SIGKILL (default) | `KillSignal=SIGTERM` + `TimeoutStopSec=35` → graceful drain |

## 배포 흐름

`scripts/cron-deploy.sh` 가 새 바이너리를 원자 swap 한 뒤
`systemctl --user reload solarflow-go.service` 호출 → ExecReload → SIGHUP → tableflip 인계.
Reload 가 실패하거나 health 체크가 빨간 경우 `systemctl --user restart` 로 폴백.

상세는 [harness/PRODUCTION.md](../../harness/PRODUCTION.md) 와
[harness/DECISIONS.md](../../harness/DECISIONS.md) D-123 참조.
