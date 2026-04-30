# TASK39: 문서 OCR 워크벤치 내장

## 목적
`../module` 프로젝트에서 검증한 PaddleOCR/RapidOCR ONNX sidecar 흐름을 SolarFlow 3.0 안에 내장한다.

## 범위
- Go API
  - `POST /api/v1/ocr/extract`
  - `GET /api/v1/ocr/health`
  - multipart `images` 필드 여러 개 처리
  - 이미지/PDF를 임시 파일로 전달하고 persistent sidecar로 OCR 수행
  - 결과는 DB 자동 등록이 아니라 원문 텍스트, 줄별 신뢰도, 좌표 미리보기로 반환
- 프론트엔드
  - `/ocr` 페이지 추가
  - 이미지/PDF 선택, OCR 실행, 원문 텍스트 편집, 줄별 좌표 확인, 텍스트 복사, sidecar 상태 확인
  - 사이드바 도구 메뉴에 `문서 OCR` 추가
- 운영 스크립트
  - `scripts/setup_ocr_sidecar.sh`로 OCR Python venv 설치/점검
  - `backend/internal/ocr/sidecar-src/BUILD.md`에 모델/환경변수 기준 기록
- 하네스
  - D-096 판단 기록 추가
  - PROGRESS에 작업 이력 추가

## 제외
- OCR 결과의 PO/LC/B/L/면장 자동 저장
- 제조사별 C/I 전용 좌표 파서
- PaddleOCR 명시적 ONNX 모델 파일 자체의 저장소 포함

## 완료 후 검증
1. `cd backend && gofmt`
2. `cd backend && go test ./...`
3. `cd frontend && node node_modules/vite/bin/vite.js build`
4. `bash -n scripts/setup_ocr_sidecar.sh`
5. `graphify update .`

## 체크리스트
- struct 타입 사용
- OCR API 입력 검증
- OCR sidecar health API
- OCR 런타임 설치 스크립트
- 인증/권한 라우터 적용
- DB 자동 등록 없음
- Rust 계산엔진 영역 침범 없음
