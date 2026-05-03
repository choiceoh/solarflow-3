# SolarFlow UI 표준화 헌장

화면마다 어긋나는 UI 규칙을 정렬하기 위한 단일 문서. 5개 기둥(에러/토스트, 버튼, 상태 뱃지, 테이블, 필터)을 기둥별 PR 시리즈로 점진 마이그레이션한다.

각 기둥의 상세 규칙은 해당 섹션에서 정의한다. 결정 근거(왜 이렇게 했는지)는 `harness/DECISIONS.md` 또는 PR 본문에 별도 기록.

---

## 1. 에러/토스트

### 1.1 분기 규칙 — "토스트 vs 인라인 vs ErrorState"

| 상황 | 표시 방식 | 비고 |
|---|---|---|
| 비동기 변이 결과 (저장/삭제/제출 성공·실패) | **Toast** | 화면 컨텍스트 유지, transient |
| 시스템 알림 (세션 만료, 네트워크 끊김, 권한 변경) | **Toast** | 어느 화면에서도 발생 가능 |
| 폼 필드 검증 오류 | **Inline** (RHF + zod) | 필드 옆에 붙어야 의미 살아남 |
| 페이지 전체 로드 실패 (e.g., GET /pos 500) | **Inline ErrorState** (전체 차지) | 페이지가 그릴 콘텐츠 자체 없음 |
| 빈 상태 | **EmptyState** (`components/common/EmptyState.tsx`) | 에러 아님 |

`alert()`, `window.confirm()`, `window.prompt()` — **금지**. Biome `noAlert: error` 룰로 차단(PR-1.2 부터 활성).

### 1.2 토스트 동작 표면

| 항목 | 값 | 비고 |
|---|---|---|
| 라이브러리 | `sonner` | wrapper: `frontend/src/components/ui/sonner.tsx` |
| 위치 | `bottom-right` | 헤더 액션/탭/필터 가림 방지 |
| 지속 시간 | success 3s / error·warning 5s / loading 무한 | `notify.error/warning` 가 5s 자동 적용 |
| 최대 스택 | 3 + hover 펼치기 | sonner 기본 |
| 닫기 버튼 | 항상 노출 | 키보드 접근성 |
| 색 | `--sf-pos/-bg`, `--sf-neg/-bg`, `--sf-warn/-bg`, `--sf-info/-bg`, `--sf-surface` | tokens.css 단일 정본 |

### 1.3 사용 API

```ts
import { notify } from '@/lib/notify';

// 변이 성공 — 명시적 표기
notify.success('저장되었습니다');

// 변이 에러 — 거의 호출하지 않음. queryClient 글로벌 onError 가 자동 처리.
//   글로벌 핸들러를 우회해야 할 때만:
notify.error('역할 변경에 실패했습니다');

// long-running 작업 — promise 헬퍼
notify.promise(saveOrder(payload), {
  loading: '저장 중...',
  success: '저장되었습니다',
  error: (e) => `실패: ${e.message}`,
});
```

### 1.4 글로벌 에러 정책 (react-query)

```ts
// frontend/src/lib/queryClient.ts
mutations: {
  retry: 0,
  onError: (e) => notify.error(formatError(e)),
}
```

**모든 useMutation 의 에러는 자동으로 토스트가 뜬다.** 사이트는 `onError` 를 별도 작성하지 않아도 됨. 사이트 고유 후처리(state revert 등)가 필요할 때만 onError 추가 — 그 안에서 토스트를 또 부르면 안 됨(중복 표시 방지).

`formatError`: `Error` 인스턴스의 `.message` 우선, 그 외 fallback 한 줄 한국어 — `frontend/src/lib/notify.ts`.

### 1.5 마이그레이션 가이드 (PR-1.2~ 도메인 PR 작성자 용)

- `alert('실패')` → `notify.error('실패')` 또는 (변이 결과면) 글로벌 onError 에 위임 — 호출 자체 삭제.
- `window.confirm(...)` → `<ConfirmDialog />` (`components/common/ConfirmDialog.tsx`).
- 변이 결과를 인라인 `<p className="text-destructive">{err}</p>` 로 표시 → 변이 결과면 토스트로 옮김. 폼 필드 검증이면 RHF 에러로 유지.
- 변이 성공 시 명시적 `notify.success('...')` 추가.

### 1.6 검증

- E2E 헬퍼: `frontend/e2e/helpers/toast.ts` 의 `expectToast(page, text)` 로 토스트 등장을 검증.
- 도메인 PR 마다 핵심 변이 1~2건에 토스트 검증 추가.
- 운영 머지 후 1분 시각 확인.

---

## 2. 버튼

> _기둥 2 PR 시리즈에서 채워질 섹션. 결정된 헌장:_
> - variant ↔ 의도 매핑 (default / outline / ghost / destructive / link / secondary는 토글 활성에만)
> - 사이즈 정책 (default / sm / icon / icon-sm 4종 표준, xs/lg는 예외)
> - `Button.loading` prop 단일 패턴
> - 폼 footer 표준: `[취소 ghost] [저장 default]` 우측 정렬
> - 아이콘 규칙 (앞 위치, lucide 단일 라이브러리, 아이콘만일 때 aria-label 필수)
> - raw `<button>` 회귀 차단: `npm run check:no-raw-button` (PR-2.M)

## 3. 상태 뱃지

> _기둥 3 PR 시리즈에서 채워질 섹션. 결정된 헌장:_
> - 단일 `StatusBadge` + tone 5종 (`neutral` / `info` / `positive` / `warning` / `negative`)
> - 도메인별 status map (TS `Record<Status, { label; tone }>`)
> - 폐기 대상: `common/StatusBadge`, `common/StatusPill`, `inbound/InboundStatusBadge`, `outbound/InvoiceStatusBadge`, `outbound/OutboundStatusBadge`, `orders/OrderStatusBadge` (PR-3.8)

## 4. 테이블

> _기둥 4 PR 시리즈에서 채워질 섹션. 결정된 헌장:_
> - 단일 `DataTable` v2 (react-table 기반, 컴포지션 슬롯)
> - 표준 동작: sticky header / 정렬 / 페이지네이션 / 컬럼 가시성 / 로딩 skeleton / EmptyState / ErrorState
> - URL state: `?sort=field:desc&page=N&size=50&...`
> - 도메인별 List 6종 흡수: PO / TT / LC / BL / Outbound / Order

## 5. 필터

> _기둥 5 PR 시리즈에서 채워질 섹션. 결정된 헌장:_
> - `FilterBar` + 4 프리미티브 (`Search` / `Select` / `MultiSelect` / `DateRange`)
> - URL state via React Router 7 `useSearchParams` (외부 lib 없음, zod 스키마로 타입 안전)
> - 활성 필터 카운트 + `ClearAll`
> - `DataTable.Toolbar` 슬롯에 얹힘
