import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';

test('three and six cities with one active software WebGL view', async ({ page, browser }) => {
  test.skip(!process.env.SKYTOPIA_WORLD_MEASURE, 'Manual software-WebGL measurement');
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const snapshots = [];
  for (const count of [3, 6]) {
    await page.evaluate(async (count) => {
      const scenarioPath = '/src/game/world/scenarios.ts',
        statePath = '/src/game/world/state.ts';
      const scenario = await import(scenarioPath),
        state = await import(statePath),
        store = window.__SKYTOPIA_TEST__!;
      let g = state.createWorld(scenario.worldCapital(store.getState().settings));
      const w = state.syncWorld(g);
      w.nextId = 100;
      const template = w.cities[0];
      w.cities = Array.from({ length: count }, (_, i) => {
        const c = structuredClone(template);
        c.id = `city-${i + 1}`;
        c.island = w.islands[i].id;
        w.islands[i].discovered = true;
        c.game.worldContext = state.context(w, c);
        return c;
      });
      w.view = 'city';
      g = state.attachWorld(g, w);
      store.setState({
        game: g,
        settings: g.settings,
        screen: 'playing',
        selected: null,
        analysisMode: 'off',
        cameraFocus: null,
        cameraMode: 'free',
      });
    }, count);
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      window.__SKYTOPIA_PERF_RESET__ = true;
    });
    await page.waitForTimeout(6500);
    snapshots.push(
      await page.evaluate(
        (count) => ({
          cities: count,
          worldClock: window.__SKYTOPIA_TEST__!.getState().game.world!.clock,
          ...window.__SKYTOPIA_PERF__,
        }),
        count,
      ),
    );
    await page.screenshot({ path: `test-results/phase7-active-${count}.png` });
    await page.getByRole('button', { name: /^세계 지도 ·/ }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  writeFileSync(
    'test-results/world-browser-performance.json',
    JSON.stringify(
      {
        browser: browser.version(),
        renderer:
          'SwiftShader; 1440x900; DPR1; development build; active simulation; authored capital copies; no active disaster or freight',
        snapshots: snapshots.map((s) => {
          const frames = s.frames!.sort((a, b) => a - b);
          return {
            ...s,
            frames: undefined,
            samples: frames.length,
            medianMs: frames[Math.floor(frames.length * 0.5)],
            p95Ms: frames[Math.floor(frames.length * 0.95)],
            averageFps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
          };
        }),
      },
      null,
      2,
    ),
  );
});
