import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { newGame } from '../src/game/engine';
import { makeBuilding, makePlatform } from '../src/game/stability/state';
import { evaluateStructure } from '../src/game/stability/evaluator';
import { analyze } from '../src/game/analysis';
import { structureStep } from '../src/game/stability/simulation';
import { decodeSave } from '../src/game/storage';
let g = newGame('lab', 2026);
const platforms = Array.from({ length: 256 }, (_, i) =>
  makePlatform(
    { x: (i % 16) - 8, z: Math.floor(i / 16) - 8 },
    'metalPlatform',
    i,
    1,
    (i % 16) - 8 >= -3 &&
      (i % 16) - 8 <= 2 &&
      Math.floor(i / 16) - 8 >= -3 &&
      Math.floor(i / 16) - 8 <= 2,
  ),
);
const buildings = platforms
  .filter((p) => p.x !== 0 || p.z !== 0)
  .map((p, i) =>
    makeBuilding(
      {
        kind: p.x % 3 === 0 ? 'road' : i % 5 === 0 ? 'power' : i % 7 === 0 ? 'liftSmall' : 'home',
        shape: 'single',
        rotation: 0,
      },
      p,
      i + 1,
    ),
  );
g = { ...g, platforms, buildings, nextId: 300, labPaused: false };
function measure(name: string, fn: () => unknown, n = 200) {
  for (let i = 0; i < 20; i++) fn();
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
    maxMs: times.at(-1),
  };
}
const serialized = JSON.stringify(g);
const report = {
  environment: { node: process.version, cpu: cpus()[0]?.model, platform: process.platform },
  fixture: { platforms: platforms.length, buildings: buildings.length, bytes: serialized.length },
  results: [
    measure('full structural evaluation', () => evaluateStructure(g)),
    measure('cached analysis', () => analyze(g), 10000),
    measure(
      'fixed structural step (snapshot)',
      () => structureStep({ ...g, structure: { ...g.structure, grace: 0 } }),
      100,
    ),
    measure('validate and reconstruct save', () => decodeSave(serialized), 100),
  ],
};
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/structure-performance.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
