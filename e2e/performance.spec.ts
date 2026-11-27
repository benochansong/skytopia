import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
test('measured WebGL performance and resource release', async ({ page, browser }) => {
  test.skip(!process.env.SKYTOPIA_MEASURE, 'Manual measurement; no claimed hardware FPS target.');
  test.setTimeout(180000);
  await page.goto('/');
  await page.locator('summary').filter({ hasText: '실험실 · 구조와 도시' }).click();
  await page.getByRole('button', { name: '구조 실험실' }).click();
  await page.getByRole('button', { name: /EXPERIMENT A/ }).click();
  const snapshots: unknown[] = [];
  for (const size of [36, 256, 36]) {
    if (size === 256)
      await page.evaluate(async () => {
        const path = '/src/game/stability/state.ts';
        const { makeBuilding, makePlatform } = await import(path);
        const platforms = Array.from({ length: 256 }, (_, i) => {
          const x = (i % 16) - 8,
            z = Math.floor(i / 16) - 8;
          return makePlatform(
            { x, z },
            'metalPlatform',
            i,
            1,
            x >= -3 && x <= 2 && z >= -3 && z <= 2,
          );
        });
        const buildings = platforms
          .filter((p) => p.x !== 0 || p.z !== 0)
          .map((p, i) =>
            makeBuilding(
              {
                kind:
                  p.x % 3 === 0
                    ? 'road'
                    : i % 5 === 0
                      ? 'power'
                      : i % 7 === 0
                        ? 'liftSmall'
                        : 'home',
                shape: 'single',
                rotation: 0,
              },
              p,
              i + 1,
            ),
          );
        const store = window.__SKYTOPIA_TEST__!;
        store.setState((s) => ({
          analysisMode: 'load',
          game: { ...s.game, platforms, buildings, nextId: 300 },
        }));
      });
    else await page.evaluate(() => window.__SKYTOPIA_TEST__!.getState().resetLab());
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      window.__SKYTOPIA_PERF_RESET__ = true;
    });
    await page.waitForTimeout(8000);
    const report = await page.evaluate(() => {
      const p = window.__SKYTOPIA_PERF__!;
      const frames = p.frames.slice(-100).sort((a, b) => a - b);
      return {
        ...p,
        frames: undefined,
        samples: frames.length,
        medianFrameMs: frames[Math.floor(frames.length * 0.5)],
        p95FrameMs: frames[Math.floor(frames.length * 0.95)],
        averageFps: 1000 / (frames.reduce((s, v) => s + v, 0) / frames.length),
      };
    });
    snapshots.push({ platforms: size, ...report });
    expect(report.drawCalls).toBeGreaterThan(0);
    if (size === 256) await page.screenshot({ path: 'test-results/phase2-maximum-city.png' });
  }
  writeFileSync(
    'test-results/browser-performance.json',
    JSON.stringify(
      {
        browser: browser.version(),
        renderer:
          'SwiftShader software WebGL, 1440×900, DPR 1, shadows enabled, development build, paused lab',
        snapshots,
      },
      null,
      2,
    ),
  );
});
