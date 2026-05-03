/**
 * 어시스턴트 빈 상태 — suggestion chip 정의.
 *
 * 두 종류:
 *  - 공통 chip: 모든 화면에서 항상 표시 (현재 화면 컨텍스트 강조).
 *  - 페이지별 chip: pathname 매핑 시 추가 표시. 미정의 화면은 공통 chip 만.
 *
 * 클릭 동작 = 입력창 채우기만 (자동 전송 X) — 사용자가 PO 번호 등 가변 부분을 다듬어 보낼 여지.
 *
 * 페이지 라벨도 함께 — KNOWN_CONFIGS 에 없는 비메타 페이지(/procurement, /inventory 등)도 라벨 제공.
 */

export interface ChipDef {
  /** chip 본문 — 입력창에 그대로 채워짐 */
  text: string;
  /** 시각 hint (선택) — 1글자 이모지 권장 */
  icon?: string;
}

export const COMMON_CHIPS: ChipDef[] = [
  { text: '이 화면 요약해줘', icon: '📊' },
  { text: '이 화면 어떻게 사용해?', icon: '🛠️' },
];

interface PageEntry {
  label: string;
  chips: ChipDef[];
}

/**
 * pathname → { label, chips } 매핑.
 * pathname 매칭은 정확 일치 → startsWith fallback.
 */
const PAGE_MAP: Record<string, PageEntry> = {
  '/procurement': {
    label: 'P/O 발주',
    chips: [
      { text: '진행 중 PO 보여줘', icon: '📋' },
      { text: '최근 30일 단가 변동 요약', icon: '📈' },
    ],
  },
  '/inventory': {
    label: '가용재고',
    chips: [
      { text: '이 화면 재고 부족 품목 알려줘', icon: '⚠️' },
      { text: '제조사별 재고 합계', icon: '🏭' },
    ],
  },
  '/orders': {
    label: '수주 관리',
    chips: [
      { text: '이번 달 신규 수주 보여줘', icon: '🆕' },
      { text: '진행 중 수주 합계', icon: '📦' },
    ],
  },
  '/outbound-v2': {
    label: '출고/판매',
    chips: [
      { text: '이번 주 출고 예정', icon: '🚚' },
      { text: '미수금 출고 건', icon: '💰' },
    ],
  },
  '/lc': {
    label: 'L/C 개설',
    chips: [
      { text: '진행 중 L/C 보여줘', icon: '🏦' },
      { text: 'L/C 한도 잔여', icon: '📏' },
    ],
  },
  '/inbound': {
    label: 'B/L 입고',
    chips: [
      { text: '도착 예정 B/L', icon: '🚢' },
      { text: '미입고 B/L 알려줘', icon: '⏳' },
    ],
  },
  '/customs': {
    label: '면장/원가',
    chips: [
      { text: '면장 PDF 첨부 → 등록', icon: '📎' },
      { text: '이 면장 원가 계산', icon: '🧮' },
    ],
  },
  '/banking': {
    label: '수금 관리',
    chips: [
      { text: '미수금 목록', icon: '💸' },
      { text: '이번 주 입금 요약', icon: '🗓️' },
    ],
  },
  '/sales-analysis': {
    label: '매출 분석',
    chips: [
      { text: '이번 달 매출 요약', icon: '💹' },
      { text: '거래처별 매출 TOP 5', icon: '🏆' },
    ],
  },
  '/masters/partners-v2': {
    label: '거래처 마스터',
    chips: [
      { text: '거래처 추가', icon: '➕' },
      { text: '중복 거래처 찾아줘', icon: '🔍' },
    ],
  },
};

export interface PageChipsResult {
  /** 페이지 라벨 — 매핑 없으면 undefined */
  label?: string;
  /** 공통 + 페이지별 chip 합본 — 항상 최소 2개 (공통) */
  chips: ChipDef[];
}

// /assistant 풀 페이지 — 화면 컨텍스트 없는 환경 (page_context 비전송)
//   → "이 화면" 류 chip 대신 글로벌 작업용 chip set 으로 대체.
const ASSISTANT_PAGE_CHIPS: ChipDef[] = [
  { text: '거래처 한화 검색', icon: '🔍' },
  { text: '최근 PO 5건 보여줘', icon: '📋' },
  { text: '면장 PDF 첨부해서 OCR', icon: '📎' },
];

export function getPageChips(pathname: string): PageChipsResult {
  if (pathname === '/assistant') {
    return { chips: ASSISTANT_PAGE_CHIPS };
  }
  const exact = PAGE_MAP[pathname];
  if (exact) {
    return { label: exact.label, chips: [...COMMON_CHIPS, ...exact.chips] };
  }
  // prefix fallback — /baro/*, /settings/* 등 nested 라우트
  for (const [prefix, entry] of Object.entries(PAGE_MAP)) {
    if (pathname.startsWith(prefix + '/')) {
      return { label: entry.label, chips: [...COMMON_CHIPS, ...entry.chips] };
    }
  }
  return { chips: COMMON_CHIPS };
}
