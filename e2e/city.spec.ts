import { test, expect } from '@playwright/test';
test('City Lab operations, overlays, upgrade, time, night and separate save', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '도시 운영 실험실' }).click();
  await page.getByRole('button', { name: '새 실험 시작' }).click();
  await page.getByRole('button', { name: '도시 운영 ↗', exact: true }).click();
  await page.getByLabel('실험 예제').selectOption('C');
  await expect(page.getByRole('heading', { name: '살아있는 도시' })).toBeVisible();
  await page.getByRole('button', { name: '시설 운영', exact: true }).click();
  await page.getByRole('button', { name: /기본 창고 #/ }).click();
  await page.getByRole('button', { name: '가동 중지', exact: true }).click();
  await expect(page.getByRole('button', { name: '가동 시작', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '가동 시작', exact: true }).click();
  await page.getByRole('button', { name: /^업그레이드 \(Lv.2\)/ }).click();
  expect(
    await page.evaluate(
      () =>
        window.__SKYTOPIA_TEST__!.getState().game.buildings.find((b) => b.kind === 'warehouse')
          ?.level,
    ),
  ).toBe(1);
  await page.getByRole('button', { name: '낮 / 밤 전환' }).click();
  await page.screenshot({ path: 'test-results/phase3-operations.png' });
  await page.getByRole('button', { name: '주문·긴급 지원' }).click();
  await page.getByRole('button', { name: /^주문 ·/ }).click();
  expect(
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.city.orders.length),
  ).toBe(1);
  await page.keyboard.press('Escape');
  for (const mode of ['power', 'food', 'happiness', 'logistics', 'economy'])
    await page.getByRole('combobox', { name: '구조 분석' }).selectOption(mode);
  await page.getByRole('button', { name: '3×', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.elapsed))
    .toBeGreaterThan(2);
  await page.getByRole('button', { name: 'Ⅱ', exact: true }).click();
  const time = await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.elapsed);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.elapsed)).toBe(time);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('skytopia.city.v3')!));
  expect(saved.version).toBe(3);
  expect(saved.city.speed).toBe(0);
  await page.screenshot({ path: 'test-results/phase3-night.png' });
  await page.reload();
  await page.getByRole('button', { name: '도시 운영 실험실' }).click();
  await page.getByRole('button', { name: '실험 불러오기' }).click();
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.city)).toEqual(
    saved.city,
  );
  expect(errors).toEqual([]);
});
test('campaign lists new missions and shows separate Living City economy', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '캠페인 선택' }).click();
  await page.getByRole('button', { name: /MISSION 05/ }).click();
  await expect(page.getByRole('heading', { name: '첫 번째 수확' })).toBeVisible();
  await expect(page.getByLabel('도시 자원')).toBeVisible();
  await page.getByRole('button', { name: 'Ⅱ', exact: true }).click();
  await page.getByRole('button', { name: '도시 운영 ↗', exact: true }).click();
  await page.screenshot({ path: 'test-results/phase3-overview.png' });
});
