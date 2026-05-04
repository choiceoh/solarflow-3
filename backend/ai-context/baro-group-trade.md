# 바로(주) — 그룹내 거래 (매입요청·인박스·인커밍)

baro 가 직수입을 하지 않는 품목을 그룹사(topsolar)에게 받아오는 흐름. 양방향 화면 + 입고예정 보드의 3 개 화면이 한 묶음. 외상이 아닌 *그룹내 정산* 으로 처리되며 채권 보드에는 표시 안 됨.

## 흐름 다이어그램

```
baro 가 요청 작성             topsolar 가 수락             topsolar 발주·입고 후
/baro/group-purchase  →  /group-trade/baro-inbox  →  topsolar 출고(group_trade=true) →  baro 인커밍 보드 표시
                                                                                 (/baro/incoming)
                                                                          ↓
                                                                        baro 배차 → 출고
```

## 그룹 매입요청 (`/baro/group-purchase`)

- baro → topsolar 로 보내는 *역구매* 요청. baro 가 가지고 있지 않은 품목·규격을 명시.
- **엔티티**: `intercompany_requests` (requester_company=baro)
- **상태**: pending → shipped (topsolar 가 발주·선적 완료) → received (baro 도착) → rejected (topsolar 거부) → cancelled (baro 취소).
- **desired_arrival_date**: 희망 도착일. 지키지 못하면 topsolar 가 코멘트로 사유 기입.
- **권한**: admin / operator. executive 는 조회만.

## 매입요청 인박스 (`/group-trade/baro-inbox`) ← topsolar 측 화면

- baro 가 보낸 요청을 topsolar 가 받아 처리하는 화면. **이 화면은 topsolar 사용자만 볼 수 있음** — baro 사용자에게는 노출조차 안 됨.
- 수락(Receive) 시 topsolar 의 outbound (group_trade=true, target_company=baro) 가 자동 생성되어 매핑.
- 거부(Reject) 시 사유 입력 필수. baro 측에 알림.

## 인커밍 보드 (`/baro/incoming`)

- topsolar 가 baro 로 발송할 선적 정보를 baro 측에서 *읽기 전용* 으로 보는 화면. 그룹매입요청의 결과물뿐 아니라 정기 공급 물량도 포함.
- **D-116 정책**: 금액·환율 칸은 가림(sanitized). ETA·수량·제조사·품번만 노출. baro 가 topsolar 의 매입원가를 알 수 없게 함.
- **상태 필터**: scheduled / shipping / arrived / customs (기본). completed 는 이미 입고된 것이라 별도 화면.
- **권한**: 전 직급 (조회만 — 편집 불가).

## 권한 매트릭스

| 역할 | group-purchase | baro-inbox (topsolar) | incoming |
|---|---|---|---|
| baro admin/operator | 작성·취소·조회 | 차단 | 조회 |
| baro executive | 조회 | 차단 | 조회 |
| baro staff/viewer | 조회만 | 차단 | 조회 |
| topsolar admin/operator | 차단 | 수락·거부·조회 | 차단 |

## 자주 묻는 질문 패턴

- "탑솔라 확정 안 된 요청은?" → group-purchase 의 status=pending.
- "예정일 지난 요청 언제 도착?" → desired_arrival_date < today AND status IN (pending, shipped) — topsolar 측 코멘트 확인.
- "인도 예정 언제?" → /baro/incoming 의 ETA. ETD 도 함께 표시.
- "이 인커밍 매입원가는?" → 답변 거절. 인커밍 보드는 의도적으로 금액을 가림 (D-116). 내부 사정상 필요하면 topsolar 영업에 직접 확인.
- "이번 주 처리율?" → group-purchase 에서 created_at 기준 주간 + status=shipped/received 비율. (이건 topsolar 측 baro-inbox 에서 봐도 동일.)
- "탑솔라가 거부한 요청 사유는?" → group-purchase status=rejected 행의 코멘트.

## 연결

- **단가**: 그룹매입은 외부 매입과 가격 정책이 다름. 그룹내 정산이라 매입이력(`/baro/purchase-history`) 의 BR 법인 단가에 잡힘.
- **배차**: 인커밍 → arrived 후 → /baro/dispatch 로 차량 배정 → outbound (외부 거래처로) 의 순서.
- **채권 보드**: 그룹내 거래는 채권 보드에 잡히지 않음. 외상 잔액이 비정상이면 그룹내 거래가 잘못 외상으로 분류됐는지 의심.
