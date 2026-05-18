import { describe, it, expect, beforeEach } from 'bun:test';
import { COLORDER_PREFIX, loadOrder, resolveOrder, saveOrder } from './columnOrder';

const SCOPE = 'test-order';

beforeEach(() => {
  // 테스트마다 localStorage 격리.
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('loadOrder — 개인 > 운영자 우선순위', () => {
  it('사용자 localStorage 가 있으면 그 값을 그대로 반환 (fallback 무시)', () => {
    saveOrder(SCOPE, ['b', 'a', 'c']);
    expect(loadOrder(SCOPE, ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('사용자 localStorage 가 비어 있으면 fallback 적용', () => {
    expect(loadOrder(SCOPE, ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('사용자 localStorage 도 fallback 도 없으면 빈 배열', () => {
    expect(loadOrder(SCOPE)).toEqual([]);
  });

  it('localStorage 가 빈 배열이면 fallback 적용 (저장 함수가 비우면 키 제거하므로 정상적으로 발생하지 않지만 방어)', () => {
    localStorage.setItem(COLORDER_PREFIX + SCOPE, '[]');
    expect(loadOrder(SCOPE, ['x', 'y'])).toEqual(['x', 'y']);
  });

  it('localStorage 가 손상돼 있으면 fallback 으로 안전하게 폴백', () => {
    localStorage.setItem(COLORDER_PREFIX + SCOPE, 'not-json');
    expect(loadOrder(SCOPE, ['x'])).toEqual(['x']);
  });
});

describe('resolveOrder — user × default 컬럼 머지', () => {
  it('user order 가 모든 default 컬럼을 포함하면 user 순서 유지', () => {
    expect(resolveOrder(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  it('default 에 새 컬럼이 추가되면 user 순서 뒤에 자동 추가', () => {
    expect(resolveOrder(['b', 'a'], ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('user 에 있지만 default 에 없는 컬럼은 무시', () => {
    expect(resolveOrder(['z', 'a'], ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('user 가 빈 배열이면 default 그대로', () => {
    expect(resolveOrder([], ['a', 'b'])).toEqual(['a', 'b']);
  });
});
