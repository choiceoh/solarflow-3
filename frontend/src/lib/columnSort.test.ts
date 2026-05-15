import { describe, it, expect, beforeEach } from 'bun:test';
import { COLSORT_PREFIX, loadSorting, saveSorting } from './columnSort';

const SCOPE = 'test-sort';

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('loadSorting — 개인 > 운영자 우선순위', () => {
  it('사용자 localStorage 가 있으면 그 값 반환', () => {
    saveSorting(SCOPE, [{ id: 'price', desc: true }]);
    expect(loadSorting(SCOPE, [{ id: 'created_at', desc: false }])).toEqual([
      { id: 'price', desc: true },
    ]);
  });

  it('사용자 localStorage 가 비어 있으면 fallback 적용', () => {
    expect(loadSorting(SCOPE, [{ id: 'created_at', desc: false }])).toEqual([
      { id: 'created_at', desc: false },
    ]);
  });

  it('잘못된 모양의 fallback 항목은 걸러냄', () => {
    // @ts-expect-error 의도적 wrong shape
    expect(loadSorting(SCOPE, [{ id: 'a', desc: true }, { id: 1, desc: false }])).toEqual([
      { id: 'a', desc: true },
    ]);
  });

  it('손상된 JSON 이면 fallback 으로 안전 폴백', () => {
    localStorage.setItem(COLSORT_PREFIX + SCOPE, '!!!');
    expect(loadSorting(SCOPE, [{ id: 'x', desc: false }])).toEqual([
      { id: 'x', desc: false },
    ]);
  });
});
