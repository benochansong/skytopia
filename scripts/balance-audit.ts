import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DEFAULT_SETTINGS, BLOCKS, PHYSICAL, OPERATION, KINDS, ONLINE } from '../src/data/rules';
import { newGame, tick } from '../src/game/engine';
import { cityReport } from '../src/game/city/report';
import { analyze } from '../src/game/analysis';
import { draw } from '../src/game/supply';
import { emergencyFood, emergencyPower } from '../src/game/city/actions';
import { verticalExample } from '../src/game/vertical/scenarios';
import { forecast } from '../src/game/disasters/scheduler';
import { disasterExample } from '../src/game/disasters/scenarios';
import { worldExample } from '../src/game/world/scenarios';
import { syncWorld, attachWorld } from '../src/game/world/state';
import { adjustStock, inventory } from '../src/game/city/inventory';
import { cellsOf } from '../src/game/grid';
import { startResearch } from '../src/game/world/research';
import { scoreCity, onlineCity, newHand, advanceHand } from '../src/game/online/match';
import type { Game, Supply, Kind } from '../src/types/game';

const label = process.argv[2] || 'after';
const seedList = [11, 2478, 70127];
const essential: Kind[] = ['platform', 'road', 'farm', 'power', 'liftSmall'];
const supply = Array.from({ length: 100 }, (_, seed) => {
  // The constructor selects the live offline version. Legacy and online stay separate.
  let state: Supply = { ...newGame('mission', seed).supply, seed, bag: [], draws: 0 };
  if (state.recent) state.recent = [];
  const counts: Record<string, number> = {},
    gaps: Record<string, number> = {};
  const last = Object.fromEntries(essential.map((k) => [k, -1]));
  let previous = '',
    run = 0,
    longestRun = 0;
  for (let i = 0; i < 1000; i++) {
    const [piece, next] = draw(state, false, {
      needsLift: true,
      needsSpace: true,
      needsRoad: true,
      city: { tier: 1, needFood: true, needPower: true },
    });
    state = next;
    const k = piece.kind;
    counts[k] = (counts[k] || 0) + 1;
    for (const e of essential) gaps[e] = Math.max(gaps[e] || 0, i - last[e]);
    if (k in last) last[k] = i;
    run = previous === k ? run + 1 : 1;
    previous = k;
    longestRun = Math.max(longestRun, run);
  }
  return { seed, counts, gaps, longestRun, version: state.version ?? 1 };
});
const snapshot = (g: Game) => {
  const r = cityReport(g),
    s = analyze(g);
  return {
    population: g.population,
    housing: r.housing,
    food: r.stocks.food,
    materials: r.stocks.materials,
    aether: r.stocks.aether,
    credits: g.city.credits,
    foodNet: r.foodProduction - r.foodConsumption,
    powerDeficit: r.deficit,
    employed: r.employed,
    workforce: r.workforce,
    incomeNet: r.net,
    stability: s.stability,
    mass: s.mass,
    lift: s.lift,
    stress: s.structural.worst?.ratio ?? 0,
    loss: g.structure.loss?.reason ?? null,
    collapsed: g.structure.collapsedCount,
    buildings: g.buildings.length,
    warnings: r.advice.map((a) => a.id),
    delivered: g.world?.routes.reduce((n, r) => n + r.delivered, 0) ?? 0,
    research: g.world?.research.completed ?? [],
    score: scoreCity(g).total,
  };
};
const scenarios: [string, (seed: number) => Game, number][] = [
  ['initial-growth', (s) => newGame('mission', s, DEFAULT_SETTINGS, 5), 60],
  ['residential', (s) => newGame('mission', s, DEFAULT_SETTINGS, 6), 60],
  ['industry', (s) => newGame('mission', s, DEFAULT_SETTINGS, 7), 60],
  [
    'power-shortage',
    (s) => {
      const g = newGame('citylab', s);
      return {
        ...g,
        buildings: g.buildings.map((b) => ({
          ...b,
          enabled: BLOCKS[b.kind].power > 0 ? false : b.enabled,
        })),
      };
    },
    30,
  ],
  [
    'food-shortage',
    (s) => {
      const g = newGame('citylab', s);
      return {
        ...g,
        city: { ...g.city, stocks: { core: { food: 0, materials: 100, aether: 30 } } },
        buildings: g.buildings.map((b) => ({
          ...b,
          enabled: OPERATION[b.kind].food > 0 ? false : b.enabled,
        })),
      };
    },
    60,
  ],
  [
    'labor-shortage',
    (s) => {
      const g = newGame('citylab', s);
      return { ...g, population: 2, city: { ...g.city, residents: {}, displaced: 2 } };
    },
    30,
  ],
  ['overload', () => verticalExample(DEFAULT_SETTINGS, 'B'), 30],
  [
    'emergency',
    (s) => emergencyPower(emergencyFood(newGame('mission', s, DEFAULT_SETTINGS, 5))),
    30,
  ],
  ['vertical', () => verticalExample(DEFAULT_SETTINGS, 'C'), 30],
  [
    'storm',
    () => forecast(disasterExample(DEFAULT_SETTINGS, 'B'), 'storm', { warning: 5, duration: 30 }),
    60,
  ],
  [
    'meteor',
    () => forecast(disasterExample(DEFAULT_SETTINGS, 'D'), 'meteor', { warning: 5, duration: 30 }),
    60,
  ],
  [
    'recovery',
    () => forecast(disasterExample(DEFAULT_SETTINGS, 'E'), 'aether', { warning: 5, duration: 20 }),
    60,
  ],
  ['trade', () => worldExample('A'), 60],
  ['research', () => startResearch(worldExample('E'), 'efficientLift'), 60],
  ['online-score', (s) => onlineCity(s, false), 60],
];
if (label !== 'before')
  scenarios.push(
    [
      'research-running',
      () => {
        let g = worldExample('E');
        g = {
          ...g,
          city: { ...g.city, unlimited: false },
          world: { ...g.world!, research: { ...g.world!.research, points: 100 } },
        };
        return startResearch(g, 'strongFrame');
      },
      60,
    ],
    [
      'trade-delivery',
      () => {
        let g = worldExample('A');
        const w = syncWorld(g);
        w.cities = w.cities.map((c) => ({
          ...c,
          game: adjustStock(
            c.game,
            inventory(c.game).root,
            'aether',
            c.id === w.capital ? -1000 : 40,
          ),
        }));
        w.routes = w.routes.map((r) => ({
          ...r,
          resource: 'aether' as const,
          amount: 10,
          reserve: 0,
          target: 60,
        }));
        return attachWorld(g, w);
      },
      60,
    ],
    [
      'storm-unprotected',
      () => forecast(disasterExample(DEFAULT_SETTINGS, 'A'), 'storm', { warning: 5, duration: 30 }),
      60,
    ],
    [
      'overload-after-grace',
      () => {
        const g = verticalExample(DEFAULT_SETTINGS, 'B');
        return { ...g, structure: { ...g.structure, grace: 0 } };
      },
      60,
    ],
  );
const results = [];
for (const [name, create, seconds] of scenarios)
  for (const seed of seedList) {
    let g = create(seed);
    g = {
      ...g,
      labPaused: false,
      won: false,
      city: { ...g.city, unlimited: false, speed: 1 },
      ...(g.world
        ? {
            world: {
              ...g.world,
              cities: g.world.cities.map((c) => ({
                ...c,
                game: { ...c.game, city: { ...c.game.city, unlimited: false } },
              })),
            },
          }
        : {}),
    };
    const initial = snapshot(g);
    let timeTo50: number | null = g.population >= 50 ? 0 : null,
      firstFailure: number | null = null;
    const notices = new Set(initial.warnings);
    for (let i = 0; i < seconds * 4; i++) {
      g = tick(g, 0.25);
      if (timeTo50 === null && g.population >= 50) timeTo50 = (i + 1) / 4;
      if (firstFailure === null && g.structure.loss) firstFailure = (i + 1) / 4;
      if (i % 4 === 3) cityReport(g).advice.forEach((a) => notices.add(a.id));
    }
    const result = {
      name,
      seed,
      seconds,
      elapsed: g.elapsed,
      initial,
      final: snapshot(g),
      timeTo50,
      firstFailure,
      uniqueWarnings: [...notices],
    };
    results.push(result);
    console.log(name, seed, g.elapsed.toFixed(1), result.final.loss ?? 'survived');
  }
let handA = newHand(2478),
  handB = newHand(2478),
  equal = true;
for (let i = 0; i < 1000; i++) {
  equal &&= JSON.stringify(handA.active) === JSON.stringify(handB.active);
  handA = advanceHand(handA);
  handB = advanceHand(handB);
}
const facilities = KINDS.map((k) => ({
  kind: k,
  shape: BLOCKS[k].shapes[0],
  cells: cellsOf({ kind: k, shape: BLOCKS[k].shapes[0], rotation: 0 }).length,
  foodPerMass: OPERATION[k].food / Math.max(1, BLOCKS[k].mass),
  foodPerWorker: OPERATION[k].food / Math.max(1, OPERATION[k].jobs),
  mass: BLOCKS[k].mass,
  cost: PHYSICAL[k].cost,
  power: BLOCKS[k].power,
  workers: OPERATION[k].jobs,
  food: OPERATION[k].food,
  materials: OPERATION[k].materials,
  aether: OPERATION[k].aether,
  upkeep: OPERATION[k].upkeep,
}));
const report = {
  label,
  commit: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
  node: process.version,
  onlineVersion: ONLINE.version,
  note: 'Headless idle/resilience probes, not human playtests or win rates. Some authored fixtures use a fixed layout/seed. No player building policy.',
  supply,
  results,
  onlineEqual: equal,
  facilities,
};
mkdirSync('docs/verification', { recursive: true });
writeFileSync(`docs/verification/phase11-${label}.json`, JSON.stringify(report, null, 2));
const rows = results.map((r) =>
  [
    r.name,
    r.seed,
    r.seconds,
    r.elapsed,
    r.initial.population,
    r.final.population,
    r.final.food,
    r.final.credits,
    r.final.stability,
    r.final.collapsed,
    r.final.loss ?? '',
    r.timeTo50 ?? '',
    r.firstFailure ?? '',
  ].join(','),
);
writeFileSync(
  `docs/verification/phase11-${label}.csv`,
  [
    'scenario,seed,seconds,elapsed,startPopulation,population,food,credits,stability,collapsed,loss,timeTo50,firstFailure',
    ...rows,
  ].join('\n'),
);
