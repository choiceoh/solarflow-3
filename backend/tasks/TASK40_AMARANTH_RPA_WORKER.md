# TASK40 — 아마란스 웹 출고 업로드 RPA 워커

## 배경

아마란스 출고 업로드는 유료 API 대신 웹 화면 자동화로 처리한다. SolarFlow는 이미 실물 출고 엑셀 양식과 업로드 작업 대기열을 만든다. 이번 작업은 본격 배포 전 리허설 가능한 Playwright 워커를 추가해 실제 웹 업로드 흐름을 검증하는 것이다.

## 범위

### Go API

- `GET /api/v1/export/amaranth/rpa-package`
  - 운영자가 준비한 Windows 자동화 ZIP 다운로드
  - 다운로드 시 서버 API 주소, RPA 토큰, 아마란스 업로드 URL을 `.env`로 주입
  - 사용자는 `npm` 명령 없이 배치 파일만 실행
- `POST /api/v1/export/amaranth/jobs/{id}/claim`
  - `pending` 작업만 `running`으로 선점
  - `attempts` 증가
  - `rpa_started_at` 저장
  - 이미 선점/완료된 작업은 409
- `SOLARFLOW_AMARANTH_RPA_TOKEN`
  - `/api/v1/export/amaranth/*` 경로에서만 RPA 전용 operator 인증 허용
  - 다른 API 경로에는 적용하지 않음

### RPA 워커

- 위치: `rpa/amaranth-uploader`
- 실행:
  - `npm run login`
  - `npm run once`
  - `npm run watch`
- 자동화 순서:
  - 로그인 화면이면 `AMARANTH_AUTO_LOGIN=true`에서 회사코드/아이디/비밀번호 자동 입력
  - 아마란스 `출고등록엑셀업로드` 화면 진입
  - `기능모음`
  - `엑셀 업로드`
  - 파일 선택
  - `변환확인`
- 성공 확신이 없으면 `manual_required`
- 실패 시 스크린샷과 오류 코드를 남김
- 기본 브라우저는 `AMARANTH_BROWSER_CHANNEL=auto`
  - 설치된 Chrome 우선
  - Chrome이 없으면 Windows 기본 Edge 사용
  - 별도 Chromium 다운로드는 개발/장애 대응용 fallback
- 비밀번호는 자동화 전용 PC의 로컬 `.env`에만 저장하고 저장소에 포함하지 않음

## 비범위

- 2FA/보안모듈 우회
- 매출마감 자동화
- 입고 자동화

## 완료 기준

- Go build/vet/test 통과
- RPA 워커 JS syntax check 통과
- 프론트엔드 build 통과
- Windows 사용자용 배치 파일과 패키징 스크립트 추가
- 하네스 `PROGRESS.md`, `DECISIONS.md` 업데이트

## 리허설 기준

운영자가 배포 ZIP을 만든다.

```powershell
npm ci --omit=dev
powershell -ExecutionPolicy Bypass -File scripts/build-windows-package.ps1
```

SolarFlow 백엔드 환경변수를 설정한다.

```env
SOLARFLOW_AMARANTH_RPA_TOKEN=긴_임의_토큰
SOLARFLOW_AMARANTH_RPA_PACKAGE=../rpa/amaranth-uploader/dist/solarflow-amaranth-rpa-windows.zip
SOLARFLOW_PUBLIC_API_URL=http://localhost:8080
AMARANTH_OUTBOUND_UPLOAD_URL=https://...
```

사용자는 SolarFlow의 아마란스 출고 내보내기 창에서 `자동화 받기`를 누른 뒤 아래 순서로 확인한다.

1. `windows/login-session.bat` 더블클릭 후 아마란스 로그인
2. SolarFlow에서 업로드 작업 생성
3. `windows/run-once.bat` 더블클릭으로 1건 처리
4. 리허설 성공 후 `windows/install-startup-task.bat`로 자동 실행 등록
