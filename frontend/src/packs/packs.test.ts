import { describe, it, expect } from 'bun:test';
import { ALL_PACKS, buildNavGroups, ERP_CORE_PACK, MODULE_FINANCE_PACK, BARO_DOMAIN_PACK, STUDY_DOMAIN_PACK } from './index';
import { NAV_GROUPS } from '@/lib/navigation/manifest';

describe('ALL_PACKS — 정합성', () => {
  it('정의된 pack 4개', () => {
    expect(ALL_PACKS).toHaveLength(4);
    expect(ALL_PACKS).toContain(ERP_CORE_PACK);
    expect(ALL_PACKS).toContain(MODULE_FINANCE_PACK);
    expect(ALL_PACKS).toContain(BARO_DOMAIN_PACK);
    expect(ALL_PACKS).toContain(STUDY_DOMAIN_PACK);
  });

  it('각 pack 은 비어 있지 않은 navItems 를 가진다', () => {
    for (const pack of ALL_PACKS) {
      expect(pack.navItems.length).toBeGreaterThan(0);
      expect(pack.id).toBeTruthy();
      expect(pack.label).toBeTruthy();
      expect(pack.description).toBeTruthy();
    }
  });

  it('pack 간 NAV item key 충돌이 없다', () => {
    const seen = new Map<string, string>();
    for (const pack of ALL_PACKS) {
      for (const item of pack.navItems) {
        const prev = seen.get(item.key);
        if (prev) {
          throw new Error(`key 충돌: ${item.key} 이 ${prev} 와 ${pack.id} 양쪽에 등록됨`);
        }
        seen.set(item.key, pack.id);
      }
    }
  });

  it('각 NAV item 은 group 필드를 갖는다 (PR-4)', () => {
    for (const pack of ALL_PACKS) {
      for (const item of pack.navItems) {
        expect(item.group).toMatch(/^(home|구매|판매|현황|도구)$/);
      }
    }
  });
});

describe('buildNavGroups — 사이드바 그룹 구성', () => {
  it('그룹 순서가 home / 구매 / 판매 / 현황 / 도구', () => {
    const labels = NAV_GROUPS.map((g) => g.label);
    // 첫 그룹은 home (라벨 없음)
    expect(labels[0]).toBeUndefined();
    expect(labels.slice(1)).toEqual(['구매', '판매', '현황', '도구']);
  });

  it('빈 그룹은 출력에서 제외된다', () => {
    // 가짜 pack 한 개만 (도구 그룹) 으로 빌드
    const groups = buildNavGroups([
      {
        id: 'erp-core' as const,
        label: 't',
        description: 't',
        navItems: ERP_CORE_PACK.navItems.filter((i) => i.group === '도구'),
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('도구');
  });

  it('NAV_GROUPS 는 ALL_PACKS 의 모든 NAV item 을 포함한다 (sanity)', () => {
    const allKeys = new Set(ALL_PACKS.flatMap((p) => p.navItems.map((i) => i.key)));
    const groupKeys = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key)));
    expect(groupKeys).toEqual(allKeys);
  });

  it('회귀 sanity — 핵심 메뉴 키들이 사이드바에 존재', () => {
    const keys = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key)));
    for (const expected of ['inventory', 'orders', 'po', 'lc', 'baro-home', 'baro-rfm', 'study-learning', 'settings']) {
      expect(keys).toContain(expected);
    }
  });
});
