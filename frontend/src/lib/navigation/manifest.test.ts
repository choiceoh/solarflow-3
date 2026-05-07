import { describe, it, expect } from 'vitest';
import { isItemVisible, NAV_GROUPS, type CommandNavItem } from './manifest';

// 가짜 NAV item 빌더 — 테스트 전용.
function makeItem(overrides: Partial<CommandNavItem>): CommandNavItem {
  return {
    key: 't', label: 't', abbr: 't', path: '/t',
    // icon 은 visibility 로직과 무관해 빈 함수 캐스팅으로 채움.
    icon: (() => null) as unknown as CommandNavItem['icon'],
    menu: 'inventory',
    ...overrides,
  };
}

describe('isItemVisible — feature 매핑된 항목', () => {
  it('enabled_features 가 feature 를 포함하면 보임', () => {
    const item = makeItem({ feature: 'tx.po' });
    expect(isItemVisible(item, 'topsolar', new Set(['tx.po', 'tx.lc']))).toBe(true);
  });

  it('enabled_features 에 없으면 안 보임 — tenants 가 같이 있어도 무시', () => {
    const item = makeItem({ feature: 'tx.po', tenants: ['topsolar'] });
    expect(isItemVisible(item, 'topsolar', new Set(['tx.lc']))).toBe(false);
  });

  it('enabled_features 가 undefined 면 tenants 배열로 fallback (옛 응답 호환)', () => {
    const item = makeItem({ feature: 'tx.po', tenants: ['topsolar'] });
    expect(isItemVisible(item, 'topsolar', undefined)).toBe(true);
    expect(isItemVisible(item, 'baro', undefined)).toBe(false);
  });
});

describe('isItemVisible — feature 없는 항목 (fallback)', () => {
  it('tenants 미지정 = 모든 테넌트 공통', () => {
    const item = makeItem({});
    expect(isItemVisible(item, 'topsolar', new Set())).toBe(true);
    expect(isItemVisible(item, 'baro', new Set())).toBe(true);
  });

  it('tenants 가 현재 테넌트 포함하면 보임', () => {
    const item = makeItem({ tenants: ['baro'] });
    expect(isItemVisible(item, 'baro', new Set())).toBe(true);
  });

  it('tenants 가 현재 테넌트 미포함하면 안 보임 — enabled_features 와 무관', () => {
    const item = makeItem({ tenants: ['baro'] });
    expect(isItemVisible(item, 'topsolar', new Set(['tx.po']))).toBe(false);
  });
});

describe('NAV_GROUPS — 매핑 무결성', () => {
  it('각 항목은 feature 또는 tenants 중 최소 하나를 갖거나 모든 테넌트 공통', () => {
    // 정합성 sanity — 항목 형태가 의도대로인지만 확인. 빈 항목 / 잘못된 키 방지.
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.key).toBeTruthy();
        expect(item.path).toBeTruthy();
        expect(item.label).toBeTruthy();
      }
    }
  });

  it('feature 있는 항목은 module/baro 도메인 표시 키 포함 (회귀 sanity)', () => {
    const allFeatures = NAV_GROUPS.flatMap((g) => g.items)
      .map((i) => i.feature)
      .filter(Boolean);
    expect(allFeatures).toContain('tx.po');
    expect(allFeatures).toContain('baro.incoming');
    expect(allFeatures).toContain('intercompany.request.inbox');
  });
});
