# Staging 스택 운영 스크립트 (D-122)

이 디렉토리는 **데이터 배선 enforcement 의 traffic replay diff 게이트**(D-122)를 위한
독립 staging 스택 셋업/유지보수 스크립트를 담는다.

## 목적

D-120 데이터 배선(row_filter / column_mask)의 enforcement 를 **prod 직접 적용 없이**
검증하기 위한 별도 스택. prod 와 동일 호스트(gx10-f96e)에 다른 포트로 띄워, 운영
트래픽을 리플레이하면서 응답 차이를 byte-level 로 비교한다.

## 구성

| 컴포넌트 | prod | staging |
|---|---|---|
| systemd 서비스명 | `solarflow-go.service` | `solarflow-go-staging.service` |
| HTTP 포트 | 8080 | 8082 |
| DB 이름 | `solarflow` | `solarflow_staging` |
| cloudflared 호스트 | `api.topworks.ltd` | `staging.topworks.ltd` |
| binary 경로 | `~/공개/solarflow-3/backend/solarflow-go` | 동일 (같은 binary, 환경변수만 다름) |
| 환경변수 차이 | `DATA_SCOPE_ENFORCE=off` | `DATA_SCOPE_ENFORCE=enforce` |

binary 는 prod 와 공유 — staging 만의 코드 분기 없음. 동작 차이는 환경변수로만.

## 셋업 절차 (1회)

```bash
# 1. staging DB 생성 + prod snapshot 적재
./staging-db-init.sh

# 2. systemd 유닛 설치
./staging-systemd-install.sh

# 3. cloudflared 라우트 추가 (~/.cloudflared/solarflow.yml 편집 + 재시작)
./staging-tunnel-add.sh

# 4. 동작 확인
curl https://staging.topworks.ltd/health
```

## 일일 sync (cron)

매일 03:00 KST 에 prod → staging snapshot reload:

```cron
0 3 * * * /home/choiceoh/공개/solarflow-3/scripts/staging/staging-daily-sync.sh
```

이 스크립트는:
1. `solarflow-go-staging` 정지
2. `pg_dump solarflow | psql solarflow_staging` (전체 reload)
3. 카탈로그 마이그레이션(`055_feature_wiring.sql` 등) 재적용 — 마이그레이션 자동 적용은
   기존 운영 webhook 의 `apply_migrations.py` 와 동일한 정책(`-- @auto-apply: yes` 헤더)
4. `solarflow-go-staging` 시작

## 안전 가드

- staging 의 `cloudflared` 라우트는 명시적 IP allowlist 또는 사내 인증으로 제한 권장
  (실데이터 들어가 있어 외부 노출 안 됨)
- staging 에서는 amaranth RPA / 외부 시스템 연동 모두 비활성 (env `EXTERNAL_INTEGRATIONS=off`)
- 마이그레이션 실패 시 staging 만 깨짐 — prod 영향 없음
- staging 종료 절차: systemd disable + DB drop + cloudflared 라우트 제거. 단순.

## 트러블슈팅

- staging 이 prod 와 응답 다르게 나옴 (enforcement OFF 상태에서) → 환경변수 / DB sync 점검.
  Phase 0 게이트 통과 못 하면 D-122 의 다음 단계로 못 감.
- cloudflared 가 `staging.topworks.ltd` 못 받음 → DNS CNAME + Pages 커스텀 도메인 누락 가능.
- pg_dump 가 너무 큼 → snapshot 시간이 길어짐. 분 단위로 떨어지면 logical replication 으로
  전환 검토 (운영 부담 감수).

## 파일 인덱스

- `staging-db-init.sh` — 1회 DB 초기 생성 + prod snapshot 적재
- `staging-systemd-install.sh` — `solarflow-go-staging.service` 등록
- `staging-tunnel-add.sh` — cloudflared 라우트 추가 + 재시작
- `staging-daily-sync.sh` — 일일 reload (cron)
- `staging-down.sh` — 전체 정리 (DB drop + systemd disable)
- `solarflow-go-staging.service.template` — systemd unit 템플릿

## 미구현 (후속 PR)

- replay 하네스 (`cmd/replay-diff/main.go`) — journald 파싱 → staging 으로 GET 요청 발사 → diff 분류
- diff dashboard (HTML 결과 페이지)
- `DATA_SCOPE_ENFORCE=enforce` 동작 자체 (지금은 값을 읽는 코드 자체가 없음 — 데이터 배선
  enforcement 는 D-122 게이트 통과 후 별도 PR 로 도입)
