import { BLOCKS, RULES } from '../data/rules';
import type { Game, Stats } from '../types/game';
import { cellsOf, key, neighbors } from './grid';
export function analyze(game: Pick<Game, 'buildings' | 'platforms'>): Stats {
  const allRoads = new Set(
    game.buildings.filter((b) => b.kind === 'road').flatMap((b) => cellsOf(b, b.origin).map(key)),
  );
  const roads = new Set<string>();
  const queue = [{ x: 0, z: -1 }];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i],
      k = key(c);
    if (!allRoads.has(k) || roads.has(k)) continue;
    roads.add(k);
    queue.push(...neighbors(c));
  }
  const connectedIds = new Set<number>();
  let mass = 0,
    mx = 0,
    mz = 0,
    power = 0,
    demand = 0,
    capacity = 0,
    connectedCapacity = 0,
    disconnected = 0,
    homes = 0,
    addedPower = 0,
    food = 0;
  for (const p of game.platforms) {
    mass += p.mass;
    mx += p.mass * p.x;
    mz += p.mass * p.z;
  }
  for (const b of game.buildings) {
    const definition = BLOCKS[b.kind],
      cells = cellsOf(b, b.origin);
    const connected =
      b.kind === 'road'
        ? cells.some((c) => roads.has(key(c)))
        : cells.some((c) => neighbors(c).some((n) => roads.has(key(n))));
    if (connected) {
      connectedIds.add(b.id);
      power += definition.power;
      connectedCapacity += definition.capacity;
    } else disconnected++;
    capacity += definition.capacity;
    demand += definition.demand;
    food += definition.food;
    if (b.kind === 'home') homes++;
    if (b.kind === 'power' && !b.initial) addedPower++;
    mass += definition.mass;
    for (const c of cells) {
      mx += (c.x * definition.mass) / cells.length;
      mz += (c.z * definition.mass) / cells.length;
    }
  }
  const center = { x: mass ? mx / mass : 0, z: mass ? mz / mass : 0 };
  const stability = Math.max(
    0,
    Math.min(
      100,
      100 - Math.hypot(center.x, center.z) * 12 - Math.max(0, mass / RULES.lift - 0.75) * 80,
    ),
  );
  return {
    mass,
    center,
    stability,
    lift: RULES.lift,
    capacity,
    poweredCapacity: power >= demand ? connectedCapacity : 0,
    power,
    demand,
    disconnected,
    connectedIds,
    roads,
    homes,
    addedPower,
    expansion: game.platforms.length - 36,
    food,
  };
}
export function objectives(g: Game, s = analyze(g)) {
  return [
    s.expansion >= 5,
    s.homes >= 5,
    g.population >= 25,
    s.addedPower >= 1,
    g.buildings.filter((b) => b.kind === 'home').every((b) => s.connectedIds.has(b.id)),
    s.power >= s.demand,
    s.stability >= 70,
  ];
}
