import { defineConfig, devices } from '@playwright/test';

/**
 * SolarFlow E2E 설정.
 *
 * 실행: `npm run test:e2e`
 *  - 자동으로 vite dev 서버를 띄우고(이미 5173 떠있으면 재사용) chromium에서 시나리오 실행.
 *  - smoke 시나리오 = 핵심 화면이 JS 에러 없이 렌더링되는지 검증 (자세한 흐름은 후속 PR).
 *
 * 멀티 테넌트(module.* / cable.* / baro.*) 분기는 hostname 기반이라 로컬에서 직접 검증하기 어려움.
 *  → 후속 PR에서 hosts 파일 / 헤더 주입 / Caddy 라우팅으로 확장 예정.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
