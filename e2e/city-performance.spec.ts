import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
test('measured active metropolis render and resource release', async ({ page, browser }) => {
  test.skip(!process.env.SKYTOPIA_CITY_MEASURE, 'Manual software-WebGL measurement');
  test.setTimeout(180000);
  await page.goto('/');
  await page.locator('summary').filter({ hasText: '실험실 · 구조와 도시' }).click();
  await page.getByRole('button', { name: '도시 운영 실험실' }).click();
  await page.getByRole('button', { name: '새 실험 시작' }).click();
  const snapshots = [];
  for (const mode of ['base', 'metropolis', 'return']) {
    await page.evaluate(async (mode) => {
      const store = window.__SKYTOPIA_TEST__!;
      if (mode === 'metropolis') {
        const path = '/src/tests/city-fixture.ts';
        const { metropolisFixture } = await import(path);
        const g = metropolisFixture();
        store.setState({ game: { ...g, labPaused: false }, analysisMode: 'off' });
      } else {
        store.getState().start('citylab');
        store.getState().cityExample('C');
        store.getState().cityAction((g) => ({ ...g, labPaused: false }));
      }
    }, mode);
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      window.__SKYTOPIA_PERF_RESET__ = true;
    });
    await page.waitForTimeout(8000);
    const report = await page.evaluate(async () => {
      const analysisPath = '/src/game/analysis.ts';
      const { analyze } = await import(analysisPath);
      const p = window.__SKYTOPIA_PERF__!,
        g = window.__SKYTOPIA_TEST__!.getState().game,
        frames = p.frames.slice(-100).sort((a, b) => a - b);
      return {
        ...p,
        frames: undefined,
        samples: frames.length,
        medianFrameMs: frames[Math.floor(frames.length * 0.5)],
        p95FrameMs: frames[Math.floor(frames.length * 0.95)],
        averageFps: 1000 / (frames.reduce((s, v) => s + v, 0) / frames.length),
        platforms: g.platforms.length,
        buildings: g.buildings.length,
        population: g.population,
        simulationSeconds: g.elapsed,
        loss: g.structure.loss,
        critical: analyze(g).structural.critical,
      };
    });
    snapshots.push({ mode, ...report });
    expect(report.drawCalls).toBeGreaterThan(0);
    expect(report.loss).toBeNull();
    expect(report.critical).toBeNull();
    if (mode === 'metropolis')
      await page.screenshot({ path: 'test-results/phase3-metropolis.png' });
  }
  writeFileSync(
    'test-results/city-browser-performance.json',
    JSON.stringify(
      {
        browser: browser.version(),
        renderer:
          'SwiftShader software WebGL, 1440×900, DPR 1, shadows on, development build, active economy and representative traffic',
        snapshots,
      },
      null,
      2,
    ),
  );
});
