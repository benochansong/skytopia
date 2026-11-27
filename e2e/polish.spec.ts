import { test, expect } from '@playwright/test';
import { mkdir, stat, writeFile } from 'node:fs/promises';

test('repeat, live placement impact, photo pause/download and restored controls', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /건축 훈련/ }).click();
  await page.getByRole('button', { name: '훈련 건너뛰기' }).click();
  await page.evaluate(() => {
    const s = window.__SKYTOPIA_TEST__!;
    s.getState().configure({ repeatDelay: 120, repeatInterval: 50, reducedMotion: true });
    s.setState((x) => ({ game: { ...x.game, cursor: { x: 0, z: 0 } } }));
    (document.activeElement as HTMLElement)?.blur();
  });
  await page.keyboard.down('d');
  // Software WebGL can stall the main thread; exact deadlines belong to KeyRepeater's unit test.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { x, z } = window.__SKYTOPIA_TEST__!.getState().game.cursor;
        return Math.abs(x) + Math.abs(z);
      }),
    )
    .toBeGreaterThanOrEqual(2);
  await page.keyboard.up('d');
  const moved = await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.cursor);
  expect(Math.abs(moved.x) + Math.abs(moved.z)).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(180);
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.cursor)).toEqual(
    moved,
  );
  await page.getByRole('button', { name: /배치 영향/ }).click();
  await expect(page.getByText(/현재 상태 기준 예상값/)).toBeVisible();
  await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().camera('top'));
  await page.getByRole('button', { name: '사진 모드', exact: true }).click();
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().cameraMode)).toBe('free');
  const frozen = await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.elapsed);
  await page.waitForTimeout(700);
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.elapsed)).toBe(frozen);
  await expect(page.locator('.hud')).toBeHidden();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '사진 저장', exact: true }).click();
  const download = await downloadPromise;
  await mkdir('test-results', { recursive: true });
  await download.saveAs('test-results/phase9-photo.png');
  expect((await stat('test-results/phase9-photo.png')).size).toBeGreaterThan(10000);
  await page.keyboard.press('Escape');
  await expect(page.locator('.hud')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.elapsed))
    .toBeGreaterThan(frozen);
  await page.screenshot({ path: 'test-results/phase9-play.png' });
  expect(errors).toEqual([]);
});

test('recycling is bounded and a new hand is immediately usable after placement', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새로운 게임', exact: true }).click();
  const timerBefore = await page.evaluate(
    () => window.__SKYTOPIA_TEST__!.getState().game.remaining,
  );
  await page.keyboard.down('v');
  await page.waitForTimeout(800);
  await page.keyboard.up('v');
  const timerAfter = await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.remaining);
  expect(timerBefore - timerAfter).toBeGreaterThan(1.5);
  await page.evaluate(() => {
    const s = window.__SKYTOPIA_TEST__!;
    s.setState((x) => ({ game: { ...x.game, city: { ...x.game.city, speed: 0 } } }));
  });
  const pausedTimer = await page.evaluate(
    () => window.__SKYTOPIA_TEST__!.getState().game.remaining,
  );
  await page.keyboard.down('v');
  await page.waitForTimeout(350);
  await page.keyboard.up('v');
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.remaining)).toBe(
    pausedTimer,
  );
  await page.evaluate(() => {
    const s = window.__SKYTOPIA_TEST__!;
    s.setState((x) => ({ game: { ...x.game, city: { ...x.game.city, speed: 1 } } }));
  });
  const result = await page.evaluate(() => {
    const store = window.__SKYTOPIA_TEST__!;
    store.setState((s) => ({
      game: {
        ...s.game,
        active: { kind: 'home', shape: 'single', rotation: 0 },
        cursor: { x: -1, z: -1 },
      },
    }));
    const before = store.getState().game;
    const start = performance.now();
    store.getState().place();
    const elapsed = performance.now() - start;
    const after = store.getState().game;
    store.getState().recycle();
    const first = store.getState().game;
    for (let n = 0; n < 30; n++) store.getState().recycle();
    const last = store.getState().game;
    return {
      elapsed,
      nextId: after.nextId - before.nextId,
      supplied: JSON.stringify(after.active) === JSON.stringify(before.next[0]),
      draws: [first.supply.draws, last.supply.draws],
      materials: [first.resources, last.resources],
    };
  });
  expect(result.nextId).toBe(1);
  expect(result.supplied).toBe(true);
  expect(result.elapsed).toBeLessThan(500);
  expect(result.draws[0]).toBe(result.draws[1]);
  expect(result.materials[0]).toBe(result.materials[1]);
  await writeFile(
    'test-results/phase9-input.json',
    JSON.stringify(
      {
        ...result,
        note: 'Synchronous browser store action; not human input latency or a hardware FPS claim.',
      },
      null,
      2,
    ),
  );
});

test('control settings persist, free presets use existing simulation, and dialogs isolate gameplay input', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByLabel('스마트 스냅 · 한 칸', { exact: true }).check();
  await page.getByLabel('보조 수준', { exact: true }).selectOption('guided');
  await page.keyboard.press('Escape');
  await page.reload();
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().settings.smartSnap)).toBe(
    true,
  );
  await page.getByLabel('자유 건설 설정').selectOption('relaxed');
  await page.getByRole('button', { name: '자유 건설', exact: true }).click();
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.city.unlimited)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.cursor);
  await page.keyboard.press('d');
  await page.keyboard.press('e');
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.cursor)).toEqual(
    before,
  );
});
