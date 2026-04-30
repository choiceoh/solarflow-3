# SolarFlow 3.0 Mockup

UI/UX 검토용 정적 목업. 빌드 불필요.

## 실행

```bash
cd frontend/mockups/v3
python3 -m http.server 8080
```

→ http://localhost:8080/SolarFlow%203.0.html

## 화면 구성

- **로그인** — 터미널 분할 레이아웃
- **메인 셸 (Command Center)** — 동일 셸 공유, 사이드바와 우측 레일로 화면별 컨텍스트 차별화
  - 대시보드, 가용재고
  - P/O 발주, L/C 개설, B/L 입고 (구매)
  - 수주, 출고/판매, 수금 (판매)
  - L/C 한도, 매출 분석 (현황)

## 데이터 아키텍처

모든 화면이 `entities.jsx`의 통합 엔티티를 derive해서 KPI·합계·에이징을 계산.
화면 간 숫자 일치를 보장.
