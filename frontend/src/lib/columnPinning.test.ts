import { describe, it, expect, beforeEach } from 'bun:test';
import { COLPIN_PREFIX, loadPinning, savePinning } from './columnPinning';

const SCOPE = 'test-pinning';

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('loadPinning — 개인 > 운영자 우선순위', () => {
  it('사용자 localStorage 가 있으면 그 값 반환', () => {
    savePinning(SCOPE, { left: ['a'], right: ['z'] });
    expect(loadPinning(SCOPE, { left: ['b'], right: [] })).toEqual({
      left: ['a'],
      right: ['z'],
    });
  });

  it('사용자가 없으면 fallback 적용', () => {
    expect(loadPinning(SCOPE, { left: ['b'], right: ['c'] })).toEqual({
      left: ['b'],
      right: ['c'],
    });
  });

  it('사용자 localStorage 가 빈 pinning 이면 fallback (저장 함수가 비우면 키 제거하므로 일반 케이스 아님)', () => {
    localStorage.setItem(COLPIN_PREFIX + SCOPE, JSON.stringify({ left: [], right: [] }));
    expect(loadPinning(SCOPE, { left: ['b'], right: [] })).toEqual({
      left: ['b'],
      right: [],
    });
  });

  it('손상된 JSON 이면 fallback 으로 안전 폴백', () => {
    localStorage.setItem(COLPIN_PREFIX + SCOPE, 'broken');
    expect(loadPinning(SCOPE, { left: ['a'], right: [] })).toEqual({
      left: ['a'],
      right: [],
    });
  });

  it('fallback 도 없으면 빈 양쪽 배열', () => {
    expect(loadPinning(SCOPE)).toEqual({ left: [], right: [] });
  });
});
