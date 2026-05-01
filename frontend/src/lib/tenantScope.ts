// D-108: 단일 코드/DB로 탑솔라/바로 두 앱을 운영하기 위한 호스트네임 기반 테넌트 분기
//
// 같은 React 빌드(dist/)가 두 호스트에서 서빙된다:
//   - 탑솔라:    solarflow3.com / 100.123.70.19:5173 / localhost
//   - 바로(주):  baro.topworks.ltd
//
// 이 모듈은 window.location.hostname을 보고 BARO 모드 여부를 결정한다.
// 백엔드는 user_profiles.tenant_scope으로 격리를 강제하므로,
// 이 함수는 UI 노출 제어용이지 보안 경계가 아니다(보안은 서버에서 RequireTenantScope).

export type TenantScope = 'topsolar' | 'baro';

const BARO_HOST_PATTERNS: Array<RegExp | string> = [
  /^baro\./i,
  /^baro-/i,
];

export function detectTenantScope(hostname: string = window.location.hostname): TenantScope {
  for (const pattern of BARO_HOST_PATTERNS) {
    if (typeof pattern === 'string') {
      if (hostname === pattern) return 'baro';
    } else if (pattern.test(hostname)) {
      return 'baro';
    }
  }
  return 'topsolar';
}

export function isBaroMode(): boolean {
  return detectTenantScope() === 'baro';
}
