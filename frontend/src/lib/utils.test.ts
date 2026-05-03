import { describe, it, expect } from 'vitest';
import { formatKRW, formatKw, formatCapacity } from './utils';
import type { UserPreferences } from '@/types/models';

const auto: UserPreferences = { amount_unit: 'auto', capacity_unit: 'auto', show_ea: true };
const won: UserPreferences = { ...auto, amount_unit: 'won' };
const thousand: UserPreferences = { ...auto, amount_unit: 'thousand' };
const manwon: UserPreferences = { ...auto, amount_unit: 'manwon' };
const million: UserPreferences = { ...auto, amount_unit: 'million' };
const eok: UserPreferences = { ...auto, amount_unit: 'eok' };
const kwOnly: UserPreferences = { ...auto, capacity_unit: 'kw' };
const mwOnly: UserPreferences = { ...auto, capacity_unit: 'mw' };
const noEA: UserPreferences = { ...auto, show_ea: false };

describe('formatKRW (자동 모드 임계값 — Q8: 1만/1억 경계)', () => {
  it('1만 미만은 원 단위', () => {
    expect(formatKRW(5000, auto)).toBe('5,000원');
    expect(formatKRW(9999, auto)).toBe('9,999원');
  });

  it('1만 ~ 1억은 만원 단위 (소수점 1자리)', () => {
    expect(formatKRW(10_000, auto)).toBe('1.0만원');
    expect(formatKRW(12_345_678, auto)).toBe('1,234.6만원');
  });

  it('1억 이상은 억원 단위 (소수점 1자리)', () => {
    expect(formatKRW(100_000_000, auto)).toBe('1.0억원');
    expect(formatKRW(150_000_000, auto)).toBe('1.5억원');
  });

  it('음수 부호 유지', () => {
    expect(formatKRW(-1_234_567, auto)).toBe('-123.5만원');
  });

  it('undefined/NaN은 — 로 표시 (null은 0으로 취급 — 원래 동작)', () => {
    expect(formatKRW(undefined, auto)).toBe('—');
    expect(formatKRW(NaN, auto)).toBe('—');
    expect(formatKRW(null, auto)).toBe('0원'); // Number(null)=0, 호환성 유지
  });
});

describe('formatKRW (수동 단위 + Q11 fallback)', () => {
  it('수동 단위 그대로 적용', () => {
    expect(formatKRW(12_345_678, won)).toBe('12,345,678원');
    expect(formatKRW(12_345_678, thousand)).toBe('12,345.7천원');
    expect(formatKRW(12_345_678, manwon)).toBe('1,234.6만원');
    expect(formatKRW(12_345_678, million)).toBe('12.3백만원');
    expect(formatKRW(12_345_678, eok)).toBe('0.1억원');
  });

  it('백만원 선택 + 5,000원 → 강등 fallback (작은 값 0백만원 방지)', () => {
    // 5,000원 / 1,000,000 = 0.005 < 0.1 → million 강등
    // 5,000원 / 10,000 = 0.5 ≥ 0.1 → manwon 사용
    expect(formatKRW(5_000, million)).toBe('0.5만원');
  });

  it('억원 선택 + 1만원 → 다단계 강등', () => {
    // 1만원 / 1억 = 0.0001 < 0.1 → eok 강등
    // 1만원 / 1백만 = 0.01 < 0.1 → million 강등
    // 1만원 / 1만 = 1.0 ≥ 0.1 → manwon 사용
    expect(formatKRW(10_000, eok)).toBe('1.0만원');
  });

  it('억원 선택 + 5,000원 → manwon까지만 강등 (0.5 ≥ 0.1)', () => {
    expect(formatKRW(5_000, eok)).toBe('0.5만원');
  });

  it('억원 선택 + 500원 → 천원까지 강등 (0.5천원)', () => {
    // 500/1e8 < 0.1 → 500/1e6 < 0.1 → 500/1e4 = 0.05 < 0.1 → 500/1000 = 0.5 ≥ 0.1
    expect(formatKRW(500, eok)).toBe('0.5천원');
  });

  it('억원 선택 + 50원 → won까지 강등 (모든 단위 < 0.1)', () => {
    expect(formatKRW(50, eok)).toBe('50원');
  });
});

describe('formatKw (용량 단위)', () => {
  it('auto: 기존 동작 — "X.XMW (X,XXXkW)"', () => {
    expect(formatKw(1_500, auto)).toBe('1.5MW (1,500kW)');
    expect(formatKw(750, auto)).toBe('0.8MW (750kW)');
  });

  it('kw 고정', () => {
    expect(formatKw(1_500, kwOnly)).toBe('1,500kW');
    expect(formatKw(50, kwOnly)).toBe('50kW');
  });

  it('mw 고정 + Q11 fallback (<0.1MW)', () => {
    expect(formatKw(1_500, mwOnly)).toBe('1.5MW');
    expect(formatKw(200, mwOnly)).toBe('0.2MW'); // 0.2 >= 0.1
    expect(formatKw(50, mwOnly)).toBe('50kW'); // 0.05 < 0.1 → kw 강등
  });

  it('undefined/NaN은 —, null은 0kW (원래 동작)', () => {
    expect(formatKw(undefined, auto)).toBe('—');
    expect(formatKw(NaN, auto)).toBe('—');
    expect(formatKw(null, auto)).toBe('0.0MW (0kW)'); // Number(null)=0, 호환성 유지
  });
});

describe('formatCapacity (용량 + EA)', () => {
  it('auto + show_ea: "X.XMW (X,XXXkW / X,XXXEA)"', () => {
    expect(formatCapacity(1_500, 2_500, auto)).toBe('1.5MW (1,500kW / 2,500EA)');
  });

  it('show_ea=false → EA 숨김', () => {
    expect(formatCapacity(1_500, 2_500, noEA)).toBe('1.5MW (1,500kW)');
  });

  it('ea=0 또는 미지정 → EA 숨김', () => {
    expect(formatCapacity(1_500, 0, auto)).toBe('1.5MW (1,500kW)');
    expect(formatCapacity(1_500, undefined, auto)).toBe('1.5MW (1,500kW)');
  });

  it('kw 고정 + EA: "X kW (X EA)"', () => {
    expect(formatCapacity(1_500, 2_500, kwOnly)).toBe('1,500kW (2,500EA)');
  });

  it('mw 고정 + EA + 작은 값(fallback): "X kW (X EA)"', () => {
    // 50kW: mw 강등 → kW + EA
    expect(formatCapacity(50, 100, mwOnly)).toBe('50kW (100EA)');
  });
});
