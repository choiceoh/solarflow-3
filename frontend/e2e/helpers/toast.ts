import { type Page, expect } from '@playwright/test';

/**
 * 토스트 등장을 검증하는 e2e 헬퍼.
 * sonner 가 `[data-sonner-toast]` 로 모든 토스트를 마킹한다.
 *
 * 사용 예:
 *   await page.getByRole('button', { name: '저장' }).click();
 *   await expectToast(page, '저장되었습니다');
 */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]', { hasText: text })).toBeVisible();
}
