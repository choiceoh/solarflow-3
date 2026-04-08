# TASK: Round 1 + 2 + 3 통합

기준 문서: harness/DESIGN_v4_FULL.md
범위: PO 완성 + LC 워크플로우 신규 + 입고 완성(LC->BL)
범위 외: FIFO, outbound_status, outbound_fifo_details, 매출/이익분석 = Round 4

## Round 1: PO 완성

### 1-A. PO 수정 시 발주품목 로드 + 수정 저장
현재 버그: PO 수정 진입 시 발주품목이 빈 상태로 표시됨.
기존 품목이 반드시 로드되어야 함.
품목 수정/추가/삭제 후 저장 시 diff CRUD 정상 동작 필수.
products 비동기 로딩 타이밍과 무관하게 기존 품목 보존할 것.

### 1-B. PO 상태 자동 전환
수동 선택: 예정(draft), 계약완료(contracted) 만 가능.
자동 전환:
- shipping: BL 1건 이상 등록 시 자동
- completed: PO 전량 입고완료 시 자동
Go 백엔드: BL 생성/수정/삭제 시 syncPOStatus(poID) 호출.
이미 구현되어 있다면 정상 동작하는지 확인만.

### 1-C. PO 상세 화면 구조 변경
[기본정보] -> [종합정보] 이름 변경.
종합정보 탭에 포함:
- 기본필드 (계약유형, 제조사, 계약일, Incoterms, 결제조건, 총수량, 총MW)
- T/T 납부현황: 기납부 USD / 잔여 USD / 진행률 바
- LC 개설현황: 기개설 USD / 미개설잔액 / 진행률 바
- 진행률 바: 계약MW -> LC개설MW(%) -> 선적MW(%,BL등록기준) -> 입고완료MW(%)
- T/T 이력 테이블 (기존 TT이력 탭 내용)
- [+ T/T 등록] 버튼

TT이력 탭 삭제.
최종 탭: [종합정보] [입고품목] [LC현황] [입고현황]

### 1-D. 라인아이템 -> 입고품목 용어 변경
사용자에게 보이는 모든 곳에서 라인아이템 -> 입고품목 으로 변경.
대상: PO 상세 탭명, BL 상세 탭명, 다이얼로그 제목, 버튼 텍스트, 에러 메시지.
코드 내부 변수명/주석은 변경하지 않음.

### 1-E. PO/LC 드롭다운 표시 개선
PO 선택 드롭다운: PO번호 | 제조사(한글) | X.XMW | YYYY-MM 형식
LC 선택 드롭다운: LC번호 | 제조사 | 은행 | $금액 | X.XMW 형식
적용 대상: 입고등록의 PO/LC 선택, LC 개설의 PO 선택, T/T 등록의 PO 선택 등 모든 곳.
이미 구현되어 있다면 확인만.

## Round 2: LC 워크플로우 신규

### 2-A. 사이드바에 LC 관리 메뉴 추가
위치: 발주관리 아래, 입고관리 위.
아이콘: Lucide에서 적절한 것 선택.

### 2-B. LC 목록 페이지
컬럼: LC번호, PO번호(PO JOIN), 제조사(PO->제조사 JOIN), 은행(JOIN), 개설법인(JOIN), 개설일, 금액USD, MW, 만기일, 상태
필터: 상태, 은행, 법인
버튼: + LC 개설
행 클릭: LC 상세

### 2-C. LC 개설 등록 폼 (다이얼로그)
PO 선택 드롭다운(필수). PO 선택 시 자동 표시:
- PO 계약총액 = SUM(po_line_items 총액)
- T/T 기납부 = SUM(tt_remittances.amount_usd WHERE status=completed AND po_id=선택PO)
- LC 기개설 = SUM(lc_records.amount_usd WHERE po_id=선택PO AND 현재 편집중인 LC 제외)
- LC 미개설잔액 = 계약총액 - T/T - LC기개설
이 4개를 박스로 표시(수정불가).

입력필드:
- LC번호 (텍스트)
- 개설은행* (드롭다운, banks JOIN)
- 개설법인* (드롭다운, companies. D-094: PO법인과 다를 수 있음)
- 개설일 (DateInput)
- 개설금액USD* (숫자)
- 대상수량EA (숫자)
- 대상MW (자동 = 대상수량 x PO대표품번 wattage_kw / 1000)
- Usance일수 (숫자, 기본90)
- Usance유형 (Buyers/Shippers)
- 만기일 (자동 = 개설일 + Usance일수)
- 상태* (pending/opened/docs_received/settled)
- 메모

개설 후 잔여 실시간 표시: 미개설잔액 - 이번 개설금액

저장검증: PO필수, 은행필수, 법인필수, 금액양수
금액 > 미개설잔액 -> 경고 표시 (저장은 허용)

### 2-D. LC 수정
등록과 동일 폼. 기존 데이터 전부 로드.
수정 후 PO 범위 초과 시 경고.

### 2-E. LC 삭제
연결 BL 있으면 차단. 없으면 삭제.

### 2-F. LC 상세 페이지
기본정보 + PO 결제 현황 박스 + 연결 BL 목록 + LC 진행률

## Round 3: 입고 완성 (LC->BL)

### 3-A. 입고등록 폼 변경: 입고구분에 따라 LC/PO 선택

입고구분 선택:
- 해외직수입 -> LC 선택 드롭다운 표시 (PO 선택 숨김)
- 국내구매 -> PO 선택 드롭다운 표시 (LC 선택 숨김)
- 그룹내구매 -> PO 선택 드롭다운 표시

[해외직수입 시]
LC 선택(필수) -> PO/LC 현황 자동 표시:
  PO번호, PO 계약량, LC 개설금액, LC 기선적, LC 잔여
자동채움(수정불가): 제조사, 법인(LC의 개설법인), 통화(USD)
자동채움(수정가능): Incoterms

[국내구매 시]
PO 선택(필수) -> PO 현황 자동 표시:
  PO번호, 계약량, 기입고, 잔여
자동채움: 제조사, 법인, 통화(KRW)
면장환율 필드 비활성

### 3-B. BL 입고등록 저장 검증 추가
이번 입고 수량(MW) > LC 잔여 물량 -> 차단 "LC 잔여물량을 초과합니다. LC amend가 필요합니다."
이번 입고 수량(MW) > PO 잔여 물량 -> 경고 (저장 허용)
면장환율 비어있으면 status = shipping (미착품)
면장환율 있으면 status = completed 가능

### 3-C. BL 상태 completed 전환 시 면장환율 필수
Go 백엔드: BL status를 completed/erp_done으로 UPDATE 시
exchange_rate가 NULL이면 에러 반환: "면장환율을 입력해야 입고완료로 전환할 수 있습니다"

### 3-D. BL 상세에 [면장/원가] 탭 추가
기존 탭: [기본정보] [입고품목]
변경: [기본정보] [입고품목] [면장/원가] [출고추적]

[면장/원가] 탭:
면장정보 섹션: 면장번호, 수입신고일, 세관, HS코드, 입항일, 반출일
  -> 기존 declarations 테이블 CRUD 연결 (해당 BL의 면장)
  -> 등록/수정/삭제

원가 섹션: 면장환율(기본정보에서), CIF원화총액(자동), CIF Wp단가(자동)

부대비용 섹션: + 추가 버튼
  비용유형(11종 드롭다운), 금액, 부가세(자동10%), 합계, 거래처, 메모
  등록/수정/삭제

Landed Cost 섹션:
  CIF원가 + 부대비용배분 + 관세 = Landed Wp단가
  [Landed Cost 저장] 버튼 -> Rust landed-cost API (save=true)

환율비교 섹션:
  발주환율(PO) vs 면장환율(BL) vs 송금환율(TT)
  차이 표시 -> Rust exchange-compare API

출고추적 탭은 비어있음(Round 4에서 구현). "출고추적은 Round 4에서 활성화됩니다" 표시.

### 3-E. 입고 목록에 PO번호, LC번호 컬럼 추가
BL 목록 테이블에 PO번호, LC번호 컬럼 추가.
FK JOIN으로 번호 표시.

### 3-F. 재고현황 가용재고 탭 추가
기존 탭: [재고현황] [미착품] [수급전망]
변경: [가용재고] [미착품] [재고상세] [수급전망]

[가용재고] 탭 (첫번째):
요약카드 4개: 물리적재고MW, 가용재고MW, 미착품MW, 총확보량MW
테이블: 제조사, 모델명, 규격, 크기mm, 물리EA, 물리MW, 예약, 배정, 가용EA, 가용MW
같은 Wp라도 크기 다르면 별도 행 (product_id 기준 그룹핑)

기존 재고현황 탭 -> [재고상세]로 이름 변경
[재고상세]: BL별 드릴다운. BL번호, PO, 입고일, 면장환율, CIF원가, 입고EA, 출고EA, 잔여EA

### 3-G. 모듈 크기(mm) 전체 화면 표시
모듈이 나오는 모든 테이블에 크기(mm) 컬럼 추가.
표시형식: 2465x1134 (가로x세로)
데이터: products.module_width_mm, module_height_mm
대상: 재고현황, 입고목록, 출고목록, PO 발주품목, 수급전망, 가용재고

### 3-H. 사이드바 메뉴 순서 변경
현재 순서를 v4 설계서 메뉴 구조로 변경:
업무흐름: 발주관리, LC관리, 입고관리, 재고현황, 출고/판매, 수주/수금
현황/분석: 대시보드, LC한도/만기, 매출/이익분석
도구: 마스터관리, 검색, 메모, 결재안, 엑셀, 설정

면장/원가 메뉴 제거 (BL 상세 탭으로 이동됨)

## 빌드 및 재시작

Go 변경 시:
cd ~/solarflow-3/backend && go build -o solarflow-go . && launchctl stop com.solarflow.go && launchctl start com.solarflow.go

프론트 변경 시:
cd ~/solarflow-3/frontend && npm run build

DB 변경 시:
psql -d solarflow -c "NOTIFY pgrst, 'reload schema';"
launchctl stop com.solarflow.postgrest && launchctl start com.solarflow.postgrest

## 이 TASK에서 하지 않는 것
- outbound_fifo_details 테이블 -> Round 4
- bl_shipments.outbound_status 컬럼 -> Round 4
- Rust fifo-match API -> Round 4
- 출고 FIFO 매칭 -> Round 4
- 매출/이익분석 화면 -> Round 4
- 데이터 이관 -> Round 6

## 완료 기준
1. PO 등록/수정/삭제 완전 동작 (발주품목 로드+수정저장 포함)
2. PO 상세 종합정보에 TT/LC 현황 + 진행률 한 화면
3. LC 개설 등록/수정/삭제 동작 (PO에서 데이터 내려옴)
4. 입고등록에서 LC 선택 -> PO+LC 데이터 자동채움
5. BL 상세에 면장/원가 탭 (부대비용 CRUD + Landed Cost)
6. 재고현황 첫 탭 = 가용재고
7. 모듈 크기mm 전체 화면 표시
8. 사이드바 메뉴 v4 순서
9. 용어: 라인아이템 -> 입고품목
10. go test PASS, frontend build 성공

## 보완 사항 (누락 수정)

### 보완-1. PO 목록 컬럼 추가
현재 PO 목록에 총금액/T/T/LC/미개설잔액 컬럼이 없음.
추가 컬럼: 총금액USD, T/T납부USD, LC개설USD, 미개설잔액USD
총금액 = SUM(po_line_items.total_amount_usd)
T/T납부 = SUM(tt_remittances.amount_usd WHERE status=completed)
LC개설 = SUM(lc_records.amount_usd)
미개설잔액 = 총금액 - T/T - LC (프론트 계산)
한눈에 PO의 결제 현황이 보여야 함.

### 보완-2. BL 상세에서 PO/LC 클릭 이동
BL 상세 기본정보에서:
- PO번호 클릭 -> PO 상세로 이동
- LC번호 클릭 -> LC 상세로 이동
링크 또는 클릭 이벤트로 구현.

### 보완-3. LC 개설 시 법인별 가용한도 표시
개설법인 드롭다운에 각 법인의 LC 가용한도 표시:
- 탑솔라(주) — 가용 $2,500,000
- 디원 — 가용 $800,000
- 화신이엔지 — 가용 $1,200,000
가용한도 = 은행한도 - 현재 LC 개설잔액 (Rust lc-limit-timeline 또는 프론트 계산)

### 보완-4. 국내구매 결제조건
국내구매 시 결제방식은 현금(계좌이체).
PO에 결제기간 설정 가능 (예: 납품 후 30일).
세금계산서 매입은 당연히 발생 (별도 필드 불필요, 출고/판매의 세금계산서와 동일 구조).
