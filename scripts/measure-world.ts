import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { worldCapital } from '../src/game/world/scenarios';
import { createWorld, attachWorld, context, syncWorld } from '../src/game/world/state';
import { tick } from '../src/game/engine';
import { decodeWorld } from '../src/game/world/storage';

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
const results = [3, 6].map((count) => {
  let g = createWorld(worldCapital());
  const w = syncWorld(g);
  w.nextId = 100;
  w.cities = Array.from({ length: count }, (_, i) => {
    const c = structuredClone(w.cities[0]);
    c.id = `city-${i + 1}`;
    c.island = w.islands[i].id;
    w.islands[i].discovered = true;
    c.game.worldContext = context(w, c);
    return c;
  });
  w.view = 'map';
  g = attachWorld(g, w);
  const raw = JSON.stringify(syncWorld(g));
  if (!decodeWorld(raw).ok) throw Error('Invalid world fixture');
  const cityView = { ...g, world: { ...g.world!, view: 'city' as const } };
  return {
    cities: count,
    buildingsPerCity: g.buildings.length,
    saveBytes: Buffer.byteLength(raw),
    results: [
      measure('map, one simulated second', () => tick(g, 1)),
      measure('active city, one simulated second', () => tick(cityView, 1)),
      measure('validated world restore', () => decodeWorld(raw)),
    ],
  };
});
writeFileSync(
  'docs/performance-world.json',
  JSON.stringify(
    {
      environment: { node: process.version, cpu: cpus()[0]?.model, platform: process.platform },
      scope:
        'Three or six independent copies of the authored capital; no disasters or active freight. CPU only, not rendering FPS.',
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results));
