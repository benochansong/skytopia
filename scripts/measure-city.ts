import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { metropolisFixture } from '../src/tests/city-fixture';
import { cityReport } from '../src/game/city/report';
import { economyStep } from '../src/game/city/simulation';
import { populationStep } from '../src/game/city/population';
import { structureStep } from '../src/game/stability/simulation';
import { tick } from '../src/game/engine';
import { analyze } from '../src/game/analysis';
import { decodeSave } from '../src/game/storage';
const g = { ...metropolisFixture(), labPaused: false };
function measure(name: string, fn: () => unknown, n = 100) {
  for (let i = 0; i < 10; i++) fn();
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
const serialized = JSON.stringify(g),
  r = cityReport(g),
  s = analyze(g);
const report = {
  environment: { node: process.version, cpu: cpus()[0]?.model, platform: process.platform },
  fixture: {
    population: g.population,
    platforms: g.platforms.length,
    buildings: g.buildings.length,
    housing: r.housing,
    generation: r.generation,
    demand: r.demand,
    foodProduction: r.foodProduction,
    foodConsumption: r.foodConsumption,
    stability: s.stability,
    critical: s.structural.critical,
    mass: s.mass,
    lift: s.lift,
    bytes: serialized.length,
  },
  results: [
    measure('economy one second', () => economyStep(g)),
    measure('population five second update', () => populationStep(g)),
    measure('structural quarter second', () => structureStep(g)),
    measure('combined quarter second', () => tick(g, 0.25)),
    measure('cached city report', () => cityReport(g), 5000),
    measure('validated save decode', () => decodeSave(serialized)),
  ],
};
mkdirSync('docs', { recursive: true });
mkdirSync('test-results', { recursive: true });
writeFileSync('docs/performance-city.json', JSON.stringify(report, null, 2));
writeFileSync('test-results/city-benchmark-fixture.json', serialized);
console.log(JSON.stringify(report, null, 2));
