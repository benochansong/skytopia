import { calculateMass } from '../game/stability/massCalculator';
import { facility } from '../data/cityRules';
import { footprintCenter } from '../game/stability/state';
import { bestBuild } from './city-helpers';
import { newGame } from '../game/engine';
import { BLOCKS } from '../data/rules';
import { reinforce } from '../game/repair/maintenance';
import type { Kind } from '../types/game';
import { makeBuilding, makePlatform } from '../game/stability/state';
import { reconcileResidents } from '../game/city/population';
import { analyze } from '../game/analysis';
import { cellsOf, key, neighbors } from '../game/grid';
export function metropolisFixture() {
  let g = newGame('citylab', 55);
  g = {
    ...g,
    platforms: Array.from({ length: 256 }, (_, i) => {
      const x = (i % 16) - 8,
        z = Math.floor(i / 16) - 8;
      return makePlatform({ x, z }, 'platform', 0, 1, x >= -3 && x <= 2 && z >= -3 && z <= 2);
    }),
    buildings: [],
    nextId: 1,
  };
  function add(kind: Kind, x: number, z: number, level = 0) {
    const b = makeBuilding(
      { kind, shape: BLOCKS[kind].shapes[0], rotation: 0 },
      { x, z },
      g.nextId,
    );
    g = { ...g, nextId: g.nextId + 1, buildings: [...g.buildings, { ...b, level }] };
  }
  for (const p of g.platforms)
    if ((p.x === -8 || p.x === 7 || p.z % 3 === 0) && key(p) !== '0,0') add('road', p.x, p.z);
  add('road', 0, -1);
  add('road', 1, -1);
  let homes = 0,
    lifts = 0;
  for (const z of [-5, -2, 1, 4])
    for (const x of [-7, -4, -1, 2, 5]) {
      if (x === -1 && z === -2) continue;
      if ((x + z) % 2 === 0 && homes < 9) {
        add('housingEstate', x, z, 2);
        homes++;
      } else if (lifts < 8) {
        add('liftLarge', x, z, 2);
        lifts++;
      } else if (homes < 9) {
        add('housingEstate', x, z, 2);
        homes++;
      } else {
        add('liftLarge', x, z, 2);
        lifts++;
      }
    }
  const occupied = () =>
    new Set(['0,0', ...g.buildings.flatMap((b) => cellsOf(b, b.origin).map(key))]);
  function fit(kind: Kind, level = 0) {
    const used = occupied(),
      roads = new Set(g.buildings.filter((b) => b.kind === 'road').map((b) => key(b.origin)));
    const mass = calculateMass(g),
      liftTotal = 500 + g.buildings.reduce((n, b) => n + facility(b).lift, 0),
      liftX =
        g.buildings.reduce((n, b) => n + facility(b).lift * footprintCenter(b).x, 0) / liftTotal,
      liftZ =
        g.buildings.reduce((n, b) => n + facility(b).lift * footprintCenter(b).z, 0) / liftTotal;
    const candidates = g.platforms
      .map((p) => {
        const b = {
            ...makeBuilding({ kind, shape: BLOCKS[kind].shapes[0], rotation: 0 }, p, g.nextId),
            level,
          },
          c = footprintCenter(b),
          m = facility(b).mass;
        return {
          p,
          d: Math.hypot(
            (mass.center.x * mass.mass + c.x * m) / (mass.mass + m) - liftX,
            (mass.center.z * mass.mass + c.z * m) / (mass.mass + m) - liftZ,
          ),
        };
      })
      .sort((a, b) => a.d - b.d);
    for (const { p } of candidates) {
      const cells = cellsOf({ kind, shape: BLOCKS[kind].shapes[0], rotation: 0 }, p);
      if (
        cells.every((c) => c.x >= -8 && c.x <= 7 && c.z >= -8 && c.z <= 7 && !used.has(key(c))) &&
        cells.some((c) => neighbors(c).some((n) => roads.has(key(n))))
      ) {
        add(kind, p.x, p.z, level);
        return;
      }
    }
    throw Error('No space ' + kind);
  }
  for (let i = 0; i < 5; i++) fit('advancedPower', 2);
  for (let i = 0; i < 5; i++) fit('greenhouse', 2);
  fit('refinery', 2);
  fit('warehouse');
  fit('warehouse');
  g = reconcileResidents({
    ...g,
    population: 600,
    city: { ...g.city, residents: {}, displaced: 600, happiness: 75 },
  });
  for (let i = 0; i < 60; i++) {
    const w = analyze(g).structural.worst;
    if (!w || w.ratio < 1) break;
    const next = reinforce(g, { type: w.type, id: w.id }, true);
    if (next === g) break;
    g = next;
  }
  for (let i = 0; i < 6 && (analyze(g).stability < 75 || analyze(g).structural.critical); i++)
    g = bestBuild(
      g,
      'liftSmall',
      (g) => analyze(g).stability - (analyze(g).structural.critical ? 50 : 0),
    );

  return g;
}
