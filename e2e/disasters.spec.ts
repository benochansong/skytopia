import { test, expect } from '@playwright/test';
test('disaster forecast, shields, pause and separate save survive a reload', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('summary').filter({ hasText: '실험실 · 구조와 도시' }).click();
  await page.getByRole('button', { name: '재난 실험실', exact: true }).click();
  await page.getByRole('button', { name: '재난 대응', exact: true }).click();
  await page.getByRole('button', { name: /^D ·/ }).click();
  await page.getByLabel('지속 초', { exact: true }).fill('5');
  await page.getByLabel('재난 분석', { exact: true }).selectOption('shield');
  await page.getByRole('button', { name: '예보 시작 · 재난 실행', exact: true }).click();
  const planned = await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.disaster!);
  await page.waitForTimeout(500);
  expect(
    (await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.disaster!)).clock,
  ).toBe(planned.clock);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('skytopia.disaster.v1')!),
  );
  expect(saved.version).toBe(5);
  expect(saved.disaster.threat.impacts.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem('skytopia.vertical.v2'))).toBeNull();
  await page.reload();
  await page.locator('summary').filter({ hasText: '실험실 · 구조와 도시' }).click();
  await page.getByRole('button', { name: '재난 실험 이어하기', exact: true }).click();
  expect(
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.disaster!.threat),
  ).toEqual(saved.disaster.threat);
  await page.evaluate(() => {
    const store = window.__SKYTOPIA_TEST__!;
    store.setState((s) => ({ game: { ...s.game, labPaused: false } }));
    for (let i = 0; i < 80; i++) store.getState().tick(0.25);
    store.setState((s) => ({ game: { ...s.game, labPaused: true } }));
  });
  const after = await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.disaster!);
  expect(after.reports).toHaveLength(1);
  expect(after.applied.length).toBeGreaterThan(0);
  expect(after.stats.absorbed).toBeGreaterThan(0);
  await page.getByRole('button', { name: '재난 대응', exact: true }).click();
  await expect(page.getByText('운석우 · 피해 보고', { exact: true })).toBeVisible();
  await page.getByText('운석우 · 피해 보고', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/phase6-meteor-report.png' });
  expect(errors).toEqual([]);
});
test('six disaster examples, analysis overlays and English controls render', async ({ page }) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('summary').filter({ hasText: '실험실 · 구조와 도시' }).click();
  await page.getByRole('button', { name: '재난 실험실', exact: true }).click();
  await page.getByRole('button', { name: '재난 대응', exact: true }).click();
  for (const example of ['A', 'B', 'C', 'D', 'E', 'F']) {
    await page.getByRole('button', { name: new RegExp('^' + example + ' ·') }).click();
    expect(
      await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.disaster!.example),
    ).toBe(example);
  }
  for (const view of [
    'wind',
    'risk',
    'impact',
    'shield',
    'aether',
    'evacuation',
    'damage',
    'recovery',
    'off',
  ])
    await page.getByLabel('재난 분석', { exact: true }).selectOption(view);
  await page.getByLabel('재난 분석', { exact: true }).selectOption('shield');
  await page.screenshot({ path: 'test-results/phase6-compound-controls.png' });
  await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().configure({ language: 'en' }));
  await expect(page.getByRole('dialog', { name: 'A city prepared for storms' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('survival saves independently and free-build weather remains opt-in', async ({ page }) => {
  test.setTimeout(150000);
  await page.goto('/');
  await page.getByRole('button', { name: '생존 모드', exact: true }).click();
  await page.getByRole('button', { name: 'Ⅱ', exact: true }).click();
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.city.unlimited)).toBe(
    false,
  );
  await page.getByRole('button', { name: '재난 대응', exact: true }).click();
  await page.getByRole('button', { name: '구조 방어', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('skytopia.survival.v1')!),
  );
  expect(saved.disaster.policy).toBe('defense');
  expect(saved.disaster.wave).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: '생존 이어하기', exact: true }).click();
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.disaster)).toEqual(
    saved.disaster,
  );
  await page.reload();
  await page.getByRole('button', { name: '자유 건설', exact: true }).click();
  await page.getByRole('button', { name: 'Ⅱ', exact: true }).click();
  await page.getByRole('button', { name: '기상·재난 설정', exact: true }).click();
  await expect(page.getByLabel('자유 건설 재난', { exact: true })).toHaveValue('off');
  await page.getByLabel('자유 건설 재난', { exact: true }).selectOption('custom');
  await page.getByLabel('재난 종류', { exact: true }).selectOption('meteor');
  await page.getByRole('button', { name: '예보 시작 · 재난 실행', exact: true }).click();
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.disaster!.phase)).toBe(
    'forecast',
  );
  await page.getByRole('button', { name: '재난 대응', exact: true }).click();
  await page.getByLabel('자유 건설 재난', { exact: true }).selectOption('weather');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const free = await page.evaluate(
    () => JSON.parse(localStorage.getItem('skytopia.campaign.v4')!).free,
  );
  expect(free.disaster.setting).toBe('weather');
  expect(free.disaster.threat).toBeNull();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('skytopia.survival.v1')!).disaster),
  ).toEqual(saved.disaster);
});
