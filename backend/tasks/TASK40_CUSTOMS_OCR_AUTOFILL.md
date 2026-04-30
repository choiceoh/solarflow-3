# TASK40: 면장 PDF OCR 자동채움

## 목적
수입필증/면장 PDF를 B/L 입력/수정 폼에서 선택하면 주요 입력값을 자동으로 채우되, DB 자동 저장은 하지 않는다.

## 범위
- Go API
  - `POST /api/v1/ocr/extract`에서 `document_type=customs_declaration` 지원
  - OCR 원문과 함께 구조화 후보 `fields.customs_declaration` 반환
  - 후보 필드:
    - B/L(AWB)번호
    - 입항일
    - 수입자
    - 운송주선인
    - 무역거래처
    - 국내도착항
    - 모델/규격
    - 수량
    - 단가
    - 금액(USD)
    - CIF 원화금액
    - 환율
- 프론트엔드
  - `BLForm`에 `면장 PDF 자동채움` 버튼 추가
  - 자동 반영:
    - B/L번호
    - 실제입항일
    - 포워더
    - 항구
    - 입고품목
    - 면장 CIF 원화금액
    - 환율
  - 직접 저장 대상이 아닌 후보는 참고 요약으로 표시
- 하네스
  - D-098 판단 기록 추가
  - PROGRESS 업데이트

## 제외
- OCR 결과 DB 자동 저장
- 수입자/무역거래처 기반 법인/제조사 자동 변경
- 품번 마스터에 없는 모델 자동 생성

## 완료 후 검증
1. `bash scripts/setup_ocr_sidecar.sh`
2. 샘플 수입필증 PDF RapidOCR 실행
3. `cd backend && go test ./...`
4. `cd backend && go build ./... && go vet ./...`
5. `cd frontend && npm run build`
6. `graphify update .`

## 체크리스트
- struct 타입 사용
- OCR API 입력 검증 유지
- 자동 저장 없음
- B/L 폼 후보 채움 후 사용자 확인 저장
- Rust 계산엔진 영역 침범 없음
