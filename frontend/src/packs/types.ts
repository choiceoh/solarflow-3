// frontend/src/packs/types.ts — Pack 메타 정의 (PR-4 / PR-7)
//
// Pack — 한 테넌트가 활성화하면 같이 켜지는 NAV 항목 묶음 + (PR-7 부터) 페이지 코드.
// 운영 의도:
//   - 새 도메인 (예: gx10) 을 추가할 때 admin 이 "어떤 pack 들 활성?" 으로 결정
//   - module 수입 흐름이 필요 없는 도메인은 module-finance pack 만 끄면 sidebar 가 적절히 줄어듦
//   - PR-5 admin UI 가 이 메타를 읽어 테넌트별 토글 매트릭스를 보임
//
// PR-7: pack 디렉토리가 자기 페이지 코드 (pages/) 도 가짐 — pack = nav + pages + types + api.
//       baro-domain 만 self-contained 화 시작; erp-core/module-finance pages 는 후속 PR.

import type { CommandNavItem } from '@/lib/navigation/manifest';

export type PackID = 'erp-core' | 'module-finance' | 'baro-domain';

/**
 * NavGroupKey — 사이드바 그룹 정렬 키.
 *
 * 'home' = 라벨 없는 첫 번째 그룹 (영업 홈, 가용재고 등 진입 항목).
 * 나머지는 사이드바에 그대로 표시.
 */
export type NavGroupKey = 'home' | '구매' | '판매' | '현황' | '도구';

export interface Pack {
  id: PackID;
  /** admin UI / docs 에 노출하는 사람-읽는 이름 */
  label: string;
  /** 한 줄 설명 — 어느 도메인 / 어떤 화면 묶음인지 */
  description: string;
  /** 이 pack 에 속한 sidebar 항목들. group 필드로 사이드바 그룹 분류. */
  navItems: PackNavItem[];
}

/** Pack 안의 NAV 항목 — 표준 CommandNavItem + group 필드. */
export type PackNavItem = CommandNavItem & {
  group: NavGroupKey;
};
