import { test, expect } from '@playwright/test';

/**
 * Smoke 테스트 — "앱이 켜지긴 하는가" 수준의 최소 회귀 안전망.
 *
 * 합격 기준:
 *  - 페이지가 200으로 응답
 *  - 콘솔에 에러 없음 (auth 401 같은 예상 가능한 네트워크 에러는 제외)
 *  - 로그인 폼의 기본 요소가 보임
 *
 * 인증·테넌트 분기·핵심 화면별 시나리오는 별도 PR로 단계 확장.
 */

const ALLOWED_CONSOLE_PATTERNS = [
  /401/, // 비로그인 상태 API 호출
  /Failed to load resource/, // CORS/오프라인 백엔드 호출
  /supabase/i, // Supabase init 경고
];

function isAllowedConsoleError(text: string) {
  return ALLOWED_CONSOLE_PATTERNS.some((re) => re.test(text));
}

test.describe('smoke', () => {
  test('루트 진입 시 로그인 화면이 표시된다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isAllowedConsoleError(msg.text())) {
        errors.push(`console.error: ${msg.text()}`);
      }
    });

    const response = await page.goto('/');
    expect(response?.status(), 'HTTP 200 OK').toBeLessThan(400);

    // 로그인 페이지로 리다이렉트 또는 로그인 폼 직접 노출 — 둘 중 하나는 만족
    await expect(page).toHaveURL(/login|\/$/, { timeout: 10_000 });

    // 패닉이나 white-screen 회귀 잡기 — 본문에 가시 텍스트가 있어야 함
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length, '본문 비어있지 않음').toBeGreaterThan(0);

    expect(errors, '예상치 못한 JS 에러 없음').toEqual([]);
  });

  test('/login 직접 접근 시 핵심 입력 필드가 렌더된다', async ({ page }) => {
    await page.goto('/login');
    // 이메일·비밀번호 필드 — placeholder/label/type 어느 쪽으로든 잡히게 유연하게
    const inputs = page.locator('input');
    await expect(inputs.first()).toBeVisible({ timeout: 10_000 });
    expect(await inputs.count(), '입력 필드 최소 1개 이상').toBeGreaterThan(0);
  });
});
