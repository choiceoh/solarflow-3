# 바로(주) 화면 — 개요

`baro.topworks.ltd` 테넌트. 국내 도매·인바운드가 주력. **module/cable 테넌트와는 완전히 데이터 격리** 되어 있음 — baro 사용자는 topsolar 의 매입원가/이익률을 못 보고, topsolar 사용자는 baro 의 판매가/외상 잔액을 못 봄. 권한 문제가 아니라 도구 자체가 다른 테넌트에 노출 안 됨.

수입 도구(L/C·면장)는 등장하지 않음. baro 는 직수입 안 하고, 필요 품목은 그룹사(topsolar)에 매입요청을 보냄 → topsolar 가 수입 후 baro 로 출고.

## 화면 인덱스

| 경로 | 화면 | 역할 |
|---|---|---|
| `/baro/price-book` | 단가표 (거래처×품번 시간대별) | 수주 입력 시 단가 prefill 의 정본. admin/operator 만. |
| `/baro/purchase-history` | 자체 매입 이력 (BR 법인) | 분기별 평균 단가·편차·환율. admin/operator/executive. |
| `/baro/group-purchase` | 그룹 매입요청 (baro → topsolar) | 직수입 안 하는 품목을 그룹사에 요청. admin/operator. |
| `/group-trade/baro-inbox` | 매입요청 인박스 (topsolar 측에서 수신) | baro 가 보낸 요청을 topsolar 가 수락/거부. topsolar admin/operator. |
| `/baro/incoming` | 인커밍 보드 (입고예정) | topsolar 선적 정보를 금액 가린 채 읽기. 전 직급. |
| `/baro/dispatch` | 배차 보드 | 일자×차량 단위 배차, 출고 연계. admin/operator. |
| `/baro/credit-board` | 채권 보드 (외상 관리) | 거래처 누적 매출/입금/미수·한도 사용률·최장 미수일. admin/operator. |

세부 흐름은 같은 디렉토리의 `baro-prices.md`, `baro-group-trade.md`, `baro-ops.md` 참조 (path prefix 매칭으로 화면별 도큐가 자동 첨부됨).

## 공통 규칙

- **테넌트 격리는 절대**. URL 직접 접근해도 미들웨어(`baroOnly` / `topsolarOnly`)가 차단. AI 도구도 baro 사용자에게는 topsolar 데이터 도구 자체가 노출 안 됨.
- **단가표 → 수주 → 배차 → 출고 → 채권** 이 baro 의 일상 흐름. 단가표가 잘못 입력되면 수주 prefill 부터 잘못됨 → 매출·외상까지 줄줄이 영향.
- **그룹내 거래(intercompany)** 는 별도 흐름. 외상으로 가지 않고 그룹 내부 정산. baro 가 topsolar 에서 받은 물량은 채권 보드에 표시 안 됨.
- **모든 baro 화면 권한 기본값**: admin / operator. executive 는 조회만. viewer 는 일부 화면 차단(단가·외상 정보).

## 자주 묻는 질문 패턴 (전체 baro 영역)

- "이번 주 매출/입금/미수금 합계?" → 채권 보드 + 매출 대시보드.
- "그룹사에 보낸 요청 처리 상황?" → /baro/group-purchase 의 status.
- "X 거래처 단가 어디서 변경?" → /baro/price-book 에서 거래처·품번 필터 → 새 effective_from 으로 행 추가.
- "배차 안 된 인커밍?" → /baro/incoming 에서 ETA 도래분 ↔ /baro/dispatch 의 미배차 슬롯 비교.
- "탑솔라가 보유한 재고 직접 볼 수 있나?" → 불가. /baro/incoming 의 입고예정만 읽기 가능.

## 테넌트 가이드

baro 어시스턴트의 답변 톤:
- L/C·면장·수입 통관 질문이 들어오면 "이 화면(테넌트)에서는 직수입을 다루지 않습니다. 그룹사 매입요청은 /baro/group-purchase 에서 진행하세요" 로 안내.
- 단가·이익 질문은 manager 이하면 거절.
- 다른 거래처/타 영업의 외상은 권한 범위 밖으로 안내.
