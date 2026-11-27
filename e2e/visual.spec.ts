import { test, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

test('graphics controls persist through the actual settings screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByLabel('화질', { exact: true }).selectOption('low');
  await page.getByLabel('구름 밀도', { exact: true }).focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByLabel('화질', { exact: true })).toHaveValue('low');
  await expect(page.getByLabel('구름 밀도', { exact: true })).toHaveValue('0.3');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '한국어 / EN', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Quality', { exact: true })).toHaveValue('low');
});

test('representative visual fixtures render without shader errors', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /THREE|Shader|WebGL/i.test(m.text())) errors.push(m.text());
  });
  await page.goto('/');
  await page.getByRole('button', { name: '새로운 게임', exact: true }).waitFor();
  await expect
    .poll(() => page.evaluate(() => window.__SKYTOPIA_PERF__?.drawCalls ?? 0))
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/phase10-menu.png' });
  for (const mode of [
    'island',
    'city',
    'vertical',
    'storm',
    'shield',
    'world',
    'damage',
    'night',
  ]) {
    await page.evaluate(async (mode) => {
      const s = window.__SKYTOPIA_TEST__!;
      s.setState({ photoMode: false });
      if (mode === 'island') s.getState().start('training');
      else if (mode === 'vertical') s.getState().startVertical('C');
      else if (mode === 'storm' || mode === 'shield')
        s.getState().startDisaster('lab', mode === 'storm' ? 'B' : 'D');
      else if (mode === 'world') s.getState().startWorld({ example: 'B' });
      else {
        s.getState().start('citylab');
        s.getState().cityExample('C');
      }
      if (mode === 'storm' || mode === 'shield') {
        const scheduler = '/src/game/disasters/scheduler.ts',
          manager = '/src/game/disasters/manager.ts';
        const { forecast } = await import(scheduler),
          { disasterBefore } = await import(manager);
        const g = s.getState().game;
        s.setState({
          game: disasterBefore(
            forecast(g, mode === 'storm' ? 'storm' : 'meteor', {
              ...g.disaster!.config,
              warning: 0,
            }),
            mode === 'storm' ? 20 : 9,
          ),
        });
      }
      s.setState((x) => ({
        photoMode: true,
        screen: 'playing',
        cameraMode: 'free',
        cameraReset: x.cameraReset + 1,
        game: {
          ...x.game,
          labPaused: true,
          world: x.game.world ? { ...x.game.world, view: 'city' } : undefined,
          buildings:
            mode === 'damage'
              ? x.game.buildings.map((b) => (b.kind === 'road' ? b : { ...b, durability: 1 }))
              : x.game.buildings,
        },
      }));
      const path = '/src/stores/visualStore.ts';
      (await import(path)).useVisual.getState().set({
        preset:
          mode === 'night' ? 'night' : mode === 'storm' || mode === 'shield' ? 'live' : 'clear',
      });
    }, mode);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/phase10-scene-${mode}.png` });
  }
  expect(errors).toEqual([]);
});

test('graphics presets, photo looks and bounded capture preserve the paused city', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /THREE|Shader|WebGL/i.test(m.text())) errors.push(m.text());
  });
  await page.goto('/');
  await page.locator('summary').filter({ hasText: '실험실 · 구조와 도시' }).click();
  await page.getByRole('button', { name: '도시 운영 실험실' }).click();
  await page.getByRole('button', { name: '새 실험 시작', exact: true }).click();
  await page.evaluate(() => {
    const s = window.__SKYTOPIA_TEST__!;
    s.getState().cityExample('C');
    s.setState((x) => ({ game: { ...x.game, labPaused: true } }));
  });
  await page.getByRole('button', { name: '사진 모드', exact: true }).click();
  const before = await page.evaluate(() => {
    const { settings, ...g } = window.__SKYTOPIA_TEST__!.getState().game;
    return g;
  });
  for (const preset of ['clear', 'golden', 'night', 'blueprint']) {
    await page.getByLabel('사진 분위기', { exact: true }).selectOption(preset);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/phase10-${preset}.png` });
  }
  await page.getByLabel('사진 분위기', { exact: true }).selectOption('golden');
  await page.getByLabel('사진 크기', { exact: true }).selectOption('2');
  await page.getByLabel('로고 넣기', { exact: true }).check();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '사진 저장', exact: true }).click();
  const download = await downloaded;
  await download.saveAs('test-results/phase10-capture.png');
  const png = await readFile('test-results/phase10-capture.png');
  expect(png.readUInt32BE(16)).toBeGreaterThan(1440);
  expect(Math.max(png.readUInt32BE(16), png.readUInt32BE(20))).toBeLessThanOrEqual(3840);
  for (const quality of ['low', 'medium', 'high', 'ultra']) {
    await page.evaluate(async (quality) => {
      const path = '/src/scene/art.ts';
      const { qualityPatch } = await import(path);
      window.__SKYTOPIA_TEST__!.getState().configure(qualityPatch(quality));
    }, quality);
    await page.waitForTimeout(300);
  }
  expect(
    await page.evaluate(() => {
      const { settings, ...g } = window.__SKYTOPIA_TEST__!.getState().game;
      return g;
    }),
  ).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('.hud')).toBeVisible();
  expect(errors).toEqual([]);
});

test('local glTF loads and a failed model falls back without losing the game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '새로운 게임', exact: true }).click();
  const addBallast = async () =>
    page.evaluate(() => {
      const s = window.__SKYTOPIA_TEST__!;
      s.setState((x) => ({
        game: {
          ...x.game,
          labPaused: true,
          buildings: [
            ...x.game.buildings,
            {
              ...x.game.buildings[0],
              id: 9000,
              kind: 'ballast',
              origin: { x: 1, z: 1 },
              shape: 'single',
              rotation: 0,
              y: 0,
              enabled: true,
            },
          ],
        },
      }));
    });
  await addBallast();
  const status = () =>
    page.evaluate(async () => {
      const path = '/src/scene/assets.ts';
      return (await import(path)).modelStatus('/models/ballast.gltf');
    });
  await expect.poll(status).toBe('loaded');
  await page.route('**/models/ballast.gltf', (route) => route.abort());
  await page.reload();
  await page.getByRole('button', { name: '새로운 게임', exact: true }).click();
  await addBallast();
  await expect.poll(status).toBe('fallback');
  expect(
    await page.evaluate(() =>
      window.__SKYTOPIA_TEST__!.getState().game.buildings.some((b) => b.id === 9000),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('same-city WebGL counters and resource return after visual upgrade', async ({
  page,
  browser,
}) => {
  test.skip(!process.env.SKYTOPIA_VISUAL_MEASURE, 'Manual software WebGL measurement');
  test.setTimeout(180000);
  await page.goto('/');
  await page.locator('summary').filter({ hasText: '실험실 · 구조와 도시' }).click();
  await page.getByRole('button', { name: '도시 운영 실험실' }).click();
  await page.getByRole('button', { name: '새 실험 시작', exact: true }).click();
  const snapshots = [];
  for (const mode of ['base', 'metropolis', 'return']) {
    await page.evaluate(async (mode) => {
      const s = window.__SKYTOPIA_TEST__!;
      if (mode === 'metropolis') {
        const path = '/src/tests/city-fixture.ts';
        const { metropolisFixture } = await import(path);
        s.setState({ game: { ...metropolisFixture(), labPaused: false }, analysisMode: 'off' });
      } else {
        s.getState().start('citylab');
        s.getState().cityExample('C');
        s.getState().cityAction((g) => ({ ...g, labPaused: false }));
      }
    }, mode);
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      window.__SKYTOPIA_PERF_RESET__ = true;
    });
    await page.waitForTimeout(8000);
    const report = await page.evaluate(() => {
      const p = window.__SKYTOPIA_PERF__!,
        g = window.__SKYTOPIA_TEST__!.getState().game,
        f = p.frames.slice(-100).sort((a, b) => a - b);
      return {
        ...p,
        frames: undefined,
        samples: f.length,
        medianFrameMs: f[Math.floor(f.length * 0.5)],
        p95FrameMs: f[Math.floor(f.length * 0.95)],
        averageFps: 1000 / (f.reduce((a, b) => a + b, 0) / f.length),
        platforms: g.platforms.length,
        buildings: g.buildings.length,
        population: g.population,
      };
    });
    snapshots.push({ mode, ...report });
    expect(report.drawCalls).toBeGreaterThan(0);
    if (mode === 'metropolis')
      await page.screenshot({ path: 'test-results/phase10-metropolis.png' });
  }
  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/phase10-performance.json',
    JSON.stringify(
      {
        browser: browser.version(),
        renderer:
          'SwiftShader software WebGL, 1440x900, DPR 1, medium, development build, active economy',
        snapshots,
      },
      null,
      2,
    ),
  );
});
