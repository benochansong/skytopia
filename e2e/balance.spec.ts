import { test, expect } from '@playwright/test';

test('grouped menu, large text, contrast and bilingual preferences stay reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '새 캠페인', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '도시 운영 실험실' })).not.toBeVisible();
  await page.locator('summary').filter({ hasText: '실험실 · 구조와 도시' }).click();
  await expect(page.getByRole('button', { name: '도시 운영 실험실' })).toBeVisible();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByLabel('글자 크기', { exact: true }).selectOption('1.3');
  await page.getByLabel('높은 대비', { exact: true }).check();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/high-contrast/);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByLabel('글자 크기', { exact: true })).toHaveValue('1.3');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '한국어 / EN', exact: true }).click();
  await page.getByRole('button', { name: 'Free build', exact: true }).scrollIntoViewIfNeeded();
  const size = await page.getByRole('button', { name: 'Free build', exact: true }).boundingBox();
  expect(size!.width).toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/phase11-menu-large.png' });
});

test('first building guide hides and replays without gating construction', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새로운 게임', exact: true }).click();
  const guide = page.getByRole('complementary', { name: '첫 건설 안내' });
  await expect(guide).toBeVisible();
  await page.getByRole('button', { name: '시점 복귀', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__SKYTOPIA_PERF__?.drawCalls ?? 0), { timeout: 20000 })
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/phase11-guide.png' });
  await guide.getByRole('button', { name: '안내 접기' }).click();
  await expect(guide.getByRole('button', { name: '안내 다시 보기' })).toBeVisible();
  await guide.getByRole('button', { name: '안내 다시 보기' }).click();
  await expect(guide.getByText('첫 10분 · 다음 한 걸음')).toBeVisible();
  await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().setScreen('paused'));
  await expect(guide).not.toBeVisible();
});

test('city recovery shows real availability and population causes', async ({ page }) => {
  await page.goto('/');
  await page.locator('summary').filter({ hasText: '실험실 · 구조와 도시' }).click();
  await page.getByRole('button', { name: '도시 운영 실험실' }).click();
  await page.getByRole('button', { name: '새 실험 시작' }).click();
  await page.getByRole('button', { name: '도시 운영 ↗', exact: true }).click();
  await expect(page.getByText(/인구 추세:/)).toBeVisible();
  await page.getByRole('button', { name: '주문·긴급 지원', exact: true }).click();
  await expect(page.getByRole('button', { name: /유한 구호금/ })).toBeDisabled();
  await expect(page.getByText('크레딧 100 미만일 때 가능합니다')).toBeVisible();
  await page.screenshot({ path: 'test-results/phase11-recovery.png' });
});
