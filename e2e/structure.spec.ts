import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
const game = (page: Page) => page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game);
test('laboratory overlays, inspection, timed repair, reinforcement, demolition and independent save', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '구조 실험실' }).click();
  await page.getByRole('button', { name: /EXPERIMENT D/ }).click();
  expect((await game(page)).labPaused).toBe(true);
  for (const mode of ['load', 'lift', 'center', 'durability', 'connections'])
    await page.getByRole('combobox', { name: '구조 분석' }).selectOption(mode);
  await page.getByRole('button', { name: '위험 구역 보기' }).click();
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().selected)).not.toBeNull();
  // Select a known damaged support; repair/reinforce commands below use actual HUD buttons.
  await page.evaluate(() =>
    window.__SKYTOPIA_TEST__!.getState().selectTarget({ type: 'platform', id: '3,0' }),
  );
  await page.getByRole('button', { name: /^수리 0$/ }).click();
  expect((await game(page)).structure.repairs).toHaveLength(1);
  await page.getByRole('button', { name: /^보강 0$/ }).click();
  expect((await game(page)).platforms.find((p) => p.x === 3 && p.z === 0)?.reinforcement).toBe(1);
  for (const id of ['2,0|3,0', '3,0|4,0']) {
    await page.evaluate(
      (id) => window.__SKYTOPIA_TEST__!.getState().selectTarget({ type: 'edge', id }),
      id,
    );
    await page.getByRole('button', { name: /^보강 0$/ }).click();
  }
  await page.getByRole('button', { name: '시간 재개', exact: true }).click();
  await expect
    .poll(async () => (await game(page)).structure.repairsDone, { timeout: 8000 })
    .toBe(1);
  await page.getByRole('button', { name: '시간 정지', exact: true }).click();
  await page.locator('summary').filter({ hasText: '긴급 대응' }).click();
  await page.getByRole('button', { name: /^비상 부양 \+140t/ }).click();
  expect((await game(page)).structure.emergency.remaining).toBe(20);
  await page.evaluate(() =>
    window.__SKYTOPIA_TEST__!.getState().selectTarget({ type: 'building', id: '1' }),
  );
  await page.getByRole('button', { name: '철거', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '철거 결과 확인' })).toBeVisible();
  await page.getByRole('button', { name: '철거 실행' }).click();
  expect((await game(page)).buildings.some((b) => b.id === 1)).toBe(false);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const saved = await game(page);
  expect(await page.evaluate(() => localStorage.getItem('skytopia.save.v3'))).toBeNull();
  await page.screenshot({ path: 'test-results/phase2-lab.png' });
  await page.reload();
  await page.getByRole('button', { name: '구조 실험실' }).click();
  await page.getByRole('button', { name: '실험 이어하기' }).click();
  expect((await game(page)).platforms).toEqual(saved.platforms);
  expect((await game(page)).structure).toEqual(saved.structure);
  expect(errors).toEqual([]);
});
test('mission selection, purchased blueprint, forecast, collapse history and reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '캠페인 선택' }).click();
  await page.getByRole('button', { name: /MISSION 03/ }).click();
  await expect(page.getByRole('heading', { name: '하늘의 균형' })).toBeVisible();
  await page.locator('summary').filter({ hasText: '긴급 대응' }).click();
  await page.getByRole('button', { name: /소형 부양장치.*45/ }).click();
  await page.evaluate(() =>
    window.__SKYTOPIA_TEST__!.setState((s) => ({ game: { ...s.game, cursor: { x: 3, z: 0 } } })),
  );
  await page.locator('summary').filter({ hasText: '배치 후 예상' }).click();
  await expect(page.getByText('예상 부양력')).toBeVisible();
  const queue = (await game(page)).next;
  await page.getByRole('button', { name: /배치.*SPACE/ }).click();
  expect((await game(page)).buildings.some((b) => b.kind === 'liftSmall')).toBe(true);
  expect((await game(page)).next).toEqual(queue);
  await page.getByRole('combobox', { name: '구조 분석' }).selectOption('lift');
  await page.screenshot({ path: 'test-results/phase2-lift.png' });
  // A deterministic damaged snapshot triggers the real simulation/collapse path.
  await page.evaluate(() => {
    const store = window.__SKYTOPIA_TEST__!;
    store.setState((s) => ({
      game: {
        ...s.game,
        platforms: s.game.platforms.map((p) =>
          p.x === 5 && p.z === 0 ? { ...p, durability: 0 } : p,
        ),
        cursor: { x: 0, z: 0 },
      },
    }));
    store.getState().tick(0.25);
  });
  const collapsed = await game(page);
  expect(collapsed.structure.collapsedCount).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
  expect((await game(page)).platforms.some((p) => p.x === 5 && p.z === 0)).toBe(false);
  expect((await game(page)).structure.collapsedCount).toBe(collapsed.structure.collapsedCount);
  expect(errors).toEqual([]);
});
test('critical failure explains cause, retry works, audio controls persist', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새로운 게임', exact: true }).click();
  await page.evaluate(() => {
    const store = window.__SKYTOPIA_TEST__!;
    store.setState((s) => ({
      game: {
        ...s.game,
        cursor: { x: 0, z: 0 },
        structure: { ...s.game.structure, grace: 0, coreDurability: 120 },
      },
    }));
    for (let i = 0; i < 22; i++) store.getState().tick(1);
  });
  await expect(page.getByRole('dialog', { name: '도시가 추락했습니다' })).toBeVisible();
  await expect(page.getByText(/주요 원인: 치명적 부양력 부족/)).toBeVisible();
  await page.screenshot({ path: 'test-results/phase2-failure.png' });
  await page.getByRole('button', { name: '다시 도전' }).click();
  expect((await game(page)).structure.loss).toBeNull();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('slider', { name: '경고음 볼륨' }).fill('0.2');
  expect(
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().settings.warningVolume),
  ).toBe(0.2);
});
