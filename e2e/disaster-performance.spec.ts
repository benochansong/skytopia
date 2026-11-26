import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
test('active storm and compound disaster software WebGL measurements', async ({
  page,
  browser,
}) => {
  test.skip(!process.env.SKYTOPIA_DISASTER_MEASURE, 'Manual software-WebGL measurement');
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const snapshots = [];
  for (const example of ['A', 'F']) {
    await page.evaluate(async (example) => {
      const scenarioPath = '/src/game/disasters/scenarios.ts',
        schedulerPath = '/src/game/disasters/scheduler.ts';
      const scenario = await import(scenarioPath),
        scheduler = await import(schedulerPath),
        store = window.__SKYTOPIA_TEST__!;
      let game = scenario.disasterExample(store.getState().settings, example);
      game = scheduler.forecast(game, example === 'F' ? 'compound' : 'storm', {
        ...game.disaster.config,
      });
      game = {
        ...game,
        labPaused: false,
        settings: { ...game.settings, stormParticles: 200 },
        disaster: { ...game.disaster, phase: 'active', clock: 12, view: 'shield' },
      };
      game.disaster.weather = scheduler.weatherAt(game, 1);
      store.setState({
        game,
        settings: game.settings,
        screen: 'playing',
        selected: null,
        analysisMode: 'off',
        cameraFocus: null,
        cameraMode: 'free',
      });
    }, example);
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      window.__SKYTOPIA_PERF_RESET__ = true;
    });
    await page.waitForTimeout(6500);
    snapshots.push(
      await page.evaluate((example) => {
        const game = window.__SKYTOPIA_TEST__!.getState().game;
        return {
          example,
          buildings: game.buildings.length,
          platforms: game.platforms.length,
          particles: game.settings.stormParticles,
          elapsed: game.elapsed,
          ...window.__SKYTOPIA_PERF__,
        };
      }, example),
    );
    await page.screenshot({ path: 'test-results/phase6-weather-' + example + '.png' });
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().campaignMap());
    await expect(page.locator('canvas')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  const report = {
    browser: browser.version(),
    renderer:
      'SwiftShader; 1440x900; DPR1; shadows on; development build; active disaster simulation; 200 rain particles maximum',
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
  };
  writeFileSync('test-results/disaster-browser-performance.json', JSON.stringify(report, null, 2));
});
