import { PHYSICAL } from '../data/rules';
import type { Game, Kind, Shape } from '../types/game';
import { makePlatform, makeBuilding, edgeKey } from './stability/state';
import { analyze } from './analysis';
export function configureScenario(g: Game): Game {
  const scenario =
    g.mode === 'lab' ? g.labExample : g.missionId === 3 ? 'B' : g.missionId === 4 ? 'D' : null;
  if (!scenario || scenario === 'A') return g;
  let next = { ...g, platforms: [...g.platforms], buildings: [...g.buildings] };
  const platform = (x: number, z: number, metal = false) => {
    if (!next.platforms.some((p) => p.x === x && p.z === z))
      next.platforms.push(
        makePlatform({ x, z }, metal ? 'metalPlatform' : 'platform', next.nextId++),
      );
  };
  const building = (kind: Kind, x: number, z: number, shape: Shape = 'single') => {
    next.buildings.push(makeBuilding({ kind, shape, rotation: 0 }, { x, z }, next.nextId++));
  };
  if (scenario === 'B') {
    for (let x = 3; x <= 5; x++) for (let z = -2; z <= 0; z++) platform(x, z, true);
    // One road corridor supplies both the industrial district and safety facilities.
    for (let x = 1; x <= 5; x++) building('road', x, -1);
    building('factory', 4, -2);
    building('factory', 5, -2);
    building('power', 3, -2);
    building('factory', 5, 0);
    next.structure = { ...next.structure, grace: 35 };
    next.platforms = next.platforms.map((p) =>
      p.x === 3 && p.z === 0 ? { ...p, durability: p.durability * 0.7 } : p,
    );
  } else {
    for (let x = 3; x <= 6; x++) platform(x, 0);
    for (let z = -1; z <= 1; z++) for (let x = 5; x <= 6; x++) platform(x, z);
    for (let z = -1; z <= 0; z++) building('road', 1, z);
    for (let x = 2; x <= 6; x++) building('road', x, 0);
    building('factory', 6, -1);
    building('power', 5, -1);
    building('liftSmall', 5, 1);
    building('factory', 6, 1);
    const weak = edgeKey('2,0', '3,0');
    next.structure = {
      ...next.structure,
      grace: g.mode === 'lab' ? 0 : 35,
      edges: {
        [weak]: { durability: scenario === 'D' ? 28 : 100, reinforcement: 0 },
        [edgeKey('3,0', '4,0')]: { durability: scenario === 'D' ? 45 : 100, reinforcement: 0 },
      },
    };
    next.platforms = next.platforms.map((p) =>
      p.x === 3 && p.z === 0 ? { ...p, durability: scenario === 'D' ? 45 : 100 } : p,
    );
    if (scenario === 'D') {
      building('factory', -2, 0);
      building('factory', -2, 1);
      const plant = next.buildings.find((b) => b.kind === 'power' && !b.initial)!;
      next.buildings = next.buildings.map((b) =>
        b.id === plant.id ? { ...b, durability: PHYSICAL.power.hp * 0.25 } : b,
      );
      const lift = next.buildings.find((b) => b.kind === 'liftSmall')!;
      next.structure = { ...next.structure, lifts: { [lift.id]: { factor: 0.45, outage: 15 } } };
    }
  }
  next.baselineSeparation = analyze(next).structural.separation;
  next.structure = {
    ...next.structure,
    maxCitySize: next.platforms.length + next.buildings.length,
  };
  return next;
}
