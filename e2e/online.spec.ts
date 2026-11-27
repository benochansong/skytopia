import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
test.use({ actionTimeout: 15000, navigationTimeout: 30000 });
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/multiplayer/client.ts';
    return (await import(path)).useOnline.getState();
  });
}
async function enter(page: Page, name: string) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__SKYTOPIA_TEST__);
  await page.evaluate(() =>
    window.__SKYTOPIA_TEST__!.getState().configure({
      language: 'en',
      shadows: false,
      reducedMotion: true,
      environment: false,
      citizens: 0,
      vehicles: 0,
    }),
  );
  if (name === 'Architect A')
    await page.evaluate(() => {
      const s = window.__SKYTOPIA_TEST__!.getState();
      s.start('mission');
      s.save(true);
      s.setScreen('menu');
    });
  await page.getByRole('button', { name: 'Online · SKY RIVALS 08', exact: true }).click();
  await page.getByLabel('Display name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create room', exact: true })).toBeVisible();
}
async function start(a: Page, b: Page, mode = 'duel') {
  await a.getByLabel('Mode', { exact: true }).selectOption(mode);
  await a.getByRole('button', { name: 'Create', exact: true }).click();
  const code = await a.getByTestId('invite-code').innerText();
  await b.getByLabel('Invite code', { exact: true }).fill(code);
  await b.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(b.getByTestId('invite-code')).toHaveText(code);
  await a.getByRole('button', { name: 'Ready', exact: true }).click();
  await b.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(a.getByRole('button', { name: 'Start match', exact: true })).toBeEnabled();
  await a.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect.poll(async () => (await state(a)).room?.phase, { timeout: 30000 }).toBe('playing');
  await expect.poll(async () => (await state(b)).room?.phase, { timeout: 30000 }).toBe('playing');
}
async function validCell(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/game/placement.ts',
      { validatePlacement } = await import(path),
      g = window.__SKYTOPIA_TEST__!.getState().game;
    const cells = [];
    for (let z = -8; z <= 7; z++) for (let x = -8; x <= 7; x++) cells.push({ x, z, y: 0 });
    cells.sort((u, v) => Math.hypot(u.x, u.z) - Math.hypot(v.x, v.z));
    for (const cell of cells) if (validatePlacement(g, g.active, cell).valid) return cell;
    throw Error('No valid placement: ' + g.active.kind);
  });
}
async function choose(page: Page, cell: { x: number; z: number }) {
  await page.getByLabel('Build X', { exact: true }).fill(String(cell.x));
  await page.getByLabel('Build Z', { exact: true }).fill(String(cell.z));
}
test('real two-browser duel: invite, fair start, authoritative placement, reconnect, result and offline save isolation', async ({
  browser,
}) => {
  test.setTimeout(180000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
  const errors: string[] = [];
  a.on('pageerror', (e) => errors.push(e.message));
  b.on('pageerror', (e) => errors.push(e.message));
  try {
    await enter(a, 'Architect A');
    await enter(b, 'Architect B');
    const saves = await a.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([k]) => !k.startsWith('skytopia.online.')),
      ),
    );
    await start(a, b);
    const first = await state(a),
      second = await state(b);
    expect(first.id).not.toBe(second.id);
    expect(first.room.hand.active).toEqual(second.room.hand.active);
    expect(first.games[0].buildings).toEqual(first.games[1].buildings);
    const count = first.games[0].buildings.length;
    await choose(a, await validCell(a));
    await a.getByRole('button', { name: 'Place · Space', exact: true }).click();
    await expect.poll(async () => (await state(a)).games[0].buildings.length).toBe(count + 1);
    await expect.poll(async () => (await state(b)).games[0].buildings.length).toBe(count + 1);
    expect((await state(b)).games[1].buildings.length).toBe(count);
    await a.screenshot({ path: 'test-results/online-duel.png', fullPage: true });
    const id = first.id;
    await a.reload();
    await a.getByRole('button', { name: 'Online · SKY RIVALS 08', exact: true }).click();
    await a.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect.poll(async () => (await state(a)).room?.phase, { timeout: 30000 }).toBe('playing');
    expect((await state(a)).id).toBe(id);
    await b.getByRole('button', { name: 'Surrender', exact: true }).click();
    await b.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(a.getByRole('region', { name: 'Match result', exact: true })).toBeVisible();
    expect((await state(a)).room.result.winner).toBe(id);
    await a.getByRole('button', { name: 'Back to lobby', exact: true }).click();
    await expect(a.getByRole('heading', { name: 'My recent matches', exact: true })).toBeVisible();
    await a.getByRole('button', { name: 'Single player', exact: true }).click();
    expect(
      await a.evaluate(() =>
        Object.fromEntries(
          Object.entries(localStorage).filter(([k]) => !k.startsWith('skytopia.online.')),
        ),
      ),
    ).toEqual(saves);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test('cooperative browsers share one city, resolve a simultaneous placement and synchronize pings', async ({
  browser,
}) => {
  test.setTimeout(180000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    await enter(a, 'Co-op A');
    await enter(b, 'Co-op B');
    await start(a, b, 'coop');
    const before = await state(a),
      count = before.games[0].buildings.length;
    const cell = await validCell(a);
    await choose(a, cell);
    await choose(b, cell);
    await Promise.all([
      a.getByRole('button', { name: 'Place · Space', exact: true }).click(),
      b.getByRole('button', { name: 'Place · Space', exact: true }).click(),
    ]);
    await expect.poll(async () => (await state(a)).games[0].buildings.length).toBe(count + 1);
    await expect.poll(async () => (await state(b)).games[0].buildings.length).toBe(count + 1);
    const states = await Promise.all([state(a), state(b)]);
    expect(states.map((s) => s.room.hand.token).sort()).toEqual([0, 1]);
    await a.getByRole('button', { name: 'danger ◇', exact: true }).click();
    await expect(b.getByRole('button', { name: /Co-op A: danger/ })).toBeVisible();
    await b.screenshot({ path: 'test-results/online-coop.png', fullPage: true });
    const builder = states[0].room.hand.token === 1 ? a : b;
    for (let i = 0; i < 3; i++) {
      await choose(builder, await validCell(builder));
      await builder.getByRole('button', { name: 'Place · Space', exact: true }).click();
      await expect
        .poll(async () => (await state(builder)).games[0].buildings.length)
        .toBe(count + i + 2);
    }
    await expect
      .poll(async () => (await state(b)).room?.result?.reason, { timeout: 45000 })
      .toBe('cooperativeVictory');
    await expect(b.getByRole('region', { name: 'Match result', exact: true })).toBeVisible();
    await b.screenshot({ path: 'test-results/online-coop-victory.png', fullPage: true });
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
