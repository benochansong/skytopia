import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
test('campaign scene release, reentry and active final city measurement', async ({
  page,
  browser,
}) => {
  test.skip(!process.env.SKYTOPIA_CAMPAIGN_MEASURE, 'Manual software-WebGL measurement');
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const snapshots = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.evaluate(() => {
      window.__SKYTOPIA_TEST__!.getState().startStage(1);
      window.__SKYTOPIA_TEST__!.getState().dialogueNext(true);
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      window.__SKYTOPIA_PERF_RESET__ = true;
    });
    await page.waitForTimeout(4000);
    snapshots.push(
      await page.evaluate(() => ({
        mode: 'stage1',
        ...window.__SKYTOPIA_PERF__,
        elapsed: window.__SKYTOPIA_TEST__!.getState().game.elapsed,
      })),
    );
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().campaignMap());
    await expect(page.locator('canvas')).toHaveCount(0);
    const before = await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.elapsed);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.elapsed)).toBe(
      before,
    );
  }
  await page.evaluate(async () => {
    const path = '/src/tests/campaign-solutions.ts';
    const { solveCampaign } = await import(path);
    const g = solveCampaign(15);
    if (!g.campaign.result || g.structure.loss) throw Error('Final city did not complete safely');
    g.campaign.continued = true;
    window.__SKYTOPIA_TEST__!.setState({
      game: g,
      screen: 'playing',
      selected: null,
      analysisMode: 'off',
    });
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    window.__SKYTOPIA_PERF_RESET__ = true;
  });
  await page.waitForTimeout(8000);
  snapshots.push(
    await page.evaluate(() => ({
      mode: 'stage15-continued',
      population: window.__SKYTOPIA_TEST__!.getState().game.population,
      platforms: window.__SKYTOPIA_TEST__!.getState().game.platforms.length,
      buildings: window.__SKYTOPIA_TEST__!.getState().game.buildings.length,
      ...window.__SKYTOPIA_PERF__,
      elapsed: window.__SKYTOPIA_TEST__!.getState().game.elapsed,
    })),
  );
  await page.screenshot({ path: 'test-results/phase4-civilization.png' });
  expect(
    await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().game.structure.loss),
  ).toBeNull();
  expect(errors).toEqual([]);
  const report = {
    browser: browser.version(),
    renderer: 'SwiftShader, 1440×900, DPR1, shadows on, development build',
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
  writeFileSync('test-results/campaign-browser-performance.json', JSON.stringify(report, null, 2));
});
