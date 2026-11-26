import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function state(page: Page) {
  return page.evaluate(() => {
    const s = window.__SKYTOPIA_TEST__!.getState();
    return { game: s.game, screen: s.screen, azimuth: s.azimuth };
  });
}
async function choose(page: Page, kind: string, x: number, z: number) {
  await page.evaluate(
    ({ kind, x, z }) => {
      window.__SKYTOPIA_TEST__!.setState((s) => ({
        game: {
          ...s.game,
          active: { kind: kind as 'home', shape: 'single', rotation: 0 },
          cursor: { x, z },
        },
      }));
    },
    { kind, x, z },
  );
}
test('menu, language, interactive training, pause, save and reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: '이어하기', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/menu.png' });
  await page.getByRole('button', { name: '한국어 / EN' }).click();
  await expect(page.getByRole('button', { name: 'New expedition' })).toBeVisible();
  await page.getByRole('button', { name: 'EN / 한국어' }).click();
  await page.getByRole('button', { name: /건축 훈련/ }).click();
  await page.mouse.move(700, 380);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(850, 410, { steps: 15 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(async () => (await state(page)).game.tutorial).toBe(1);
  await page.mouse.wheel(0, -150);
  await expect.poll(async () => (await state(page)).game.tutorial).toBe(2);
  await page.keyboard.press('d');
  await page.keyboard.press('e');
  await expect.poll(async () => (await state(page)).game.tutorial).toBe(4);
  await choose(page, 'home', -1, -1);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).game.tutorial).toBe(5);
  await choose(page, 'platform', -4, -1);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).game.tutorial).toBe(6);
  await choose(page, 'road', -1, -3);
  await page.keyboard.press('Space');
  await choose(page, 'power', -2, -3);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).game.tutorial).toBe(8);
  await page.getByRole('button', { name: '균형 표시' }).click();
  await expect(page.getByText('훈련 완료 · 시간제한 없이 자유롭게 건설하세요')).toBeVisible();
  await page.getByRole('button', { name: '시점 복귀', exact: true }).click();
  await page.screenshot({ path: 'test-results/game.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '일시정지' })).toBeVisible();
  const frozen = (await state(page)).game.elapsed;
  await page.waitForTimeout(700);
  expect((await state(page)).game.elapsed).toBe(frozen);
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('skytopia.save.v2')!));
  await page.reload();
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
  const restored = (await state(page)).game;
  expect(restored.platforms).toEqual(saved.platforms);
  expect(restored.buildings).toEqual(saved.buildings);
  expect(restored.supply).toEqual(saved.supply);
  expect(restored.hold).toEqual(saved.hold);
  expect(errors).toEqual([]);
});
test('mouse placement after orbit, top view, tilt; keyboard is camera-relative', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /건축 훈련/ }).click();
  await page.getByRole('button', { name: '훈련 건너뛰기' }).click();
  for (let angle = 0; angle < 4; angle++) {
    await page.mouse.move(650, 350);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(950, 350, { steps: 18 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(250);
    const before = await state(page);
    await page.keyboard.press('w');
    const after = await state(page);
    const quadrant = -Math.round(before.azimuth / (Math.PI / 2));
    let [x, z] = [0, -1];
    for (let i = 0; i < ((quadrant % 4) + 4) % 4; i++) [x, z] = [-z, x];
    expect(after.game.cursor).toEqual({
      x: Math.max(-8, Math.min(7, before.game.cursor.x + x)),
      z: Math.max(-8, Math.min(7, before.game.cursor.z + z)),
    });
    await choose(page, 'park', 1, 1);
    let placed = false;
    for (const y of [380, 410, 440, 470, 500]) {
      for (const x of [630, 680, 730, 780, 830]) {
        await page.mouse.move(x, y);
        const valid = await page.evaluate(async () => {
          const path = '/src/game/placement.ts';
          const { validatePlacement } = await import(path);
          return validatePlacement(window.__SKYTOPIA_TEST__!.getState().game).valid;
        });
        if (!valid) continue;
        const g = (await state(page)).game;
        await page.mouse.click(x, y);
        const next = (await state(page)).game;
        if (next.buildings.length === g.buildings.length + 1) {
          expect(next.buildings.at(-1)?.origin).toEqual(g.cursor);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    expect(placed).toBe(true);
  }
  await page.getByRole('button', { name: '상단 시점', exact: true }).click();
  await expect(page.getByRole('button', { name: '상단 시점', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('h');
  await expect(page.getByRole('button', { name: '자유 시점', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: 'test-results/game-1024.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('mission victory renders and can continue, corrupted save remains recoverable', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새로운 게임', exact: true }).click();
  // Accelerate population only; all mission construction uses real UI placement commands.
  for (const x of [-3, -2, -1, 0, 1]) {
    await choose(page, 'platform', x, -4);
    await page.keyboard.press('Space');
  }
  for (const [x, z] of [
    [1, -3],
    [-1, -3],
    [1, -1],
    [-1, -1],
  ]) {
    await choose(page, 'home', x, z);
    await page.keyboard.press('Space');
  }
  await choose(page, 'power', 0, -4);
  await page.keyboard.press('Space');
  await page.evaluate(() => {
    const store = window.__SKYTOPIA_TEST__!;
    store.setState((s) => ({ game: { ...s.game, cursor: { x: 0, z: 0 } } }));
    for (let i = 0; i < 50; i++) store.getState().tick(1);
  });
  await expect(page.getByRole('dialog', { name: '최초의 빛을 밝히다' })).toBeVisible();
  await page.screenshot({ path: 'test-results/victory.png' });
  await page.getByRole('button', { name: '계속 건설하기' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '저장 후 메뉴' }).click();
  await page.evaluate(() => localStorage.setItem('skytopia.save.v2', '{broken'));
  await page.reload();
  await expect(page.getByText(/손상되었거나 호환되지 않는/)).toBeVisible();
  await expect(page.getByRole('button', { name: '이어하기', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '새로운 게임', exact: true }).click();
  await expect(page.getByText('현재 미션')).toBeVisible();
});
test('real countdown, hold lock, recycling and autosave', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새로운 게임', exact: true }).click();
  const first = (await state(page)).game.active;
  await page.keyboard.press('c');
  expect((await state(page)).game.hold).toEqual(first);
  const held = (await state(page)).game.active;
  await page.keyboard.press('c');
  expect((await state(page)).game.active).toEqual(held);
  await page.keyboard.press('x');
  await expect.poll(async () => (await state(page)).game.resources).toBe(102);
  await choose(page, 'home', -1, -1);
  await page.evaluate(() =>
    window.__SKYTOPIA_TEST__!.setState((s) => ({ game: { ...s.game, remaining: 0.1 } })),
  );
  await expect.poll(async () => (await state(page)).game.buildings.length).toBe(6);
  await choose(page, 'home', 0, 0);
  await page.evaluate(() =>
    window.__SKYTOPIA_TEST__!.setState((s) => ({ game: { ...s.game, remaining: 0.1 } })),
  );
  await expect.poll(async () => (await state(page)).game.resources).toBe(104);
  expect((await state(page)).game.buildings).toHaveLength(6);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('skytopia.save.v2')), { timeout: 12000 })
    .not.toBeNull();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('skytopia.save.v2')!));
  expect(saved.resources).toBe(104);
  expect(saved.buildings).toHaveLength(6);
  await page.keyboard.press('Escape');
  const remaining = (await state(page)).game.remaining;
  await page.waitForTimeout(600);
  expect((await state(page)).game.remaining).toBe(remaining);
});
test('storage quota failure is visible and does not stop play', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '새로운 게임', exact: true }).click();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('저장 실패 · 브라우저 저장 공간을 확인하세요')).toBeVisible();
  expect((await state(page)).screen).toBe('playing');
});
