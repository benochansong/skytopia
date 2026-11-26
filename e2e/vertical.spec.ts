import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function workshop(page: Page, label: RegExp) {
  await page.getByRole('button', { name: '입체 공방', exact: true }).click();
  await page.locator('.vertical-catalog').getByRole('button', { name: label }).click();
}
async function place(page: Page, x: number, z: number) {
  await page.evaluate(([x, z]) => window.__SKYTOPIA_TEST__!.getState().aim({ x, z }), [x, z]);
  await page.locator('body').click({ position: { x: 10, y: 880 } });
  await page.keyboard.press('Space');
}
test('vertical workshop builds connected upper housing, switches floors, inspects and restores a separate save', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '수직 건설 실험실', exact: true }).click();
  await expect(page.getByLabel('층 선택')).toBeVisible();
  await place(page, -2, 1);
  await page.getByRole('button', { name: '+1F', exact: true }).click();
  await workshop(page, /^상층 플랫폼/);
  for (const [x, z] of [
    [-2, 1],
    [-1, 1],
    [-2, 2],
    [-1, 2],
  ])
    await place(page, x, z);
  await page.getByRole('button', { name: '0F', exact: true }).click();
  await workshop(page, /^계단/);
  await place(page, -1, 1);
  await workshop(page, /^수직 전력 중계기|^수직 중계기/);
  await place(page, -2, 2);
  await page.getByRole('button', { name: '+1F', exact: true }).click();
  await workshop(page, /^주거시설/);
  await place(page, -1, 2);
  const built = await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game);
  expect(built.platforms.filter((p) => p.y === 1)).toHaveLength(4);
  expect(built.buildings.some((b) => b.kind === 'home' && b.y === 1)).toBe(true);
  await page.getByLabel('층별 보기').selectOption('active');
  await page.locator('body').click({ position: { x: 10, y: 880 } });
  await page.keyboard.press('PageDown');
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.vertical!.floor)).toBe(
    0,
  );
  await page.keyboard.press('PageUp');
  await page.getByLabel('층별 보기').selectOption('all');
  await page.screenshot({ path: 'test-results/phase5-upper-home.png' });
  await page.getByRole('button', { name: '저장', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('skytopia.city.v4'))).toBeNull();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('skytopia.vertical.v1')!),
  );
  expect(saved.version).toBe(4);
  await page.reload();
  await page.getByRole('button', { name: '수직 실험 이어하기', exact: true }).click();
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.buildings)).toEqual(
    saved.buildings,
  );
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.vertical!.floor)).toBe(
    1,
  );
  expect(errors).toEqual([]);
});
test('all five vertical examples, six views and camera presets render without mutating the city', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '수직 건설 실험실', exact: true }).click();
  for (const example of ['A', 'B', 'C', 'D', 'E']) {
    await page.getByRole('button', { name: '입체 공방', exact: true }).click();
    await page.getByRole('button', { name: new RegExp('^' + example + ' ·') }).click();
    expect(
      await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.vertical!.example),
    ).toBe(example);
    await page.getByRole('button', { name: '저장', exact: true }).click();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('skytopia.vertical.v1')!).vertical.example,
      ),
    ).toBe(example);
  }
  const before = await page.evaluate(() =>
    JSON.stringify(window.__SKYTOPIA_TEST__!.getState().game.buildings),
  );
  for (const view of ['active', 'cutaway', 'structure', 'lower', 'blueprint', 'all']) {
    await page.getByLabel('층별 보기').selectOption(view);
    await page.waitForTimeout(250);
  }
  expect(
    await page.evaluate(() => JSON.stringify(window.__SKYTOPIA_TEST__!.getState().game.buildings)),
  ).toBe(before);
  for (const camera of ['정면', '측면', '하부', '평면', '현재 층', '자유']) {
    await page.getByRole('button', { name: '입체 공방', exact: true }).click();
    await page.getByRole('button', { name: camera, exact: true }).click();
  }
  await page.getByRole('button', { name: '입체 공방', exact: true }).click();
  await page.getByRole('button', { name: /^D ·/ }).click();
  await page.getByRole('button', { name: '-1F', exact: true }).click();
  await page.getByLabel('층별 보기').selectOption('lower');
  await page.screenshot({ path: 'test-results/phase5-lower-industry.png' });
  expect(errors).toEqual([]);
});
