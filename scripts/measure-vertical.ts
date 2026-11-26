import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { verticalStressFixture } from './vertical-fixture';
import { loadStage } from '../src/game/campaign/loader';
import { DEFAULT_SETTINGS } from '../src/data/rules';
import { advanceDialogue } from '../src/game/campaign/runtime';
import { analyze } from '../src/game/analysis';
import { decodeSave } from '../src/game/storage';
import { tick } from '../src/game/engine';
function measure(name: string, fn: () => unknown, n = 20) {
  for (let i = 0; i < 3; i++) fn();
  const times = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    name,
    samples: n,
    medianMs: times[Math.floor(n * 0.5)],
    p95Ms: times[Math.floor(n * 0.95)],
  };
}
const fixtures = [advanceDialogue(loadStage(20, DEFAULT_SETTINGS), true), verticalStressFixture()];
const report = {
  environment: { node: process.version, cpu: cpus()[0]?.model, platform: process.platform },
  fixtures: fixtures.map((g, i) => {
    const raw = JSON.stringify(g);
    if (!decodeSave(raw).ok) throw Error('Invalid benchmark fixture ' + i);
    return {
      name: i ? 'four-floor synthetic stress' : 'stage20 initial city',
      platforms: g.platforms.length,
      buildings: g.buildings.length,
      floors: new Set(g.platforms.map((p) => p.y)).size,
      population: g.population,
      saveBytes: Buffer.byteLength(raw),
      results: [
        measure('uncached structure and operating networks', () =>
          analyze({ ...g, buildings: [...g.buildings], platforms: [...g.platforms] }),
        ),
        measure('quarter-second engine', () => tick(g, 0.25)),
        measure('validated save decode', () => decodeSave(raw)),
      ],
    };
  }),
};
writeFileSync('docs/performance-vertical.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
