# 아마란스 출고 업로드 RPA 워커

SolarFlow의 `amaranth_upload_jobs` 대기열에 쌓인 출고 엑셀을 아마란스 웹 `출고등록엑셀업로드` 화면에 올리는 Playwright 워커입니다.

## 운영 흐름

```text
SolarFlow 업로드 작업 생성
→ 워커가 pending 작업 선점
→ 저장된 엑셀 다운로드
→ 아마란스 웹 화면 열기
→ 기능모음
→ 엑셀 업로드
→ 변환확인
→ 작업 상태 저장
```

아마란스 로그인은 기본적으로 처음 1회 사람이 직접 합니다. `npm run login`으로 열린 브라우저에서 로그인하면 `.profile/`에 세션이 저장되고, 이후 `once`/`watch`가 같은 프로필을 재사용합니다. 세션이 만료되는 운영 환경에서는 자동 로그인 fallback을 켤 수 있습니다.

## 설치

```bash
cd rpa/amaranth-uploader
npm install
cp .env.example .env
```

`.env`에서 아래 값을 채웁니다.

- `SOLARFLOW_API_URL`: 예) `http://localhost:8080`
- `SOLARFLOW_AMARANTH_RPA_TOKEN`: Go 백엔드에도 같은 값으로 넣은 아마란스 RPA 전용 토큰
- `AMARANTH_OUTBOUND_UPLOAD_URL`: 아마란스 `출고등록엑셀업로드` 화면 URL

`SOLARFLOW_AMARANTH_RPA_TOKEN`은 `/api/v1/export/amaranth/*` 경로에서만 동작합니다. 임시로 사용자 세션 토큰을 쓰려면 `SOLARFLOW_ACCESS_TOKEN`을 넣어도 됩니다.

## 브라우저 정책

기본값은 `AMARANTH_BROWSER_CHANNEL=auto`입니다.

- 설치된 Google Chrome을 먼저 사용
- Chrome이 없으면 Windows 기본 Microsoft Edge 사용
- 별도 브라우저 다운로드 없음

Playwright 번들 Chromium을 꼭 써야 하는 개발/장애 대응 환경에서만 `npm run install:browsers` 실행 후 `AMARANTH_BROWSER_CHANNEL=bundled`로 바꿉니다.

## 사용자용 Windows 실행 파일

실제 사용자 배포 ZIP에는 `node_modules/`, `runtime/node/node.exe`, `.env`, `windows/*.bat`를 포함합니다. 사용자는 터미널 명령을 치지 않고 아래 파일만 더블클릭합니다. `.env`는 SolarFlow의 `자동화 받기` 버튼이 다운로드 시 서버 주소와 RPA 토큰을 넣어 생성합니다.

- `windows/login-session.bat`: 최초 1회 아마란스 로그인 세션 저장
- `windows/run-once.bat`: 대기 작업 1건 처리
- `windows/run-watch.bat`: 계속 감시하며 처리
- `windows/install-startup-task.bat`: Windows 로그인 시 자동 실행 등록
- `windows/remove-startup-task.bat`: 자동 실행 해제

운영자가 배포 ZIP을 만들 때는 Windows용 portable Node.js를 `runtime/node/node.exe`에 둔 뒤 아래 스크립트를 실행합니다.

```powershell
npm ci --omit=dev
powershell -ExecutionPolicy Bypass -File scripts/build-windows-package.ps1
```

생성된 `dist/solarflow-amaranth-rpa-windows.zip`을 서버에 두고 Go 백엔드 환경변수에 연결합니다.

```env
SOLARFLOW_AMARANTH_RPA_PACKAGE=../rpa/amaranth-uploader/dist/solarflow-amaranth-rpa-windows.zip
SOLARFLOW_PUBLIC_API_URL=http://localhost:8080
AMARANTH_OUTBOUND_UPLOAD_URL=https://...
```

## 자동 로그인

세션 재사용이 우선이고, 로그인 화면이 감지될 때만 아래 값을 사용합니다. 자동화 전용 PC에서만 켜고 `.env`는 절대 커밋하지 않습니다.

```env
AMARANTH_AUTO_LOGIN=true
AMARANTH_COMPANY_CODE=topsolar
AMARANTH_USER_ID=사용자아이디
AMARANTH_PASSWORD=비밀번호
```

백그라운드 실행은 아래처럼 켭니다.

```env
AMARANTH_HEADLESS=true
```

자동 로그인은 `회사코드/아이디 → 다음 → 비밀번호 → 로그인` 흐름을 우선 처리하고, 화면 구조가 다르면 `LOGIN_ID_INPUT_NOT_FOUND`, `LOGIN_PASSWORD_INPUT_NOT_FOUND`, `LOGIN_SUBMIT_NOT_FOUND` 같은 오류로 `manual_required`를 남깁니다.

## 실행

```bash
# 1회 로그인 세션 저장
npm run login

# pending 작업 1건 처리
npm run once

# 계속 감시하면서 처리
npm run watch
```

## 실패 처리

워커는 성공 확신이 없으면 `uploaded`로 표시하지 않고 `manual_required`로 남깁니다. 실패 시 `artifacts/`에 화면 캡처를 저장하고, SolarFlow 작업의 `last_error`에 오류 코드와 캡처 경로를 기록합니다.

대표 오류:

- `LOGIN_REQUIRED`: 아마란스 로그인 세션이 만료됨
- `LOGIN_FAILED`: 자동 로그인 후에도 로그인 화면에 머무름
- `SCREEN_NOT_READY`: 출고등록엑셀업로드 화면을 확인하지 못함
- `MENU_NOT_FOUND`: 기능모음 또는 엑셀 업로드 메뉴를 찾지 못함
- `FILE_CHOOSER_FAILED`: 파일 선택창 또는 파일 입력을 처리하지 못함
- `CONVERT_CONFIRM_FAILED`: 변환확인 버튼을 찾지 못함
- `RESULT_UNCONFIRMED`: 클릭은 끝났지만 성공 문구를 확인하지 못함

## 화면 문구 조정

아마란스 메뉴 문구가 다르면 `.env`의 정규식만 바꿉니다.

```env
AMARANTH_UPLOAD_MENU_TEXT=엑셀\s*업로드|파일\s*업로드
AMARANTH_CONVERT_CONFIRM_TEXT=변환\s*확인
```
