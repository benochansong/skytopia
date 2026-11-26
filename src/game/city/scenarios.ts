import type { Game, Kind, Building } from '../../types/game';
import { BLOCKS, PHYSICAL } from '../../data/rules';
import { cellsOf, key, neighbors } from '../grid';
import { edgeKey } from '../stability/state';
import { makePlatform } from '../stability/state';
import { reconcileResidents } from './population';
export function configureLivingScenario(g: Game): Game {
  const advanced = g.mode === 'citylab' || g.missionId >= 6;
  const radius = advanced ? 5 : 3;
  const platforms: Game['platforms'] = [];
  for (let z = -radius; z <= radius; z++)
    for (let x = -radius; x <= radius; x++)
      platforms.push(
        makePlatform({ x, z }, 'platform', 0, 1, x >= -3 && x <= 2 && z >= -3 && z <= 2),
      );
  const buildings: Building[] = [];
  let nextId = 1;
  const add = (kind: Kind, x: number, z: number, level = 0) => {
    const b: Building = {
      id: nextId++,
      kind,
      shape: BLOCKS[kind].shapes[0],
      rotation: 0,
      origin: { x, z },
      y: 0,
      initial: true,
      durability: PHYSICAL[kind].hp,
      enabled: true,
      level,
    };
    buildings.push(b);
    return b;
  };
  // Three-cell street spacing leaves two-cell plots for larger facilities.
  for (let z = -radius; z <= radius; z++)
    for (let x = -radius; x <= radius; x++)
      if ((x === -radius || x === radius || z % 3 === 0) && !(x === 0 && z === 0))
        add('road', x, z);
  add('road', 0, -1);
  add('road', 1, -1);
  function plot(kind: Kind, level = 0) {
    const occupied = new Set(['0,0', ...buildings.flatMap((b) => cellsOf(b, b.origin).map(key))]);
    const roads = new Set(buildings.filter((b) => b.kind === 'road').map((b) => key(b.origin)));
    const options = platforms
      .map((p) => ({ x: p.x, z: p.z }))
      .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z) || a.z - b.z || a.x - b.x);
    for (const c of options) {
      const cells = cellsOf({ kind, shape: BLOCKS[kind].shapes[0], rotation: 0 }, c);
      if (
        cells.every(
          (p) => Math.abs(p.x) <= radius && Math.abs(p.z) <= radius && !occupied.has(key(p)),
        ) &&
        cells.some((p) => neighbors(p).some((n) => roads.has(key(n))))
      )
        return add(kind, c.x, c.z, level);
    }
    throw Error('Scenario has no plot for ' + kind);
  }
  if (advanced) {
    plot('housingEstate', 1);
    plot('housingEstate', 1);
    plot('housingEstate', 1);
    plot('advancedPower', 2);
    plot('advancedPower', 2);
    plot('liftLarge', 2);
    plot('liftLarge', 2);
    plot('liftLarge', 2);
    plot('greenhouse', 1);
    plot('greenhouse', 1);
    plot('warehouse');
    plot('factory');
    plot('workshop');
    plot('clinic');
    plot('shop');
    plot('park');
    plot('park');
    plot('plaza');
    plot('battery');
    plot('refinery');
  } else {
    plot('apartment');
    plot('apartment');
    plot('apartment');
    plot('power');
    plot('power');
    plot('liftSmall');
    plot('liftSmall');
    plot('farm');
    plot('park');
  }
  const population = advanced ? (g.missionId === 8 ? 135 : g.missionId === 7 ? 95 : 100) : 25;
  let next = {
    ...g,
    platforms,
    buildings,
    nextId,
    population,
    city: {
      ...g.city,
      residents: {},
      displaced: population,
      tier: advanced ? 3 : 1,
      rewardedTier: advanced ? 3 : 1,
    },
    structure: { ...g.structure, grace: 20 },
  };
  next = reconcileResidents(next);
  if (g.missionId === 6 || g.missionId === 9 || g.mode === 'citylab') {
    const kinds: Kind[] = g.missionId === 9 ? ['advancedPower', 'greenhouse'] : ['advancedPower'];
    next = {
      ...next,
      buildings: next.buildings.map((b) => (kinds.includes(b.kind) ? { ...b, enabled: false } : b)),
    };
  }
  if (g.missionId === 6) {
    const plant = next.buildings.find((b) => b.kind === 'advancedPower')!;
    const roads = new Set(
      next.buildings.filter((b) => b.kind === 'road').flatMap((b) => cellsOf(b, b.origin).map(key)),
    );
    const edges = { ...next.structure.edges };
    for (const c of cellsOf(plant, plant.origin))
      for (const n of neighbors(c))
        if (roads.has(key(n))) edges[edgeKey(key(c), key(n))] = { durability: 0, reinforcement: 0 };
    next = {
      ...next,
      structure: { ...next.structure, edges },
      buildings: next.buildings.map((b) => (b.kind === 'factory' ? { ...b, enabled: false } : b)),
    };
  }
  if (g.missionId === 9)
    next = {
      ...next,
      city: {
        ...next.city,
        happiness: 35,
        credits: 60,
        stocks: { core: { food: 15, materials: 350, aether: 30 } },
      },
      structure: {
        ...next.structure,
        edges: {
          ...next.structure.edges,
          [edgeKey('-2,0', '-1,0')]: { durability: 50, reinforcement: 0 },
        },
      },
      platforms: next.platforms.map((p) =>
        p.x === -2 && p.z === 0 ? { ...p, durability: p.durability * 0.5 } : p,
      ),
    };
  return next;
}
export function cityExample(g: Game, example: Game['city']['example']): Game {
  let next = configureLivingScenario({ ...g, missionId: 5, city: { ...g.city, example } });
  next = {
    ...next,
    buildings: next.buildings.map((b) => ({
      ...b,
      enabled:
        example === 'A'
          ? b.kind !== 'advancedPower'
          : example === 'B'
            ? b.kind !== 'greenhouse'
            : example === 'E'
              ? !['park', 'clinic', 'plaza'].includes(b.kind)
              : true,
    })),
  };
  if (example === 'B')
    next = {
      ...next,
      city: {
        ...next.city,
        stocks: { ...next.city.stocks, core: { ...next.city.stocks.core, food: 10 } },
      },
    };
  if (example === 'D')
    next = {
      ...next,
      platforms: next.platforms.map((p) =>
        p.x === -2 && p.z === 0 ? { ...p, durability: p.durability * 0.4 } : p,
      ),
    };
  return next;
}
