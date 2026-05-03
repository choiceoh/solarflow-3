import { describe, it, expect } from 'vitest';
import { detectTenantScope } from './tenantScope';

// D-108: 호스트네임으로 BARO 모드를 결정한다.
describe('detectTenantScope', () => {
  it('baro.topworks.ltd는 baro로 분기', () => {
    expect(detectTenantScope('baro.topworks.ltd')).toBe('baro');
  });

  it('baro-stage 같은 변종 호스트도 baro로 분기', () => {
    expect(detectTenantScope('baro-stage.topworks.ltd')).toBe('baro');
  });

  it('cable.topworks.ltd는 cable로 분기', () => {
    expect(detectTenantScope('cable.topworks.ltd')).toBe('cable');
  });

  it('cable-stage 같은 변종 호스트도 cable로 분기', () => {
    expect(detectTenantScope('cable-stage.topworks.ltd')).toBe('cable');
  });

  it('탑솔라 운영 도메인은 topsolar', () => {
    expect(detectTenantScope('module.topworks.ltd')).toBe('topsolar');
    expect(detectTenantScope('solarflow3.com')).toBe('topsolar');
  });

  it('localhost는 topsolar 기본값', () => {
    expect(detectTenantScope('localhost')).toBe('topsolar');
  });

  it('Tailscale IP는 topsolar', () => {
    expect(detectTenantScope('100.123.70.19')).toBe('topsolar');
  });
});
