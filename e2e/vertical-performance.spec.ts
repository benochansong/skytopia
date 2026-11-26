import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
test('vertical city and four-floor stress WebGL measurements', async ({ page, browser }) => {
  test.skip(!process.env.SKYTOPIA_VERTICAL_MEASURE, 'Manual software-WebGL measurement');
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const snapshots = [];
  for (const kind of ['campaign', 'stress']) {
    await page.evaluate(async (kind) => {
      const path =
        kind === 'stress' ? '/scripts/vertical-fixture.ts' : '/src/game/vertical/scenarios.ts';
      const mod = await import(path);
      const s = window.__SKYTOPIA_TEST__!;
      const game =
        kind === 'stress'
          ? mod.verticalStressFixture()
          : mod.verticalMetropolis(s.getState().settings);
      game.labPaused = false;
      game.city.speed = 1;
      s.setState({
        game,
        screen: 'playing',
        selected: null,
        analysisMode: 'off',
        cameraFocus: null,
        cameraMode: 'free',
      });
    }, kind);
    await page.waitForTimeout(2500);
    for (const view of ['all', 'cutaway', 'structure'] as const) {
      await page.evaluate((view) => {
        window.__SKYTOPIA_TEST__!.getState().setView(view);
        window.__SKYTOPIA_PERF_RESET__ = true;
      }, view);
      await page.waitForTimeout(6000);
      snapshots.push(
        await page.evaluate(
          ({ kind, view }) => {
            const g = window.__SKYTOPIA_TEST__!.getState().game;
            return {
              kind,
              view,
              platforms: g.platforms.length,
              buildings: g.buildings.length,
              floors: new Set(g.platforms.map((p) => p.y)).size,
              elapsed: g.elapsed,
              ...window.__SKYTOPIA_PERF__,
            };
          },
          { kind, view },
        ),
      );
    }
    await page.screenshot({ path: 'test-results/phase5-' + kind + '-structure.png' });
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().campaignMap());
    await expect(page.locator('canvas')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  const report = {
    browser: browser.version(),
    renderer:
      'SwiftShader; 1440x900; DPR1; shadows on; development build; active simulation; unbalanced synthetic stress fixture',
    snapshots: snapshots.map((s) => {
      const times = s.frames!.sort((a, b) => a - b);
      return {
        ...s,
        frames: undefined,
        samples: times.length,
        medianMs: times[Math.floor(times.length * 0.5)],
        p95Ms: times[Math.floor(times.length * 0.95)],
        averageFps: 1000 / (times.reduce((a, b) => a + b, 0) / times.length),
      };
    }),
  };
  writeFileSync('test-results/vertical-browser-performance.json', JSON.stringify(report, null, 2));
});
