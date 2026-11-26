import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { DEFAULT_SETTINGS } from '../src/data/rules';
import { disasterExample } from '../src/game/disasters/scenarios';
import { forecast, weatherAt } from '../src/game/disasters/scheduler';
import { analyze } from '../src/game/analysis';
import { tick } from '../src/game/engine';
import { decodeSave } from '../src/game/storage';
function measure(name: string, fn: () => unknown) {
  const times: number[] = [];
  for (let i = 0; i < 23; i++) {
    const start = performance.now();
    fn();
    if (i >= 3) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { name, samples: times.length, medianMs: times[10], p95Ms: times[19] };
}
const results = (['A', 'F'] as const).map((example) => {
  let g = forecast(disasterExample(DEFAULT_SETTINGS, example));
  g = { ...g, labPaused: false, disaster: { ...g.disaster!, phase: 'active', clock: 19 } };
  g = { ...g, disaster: { ...g.disaster!, weather: weatherAt(g, 1) } };
  const raw = JSON.stringify(g);
  if (!decodeSave(raw).ok) throw Error('Invalid fixture');
  return {
    example,
    buildings: g.buildings.length,
    platforms: g.platforms.length,
    saveBytes: Buffer.byteLength(raw),
    results: [
      measure('uncached structure', () =>
        analyze({ ...g, buildings: [...g.buildings], platforms: [...g.platforms] }),
      ),
      measure('quarter-second active disaster', () => tick(g, 0.25)),
      measure('validated save', () => decodeSave(raw)),
    ],
  };
});
writeFileSync(
  'docs/performance-disaster.json',
  JSON.stringify(
    {
      environment: { node: process.version, cpu: cpus()[0]?.model, platform: process.platform },
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results));
