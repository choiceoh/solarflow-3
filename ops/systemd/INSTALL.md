# SolarFlow 회귀 방지 cron — 운영 설치

## 구조 (D-064 PR 37)

3 layer 회귀 방지:
1. **DB 정합성 cron** — `scripts/integrity_cron.py` — 30분 (HIGH) + 매일 04:00 (ALL)
2. **API smoke test** — `scripts/api_smoke_test.py` — 운영 deploy hook
3. **빌드 가드 testid** — `backend/internal/handler/{paginated_fetch_guard_test,regression_guards_test}.go`

## 운영 설치 (운영 서버 1회)

```bash
# 1) 환경변수 파일 (Slack webhook 등)
mkdir -p ~/.config/solarflow
cat > ~/.config/solarflow/integrity.env <<EOF
SUPABASE_DB_URL=postgresql://postgres.xxx@xxx/postgres
SOLARFLOW_ALERT_WEBHOOK=https://hooks.slack.com/services/...
EOF
chmod 600 ~/.config/solarflow/integrity.env

# 2) systemd user units 복사
cp ops/systemd/solarflow-integrity-*.{service,timer} ~/.config/systemd/user/

# 3) timer 활성화 (linger 있어야 로그아웃 후에도 실행)
loginctl enable-linger $USER  # 1회만
systemctl --user daemon-reload
systemctl --user enable --now solarflow-integrity-high.timer
systemctl --user enable --now solarflow-integrity-all.timer

# 4) 확인
systemctl --user list-timers | grep integrity
journalctl --user -u solarflow-integrity-high.service --since '1 hour ago'
```

## 주기

| 검증 | 주기 | 대상 |
|---|---|---|
| `solarflow-integrity-high.timer` | 30분 | HIGH 8개 (데이터 손실 즉시 감지) |
| `solarflow-integrity-all.timer` | 매일 04:00 KST | 전체 19개 (MED/LOW 추세) |

## 알림 채널

`SOLARFLOW_ALERT_WEBHOOK` 환경변수 설정 시 Slack 형식 webhook 호출.
없으면 `journalctl --user` 에 stderr 출력 (수동 확인).

## 점검

```bash
# 수동 dry-run
SUPABASE_DB_URL=... python scripts/integrity_cron.py --dry-run

# 최근 알림 (DB)
psql $SUPABASE_DB_URL -c "
SELECT c.name, c.severity, r.actual_value, r.passed, r.alerted, r.ran_at
FROM integrity_check_runs r JOIN integrity_checks c USING(check_id)
WHERE r.ran_at > now() - interval '24 hours'
ORDER BY r.ran_at DESC LIMIT 50;"
```

## baseline 갱신 (정상 데이터 변화 후)

```sql
UPDATE integrity_checks SET baseline_value = <new>, updated_at = now()
WHERE name = '<check_name>';
```
