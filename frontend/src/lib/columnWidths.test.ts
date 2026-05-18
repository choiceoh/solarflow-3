import { describe, it, expect, beforeEach } from 'bun:test';
import { COLWIDTH_PREFIX, loadColumnSizing, saveColumnSizing } from './columnWidths';

const SCOPE = 'test-widths';

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('loadColumnSizing — 사용자/운영자 키 단위 머지', () => {
  it('사용자 localStorage 가 없으면 fallback 전체 반환', () => {
    expect(loadColumnSizing(SCOPE, { a: 100, b: 150 })).toEqual({ a: 100, b: 150 });
  });

  it('사용자가 일부 컬럼만 설정했을 때, 사용자 값 + 운영자 default(나머지) 머지', () => {
    saveColumnSizing(SCOPE, { a: 200 });
    expect(loadColumnSizing(SCOPE, { a: 100, b: 150 })).toEqual({ a: 200, b: 150 });
  });

  it('사용자가 모든 컬럼을 설정했으면 사용자 값이 우선', () => {
    saveColumnSizing(SCOPE, { a: 200, b: 250 });
    expect(loadColumnSizing(SCOPE, { a: 100, b: 150 })).toEqual({ a: 200, b: 250 });
  });

  it('숫자가 아닌 값은 통과 안 함 (fallback/사용자 양쪽)', () => {
    localStorage.setItem(COLWIDTH_PREFIX + SCOPE, JSON.stringify({ a: 'abc', b: 200 }));
    expect(loadColumnSizing(SCOPE, { a: 100, c: -5, d: 0 })).toEqual({ a: 100, b: 200 });
  });

  it('손상된 JSON 이면 fallback 으로 안전 폴백', () => {
    localStorage.setItem(COLWIDTH_PREFIX + SCOPE, 'oops');
    expect(loadColumnSizing(SCOPE, { a: 100 })).toEqual({ a: 100 });
  });

  it('fallback 도 사용자 값도 없으면 빈 객체', () => {
    expect(loadColumnSizing(SCOPE)).toEqual({});
  });
});
