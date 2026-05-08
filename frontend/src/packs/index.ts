// frontend/src/packs/index.ts — pack 들의 단일 진입점 (PR-4 / PR-7)
//
// 새 pack 을 추가할 때:
//   1. packs/<id>/{nav.ts, pages/} 신설
//   2. ALL_PACKS 에 import + 추가
//   3. types.ts 의 PackID union 에 ID 추가
//
// PR-7 부터 pack 디렉토리 자체가 자기 페이지 코드 (pages/) 도 포함.

import type { CommandNavGroup, CommandNavItem } from '@/lib/navigation/manifest';
import { ERP_CORE_PACK } from './erp-core/nav';
import { MODULE_FINANCE_PACK } from './module-finance/nav';
import { BARO_DOMAIN_PACK } from './baro-domain/nav';
import { STUDY_DOMAIN_PACK } from './study-domain/nav';
import type { NavGroupKey, Pack } from './types';

export { ERP_CORE_PACK, MODULE_FINANCE_PACK, BARO_DOMAIN_PACK, STUDY_DOMAIN_PACK };
export type { Pack, PackID, PackNavItem, NavGroupKey } from './types';

/**
 * ALL_PACKS — 정의된 모든 pack. 순서가 admin UI 표시 순서로 흐른다.
 *
 * NAV_GROUPS 빌드 / pack 별 토글 / 테스트 등 모든 호출은 이 array 를 source of truth 로.
 */
export const ALL_PACKS: readonly Pack[] = [
  ERP_CORE_PACK,
  MODULE_FINANCE_PACK,
  BARO_DOMAIN_PACK,
  STUDY_DOMAIN_PACK,
];

// === Sidebar group 빌더 ===

/**
 * NAV_GROUP_ORDER — 사이드바 위→아래 그룹 순서.
 *
 * 'home' 은 라벨 없는 진입 그룹. 나머지는 라벨 그대로.
 */
const NAV_GROUP_ORDER: NavGroupKey[] = ['home', '구매', '판매', '현황', '도구'];

/**
 * buildNavGroups — pack 들의 NAV items 를 합쳐 사이드바 그룹 구조로 변환.
 *
 * 동일 키 충돌은 첫 등록 pack 우선 (ALL_PACKS 순서). 충돌 자체는 테스트로 잡는다.
 */
export function buildNavGroups(packs: readonly Pack[] = ALL_PACKS): CommandNavGroup[] {
  const seen = new Set<string>();
  const byGroup = new Map<NavGroupKey, CommandNavItem[]>();
  for (const pack of packs) {
    for (const item of pack.navItems) {
      if (seen.has(item.key)) continue; // 정의상 발생하면 안 되지만 방어 — 테스트가 잡음.
      seen.add(item.key);
      const list = byGroup.get(item.group) ?? [];
      list.push(item);
      byGroup.set(item.group, list);
    }
  }
  const out: CommandNavGroup[] = [];
  for (const g of NAV_GROUP_ORDER) {
    const items = byGroup.get(g);
    if (!items || items.length === 0) continue;
    out.push({ label: g === 'home' ? undefined : g, items });
  }
  return out;
}
