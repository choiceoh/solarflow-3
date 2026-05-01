import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectTenantScope } from './tenantScope';

// D-108: 호스트네임으로 BARO 모드를 결정한다.
describe('detectTenantScope', () => {
  it('baro.topworks.ltd는 baro로 분기', () => {
    expect(detectTenantScope('baro.topworks.ltd')).toBe('baro');
  });

  it('baro-stage 같은 변종 호스트도 baro로 분기', () => {
    expect(detectTenantScope('baro-stage.topworks.ltd')).toBe('baro');
  });

  it('탑솔라 운영 도메인은 topsolar', () => {
    expect(detectTenantScope('solarflow3.com')).toBe('topsolar');
  });

  it('localhost는 topsolar 기본값', () => {
    expect(detectTenantScope('localhost')).toBe('topsolar');
  });

  it('Tailscale IP는 topsolar', () => {
    expect(detectTenantScope('100.123.70.19')).toBe('topsolar');
  });
});

// BARO 모드는 메뉴 가시성/mock 프로필 외에는 어떤 시각 분기도 만들지 않는다.
// 디자인은 기본 페이지(탑솔라)와 동일하게 유지 — 이 가드가 신규 사용처를 막는다.
// 새로운 비-디자인 분기가 정당하다면 ALLOWLIST에 명시적으로 추가하고 PR 리뷰에서 합의.
describe('tenantScope 사용처 가드', () => {
  const ALLOWLIST = new Set([
    'lib/tenantScope.ts',
    'lib/tenantScope.test.ts',
    'lib/devMockMode.ts',
    'components/layout/Sidebar.tsx',
    // BARO Phase 1: 빠른 재발주 카드 (#105) — 거래처 필터 시 최근 5건 노출
    'pages/OrdersPage.tsx',
    // BARO Phase 1: 단가 자동 채움 (#105) — 거래처+품목 선택 시 partner_price_book 조회
    'components/orders/OrderForm.tsx',
  ]);

  function* walk(dir: string): Generator<string> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* walk(full);
      else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) yield full;
    }
  }

  it('isBaroMode/detectTenantScope는 허용된 파일에서만 참조된다', () => {
    const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const violations: string[] = [];
    for (const file of walk(srcRoot)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!/\b(isBaroMode|detectTenantScope)\b/.test(content)) continue;
      const rel = path.relative(srcRoot, file).replace(/\\/g, '/');
      if (!ALLOWLIST.has(rel)) violations.push(rel);
    }
    expect(violations).toEqual([]);
  });
});
