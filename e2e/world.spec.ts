import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function advance(page: Page, seconds: number) {
  await page.evaluate(async (seconds) => {
    const path = '/src/game/engine.ts',
      engine = await import(path),
      store = window.__SKYTOPIA_TEST__!;
    let g = store.getState().game;
    g = { ...g, labPaused: false, city: { ...g.city, speed: 1 } };
    for (let i = 0; i < seconds && !g.campaign?.result && !g.campaign?.failed; i++)
      g = engine.tick(g, 1);
    store.getState().cityAction(() => ({ ...g, city: { ...g.city, speed: 0 } }));
  }, seconds);
}
test('civilization explores, founds two colonies, ships physical cargo and restores separate world saves', async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '문명 모드 · 구름 너머', exact: true }).click();
  await page.getByLabel('설정', { exact: true }).selectOption('comfort');
  await page.getByRole('button', { name: '새 문명 시작', exact: true }).click();
  await expect(page.getByRole('region', { name: '세계 관리' })).toBeVisible();
  await page.getByLabel('세계 속도', { exact: true }).selectOption('0');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('svg .world-island').first()).toHaveCSS('transform', 'none');
  await page.getByRole('button', { name: '비공정', exact: true }).click();
  await page
    .locator('.world-card')
    .filter({ has: page.getByRole('heading', { name: '탐사선', exact: true }) })
    .getByRole('button', { name: '건조', exact: true })
    .click();
  await page
    .locator('.world-card')
    .filter({ has: page.getByRole('heading', { name: '개척선', exact: true }) })
    .getByRole('button', { name: '건조', exact: true })
    .click();
  await advance(page, 40);
  const ships = await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.world!.ships);
  expect(ships).toHaveLength(2);
  expect(ships.every((s) => s.state === 'docked')).toBe(true);
  const explorer = ships.find((s) => s.type === 'explorer')!.id,
    colony = ships.find((s) => s.type === 'colony')!.id;
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '세계 지도', exact: true }).click();
    await page.locator('svg [role="button"][aria-label="미확인 섬"]').first().click();
    await page.getByLabel('탐사 비공정', { exact: true }).selectOption(explorer);
    await page.getByRole('button', { name: '탐사·기록 후 귀환', exact: true }).click();
    await advance(page, 110);
    await page.getByRole('button', { name: '개척 후보로 선택', exact: true }).click();
    await page.getByLabel('탐사 비공정', { exact: true }).selectOption(colony);
    await page.getByRole('button', { name: '개척선 파견', exact: true }).click();
    await advance(page, 130);
    expect(
      await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.world!.cities.length),
    ).toBe(i + 2);
  }
  await page.getByRole('button', { name: '비공정', exact: true }).click();
  await page
    .locator('.world-card')
    .filter({ has: page.getByRole('heading', { name: '소형 화물선', exact: true }) })
    .getByRole('button', { name: '건조', exact: true })
    .click();
  await advance(page, 35);
  const state = await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.world!);
  await page.getByRole('button', { name: '항로', exact: true }).click();
  await page
    .getByLabel('선박', { exact: true })
    .selectOption(state.ships.find((s) => s.type === 'lightCargo')!.id);
  await page.getByLabel('목적지', { exact: true }).selectOption(state.cities[2].id);
  await page.getByLabel('자원', { exact: true }).selectOption('materials');
  await page.getByRole('button', { name: '자동 항로 만들기', exact: true }).click();
  await advance(page, 100);
  expect(
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.world!.stats.materials),
  ).toBeGreaterThan(0);
  await page.getByRole('button', { name: '세계 지도', exact: true }).click();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('skytopia.world.v1')!));
  expect(saved.cities).toHaveLength(3);
  expect(await page.evaluate(() => localStorage.getItem('skytopia.city.v5'))).toBeNull();
  await page.screenshot({ path: 'test-results/phase7-world-map.png' });
  await page.reload();
  await page.getByRole('button', { name: '문명 이어하기', exact: true }).click();
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.world!.stats)).toEqual(
    saved.stats,
  );
  await page.getByRole('button', { name: '도시 관리', exact: true }).click();
  await page.screenshot({ path: 'test-results/phase7-city-overview.png' });
  await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().configure({ language: 'en' }));
  await expect(page.getByRole('region', { name: 'World management' })).toBeVisible();
  await page.getByRole('button', { name: 'Manage city', exact: true }).nth(1).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.mission-card')).toContainText('BEYOND THE CLOUDS');
  await expect(page.locator('.mission-card')).not.toContainText('Disaster Lab');
  await page.screenshot({ path: 'test-results/phase7-active-colony.png' });
  await page.getByRole('button', { name: /^World map ·/ }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('final world mission earns its result, tours actual cities and continues without duplicate rewards', async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const path = '/src/game/campaign/loader.ts',
      { loadStage } = await import(path),
      store = window.__SKYTOPIA_TEST__!,
      s = store.getState();
    const game = loadStage(30, s.settings);
    store.setState({ game, screen: 'playing', campaignSave: { ...s.campaignSave, current: game } });
  });
  await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await page.getByLabel('세계 속도', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '연구', exact: true }).click();
  await page
    .locator('.world-card')
    .filter({ has: page.getByRole('heading', { name: '도시 연합 관제', exact: true }) })
    .getByRole('button', { name: '연구 시작', exact: true })
    .click();
  await advance(page, 55);
  await page.getByRole('button', { name: '세계 시설', exact: true }).click();
  await page
    .locator('.world-card')
    .filter({ has: page.getByRole('heading', { name: '스카이토피아 넥서스', exact: true }) })
    .getByRole('button', { name: '설계도 선택', exact: true })
    .click();
  await page.evaluate(async () => {
    const pp = '/src/game/placement.ts',
      ap = '/src/game/analysis.ts',
      ep = '/src/game/engine.ts';
    const { validatePlacement } = await import(pp),
      { analyze } = await import(ap),
      { place } = await import(ep),
      store = window.__SKYTOPIA_TEST__!,
      g = store.getState().game;
    let best: typeof g | null = null,
      score = -Infinity;
    for (const p of g.platforms.filter((p) => p.y === 0)) {
      const draft = { ...g, cursor: { x: p.x, y: 0, z: p.z } };
      if (!validatePlacement(draft).valid) continue;
      const next = place(draft),
        a = analyze(next);
      if (a.stability > score && (a.powerRatios.get(next.nextId - 1) ?? 0) >= 0.99) {
        best = next;
        score = a.stability;
      }
    }
    if (!best) throw Error('No paid Nexus plot');
    store.getState().cityAction(() => ({ ...best!, world: { ...best!.world!, view: 'map' } }));
  });
  await advance(page, 30);
  await expect(page.getByRole('region', { name: '문명 완성 연출' })).toBeVisible();
  await page.getByRole('button', { name: '연출 일시정지', exact: true }).click();
  const before = await page.evaluate(() => ({
    clock: window.__SKYTOPIA_TEST__!.getState().game.world!.clock,
    xp: window.__SKYTOPIA_TEST__!.getState().campaignSave.profile.xp,
  }));
  await page.getByRole('button', { name: '다음 장면', exact: true }).click();
  await page.getByRole('button', { name: '다음 장면', exact: true }).click();
  await page.getByRole('button', { name: '다음 장면', exact: true }).click();
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.world!.view)).toBe(
    'map',
  );
  await page.screenshot({ path: 'test-results/phase7-ending-network.png' });
  await page.getByRole('button', { name: '연출 건너뛰기', exact: true }).click();
  expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.world!.clock)).toBe(
    before.clock,
  );
  await page.getByRole('button', { name: '도시 계속 건설', exact: true }).click();
  expect(
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.campaign),
  ).toBeUndefined();
  expect(
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().campaignSave.profile.xp),
  ).toBe(before.xp);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('skytopia.world.v1')!).ending.continued,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
