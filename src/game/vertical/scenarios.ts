import type { Game, Kind, Settings, Shape } from '../../types/game';
import { analyze } from '../analysis';
import { volume } from './geometry';
import { newGame } from '../engine';
import { freshVertical } from '../../types/vertical';
import { makePlatform, makeBuilding } from '../stability/state';
import { atFloor, key, cellsOf, neighbors } from '../grid';
import { freshCity } from '../city/state';
import { reconcileResidents } from '../city/population';
import { BLOCKS } from '../../data/rules';
export function verticalBase(settings: Settings): Game {
  let g = newGame('mission', 2478, settings);
  g = {
    ...g,
    mode: 'citylab',
    campaign: undefined,
    vertical: freshVertical(),
    buildings: [],
    platforms: [],
    nextId: 1,
    population: 10,
    resources: 600,
    won: false,
    labPaused: true,
    city: { ...freshCity(true, 600, settings.difficulty), credits: 1000, unlimited: true },
    structure: { ...g.structure, grace: 40 },
  };
  for (let x = -3; x <= 4; x++)
    for (let z = -3; z <= 3; z++)
      g.platforms.push(makePlatform(atFloor(x, z), 'platform', 0, 2, x <= 2 && z <= 2));
  for (let x = -3; x <= 3; x++) add(g, 'road', x, -1);
  for (let z = 0; z <= 3; z++) add(g, 'road', 1, z);
  add(g, 'power', 0, -2);
  add(g, 'home', -1, -2);
  add(g, 'home', -2, -2);
  add(g, 'farm', 2, 0);
  add(g, 'park', 2, 1);
  add(g, 'liftSmall', 2, 2);
  add(g, 'road', -1, 0);
  add(g, 'powerLink', 0, 2);
  add(g, 'powerLink', -1, 2);
  g.active = { kind: 'column', shape: 'single', rotation: 0 };
  g.next = ['deck', 'stairs', 'home'].map((k) => ({
    kind: k as Kind,
    shape: BLOCKS[k as Kind].shapes[0],
    rotation: 0,
  }));
  g.cursor = atFloor(-2, 1);
  return reconcileResidents(g);
}
export function add(
  g: Game,
  kind: Kind,
  x: number,
  z: number,
  y = 0,
  shape: Shape = BLOCKS[kind].shapes[0],
  rotation = 0,
) {
  const c = atFloor(x, z, y);
  g.buildings = [...g.buildings, makeBuilding({ kind, shape, rotation }, c, g.nextId++)];
}
function deck(g: Game, x: number, z: number, y: number) {
  if (!g.platforms.some((p) => key(p) === key(atFloor(x, z, y))))
    g.platforms = [...g.platforms, makePlatform(atFloor(x, z, y), 'deck', g.nextId++)];
}
export function verticalExample(settings: Settings, example?: 'A' | 'B' | 'C' | 'D' | 'E'): Game {
  let g = verticalBase(settings);
  if (!example) return g;
  g.vertical!.example = example;
  if (['A', 'B', 'E'].includes(example)) {
    const floors = example === 'B' ? 1 : 3;
    for (let y = 1; y <= floors; y++) {
      add(g, example === 'B' ? 'column' : 'reinforcedColumn', -2, 1, y - 1);
      for (let x = -3; x <= -1; x++) for (let z = 1; z <= 2; z++) deck(g, x, z, y);
      add(g, 'stairs', -1, 1, y - 1);
      add(g, 'verticalRelay', -2, 2, y - 1);
      if (y === floors) add(g, example === 'B' ? 'towerHome' : 'home', -1, 2, y);
    }
    if (example === 'E') {
      const b = g.buildings.find((b) => b.kind === 'reinforcedColumn' && b.y === 0)!;
      b.durability = 10;
      add(g, 'towerHome', -3, 1, 3);
      g.structure.grace = 0;
    }
  }
  if (example === 'C') {
    g.buildings = g.buildings.filter((b) => b.kind !== 'park');
    for (const x of [-3, 2]) {
      add(g, 'reinforcedColumn', x, 1);
      for (const xx of x < 0 ? [-3, -2] : [1, 2]) for (const z of [1, 2]) deck(g, xx, z, 1);
    }
    add(g, 'stairs', -2, 2);
    add(g, 'verticalRelay', -3, 2);
    for (const x of [-3, -2, -1, 0]) add(g, 'road', x, 3);
    add(g, 'bridge', -2, 1, 1);
    add(g, 'home', 2, 2, 1);
    add(g, 'road', 1, 2, 1);
  }
  if (example === 'D') {
    add(g, 'hanger', 3, 1);
    for (const x of [3, 4])
      for (const z of [1, 2]) {
        const p = makePlatform(atFloor(x, z, -1), 'suspendedDeck', g.nextId++);
        g.platforms = [...g.platforms, p];
      }
    add(g, 'verticalRelay', 3, 1, -1);
    add(g, 'cargoElevator', 4, 1, -1);
    deck(g, 4, 3, -1);
    add(g, 'factory', 3, 2, -1);
    add(g, 'road', 4, 2, -1);
    add(g, 'liftSmall', 4, 3, -1);
    add(g, 'apartment', -3, 0);
    add(g, 'apartment', 2, -3);
    g.population = 30;
    for (const c of [
      [3, 0],
      [4, 0],
      [3, -2],
    ])
      add(g, 'road', c[0], c[1]);
  }
  return reconcileResidents(g);
}
export function verticalMetropolis(settings: Settings): Game {
  let g = verticalBase(settings);
  g = {
    ...g,
    platforms: [],
    buildings: [],
    nextId: 1,
    population: 250,
    city: { ...g.city, residents: {}, displaced: 250 },
  };
  for (let x = -6; x <= 6; x++)
    for (let z = -6; z <= 6; z++)
      g.platforms.push(
        makePlatform(atFloor(x, z), 'platform', 0, 2, x >= -3 && x <= 2 && z >= -3 && z <= 2),
      );
  for (let x = -6; x <= 6; x++)
    for (let z = -6; z <= 6; z++)
      if ((Math.abs(x) === 6 || z % 3 === 0) && !(x === 0 && z === 0)) add(g, 'road', x, z);
  add(g, 'road', 0, -1);
  add(g, 'road', 1, -1);
  add(g, 'road', -5, 1);
  for (const x of [-2, 3]) {
    for (let xx = x - 1; xx <= x + 1; xx++) for (const z of [1, 2]) deck(g, xx, z, 1);
    add(g, 'industrialColumn', x, 1, 0, 'single');
    add(g, 'reinforcedColumn', x, 2, 0);
    add(g, 'stairs', x - 1, 1);
    add(g, 'verticalRelay', x - 1, 2);
    add(g, 'road', x, 1, 1);
    add(g, 'road', x, 2, 1);
    add(g, 'towerHome', x + 1, 2, 1);
    add(g, 'liftSmall', x - 1, 2, 1);
  }
  add(g, 'roadBridge', -1, 1, 1);
  for (const x of [-5, -4])
    for (const z of [1, 2, 3]) {
      const p = makePlatform(atFloor(x, z, -1), 'suspendedDeck', g.nextId++);
      g.platforms = [...g.platforms, p];
    }
  add(g, 'hanger', -4, 2);
  add(g, 'cargoElevator', -5, 1, -1);
  add(g, 'verticalRelay', -4, 1, -1);
  add(g, 'factory', -4, 2, -1);
  add(g, 'road', -5, 2, -1);
  add(g, 'road', -5, 3, -1);
  add(g, 'liftSmall', -4, 3, -1);
  const plot = (kind: Kind, level = 0) => {
    const occupied = new Set(['0,0', ...g.buildings.flatMap((b) => volume(b, b.origin).map(key))]);
    const roads = new Set(
      g.buildings.filter((b) => b.kind === 'road' && b.y === 0).map((b) => key(b.origin)),
    );
    for (const p of [...g.platforms.filter((p) => p.y === 0)].sort(
      (a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z),
    )) {
      const piece = { kind, shape: BLOCKS[kind].shapes[0], rotation: 0 };
      const cells = cellsOf(piece, p);
      if (
        cells.every((c) => g.platforms.some((p) => key(p) === key(c)) && !occupied.has(key(c))) &&
        cells.some((c) => neighbors(c).some((n) => roads.has(key(n))))
      ) {
        add(g, kind, p.x, p.z);
        g.buildings[g.buildings.length - 1].level = level;
        return;
      }
    }
    throw Error('No vertical metropolis plot ' + kind);
  };
  for (let i = 0; i < 3; i++) plot('housingEstate', 2);
  for (let i = 0; i < 3; i++) plot('advancedPower', 2);
  for (let i = 0; i < 3; i++) plot('greenhouse', 2);
  g = reconcileResidents(g);
  for (let i = 0; i < 6; i++) plot('liftLarge', 2);
  plot('clinic');
  plot('park');
  plot('plaza');
  plot('warehouse');
  // Rebalance the authored starter levitators using the same physical evaluator as play.
  for (const old of g.buildings.filter((b) => b.kind === 'liftLarge' && b.y === 0)) {
    const other = g.buildings.filter((b) => b.id !== old.id),
      occupied = new Set(['0,0', ...other.flatMap((b) => volume(b, b.origin).map(key))]);
    let best = old,
      bestScore = -Infinity;
    for (const p of g.platforms.filter((p) => p.y === 0)) {
      const cells = cellsOf(old, p);
      if (!cells.every((c) => g.platforms.some((p) => key(p) === key(c)) && !occupied.has(key(c))))
        continue;
      const candidate = { ...old, origin: atFloor(p.x, p.z) },
        next = { ...g, buildings: [...other, candidate] },
        stats = analyze(next);
      if ((stats.powerRatios.get(old.id) ?? 0) < 1) continue;
      const score = stats.stability - stats.structural.unsafeEdges * 3;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    g = { ...g, buildings: [...other, best] };
  }
  return reconcileResidents(g);
}
