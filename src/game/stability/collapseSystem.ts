import { footprint } from '../vertical/geometry';
import { VERTICAL } from '../../data/rules';
import { BLOCKS, STRUCTURE } from '../../data/rules';
import type { Game } from '../../types/game';
import { analyze } from '../analysis';
import { cellsOf, key } from '../grid';
import { recordEvent } from './events';
export function processCollapse(g: Game): Game {
  const report = analyze(g).structural;
  const queue = new Set(g.structure.pending);
  for (const p of g.platforms) if (p.durability <= 0) queue.add(key(p));
  for (const c of report.components)
    if (!c.anchored && c.lift < c.mass) for (const k of c.keys) queue.add(k);
  const removedKeys = new Set([...queue].sort().slice(0, STRUCTURE.maxCollapsePerStep));
  const platforms = g.platforms.filter((p) => removedKeys.has(key(p)));
  const buildings = g.buildings.filter(
    (b) => b.durability <= 0 || footprint(b).some((c) => removedKeys.has(key(c))),
  );
  if (!platforms.length && !buildings.length) return g;
  const removedIds = new Set(buildings.map((b) => b.id));
  const remaining = g.platforms.filter((p) => !removedKeys.has(key(p))),
    remainingKeys = new Set(remaining.map(key));
  const edges = Object.fromEntries(
    Object.entries(g.structure.edges).filter(([id]) =>
      id.split('|').every((k) => remainingKeys.has(k)),
    ),
  );
  const lifts = Object.fromEntries(
    Object.entries(g.structure.lifts).filter(([id]) => !removedIds.has(Number(id))),
  );
  let next: Game = {
    ...g,
    platforms: remaining.map((p) => {
      if (!g.vertical) return p;
      const above = platforms.filter(
        (v) =>
          v.x === p.x &&
          v.z === p.z &&
          v.y > p.y &&
          !remaining.some((q) => q.x === p.x && q.z === p.z && q.y > p.y && q.y < v.y),
      );
      if (!above.length) return p;
      const hit =
        above.reduce((n, v) => n + v.mass * 1.5, 0) +
        buildings
          .filter((b) => b.y > p.y && cellsOf(b, b.origin).some((c) => c.x === p.x && c.z === p.z))
          .reduce((n, b) => n + BLOCKS[b.kind].mass * 0.15, 0);
      return { ...p, durability: Math.max(0, p.durability - Math.min(VERTICAL.impactLimit, hit)) };
    }),
    buildings: g.buildings.filter((b) => !removedIds.has(b.id)),
    structure: {
      ...g.structure,
      edges,
      lifts,
      emergency: removedKeys.has(key(g.structure.emergency.cell))
        ? { ...g.structure.emergency, remaining: 0 }
        : g.structure.emergency,
      pending: [...queue].filter((k) => remainingKeys.has(k)),
      collapsedCount: g.structure.collapsedCount + platforms.length + buildings.length,
      repairs: g.structure.repairs.filter((r) =>
        r.target.type === 'building'
          ? !removedIds.has(Number(r.target.id))
          : r.target.type === 'platform'
            ? remainingKeys.has(r.target.id)
            : r.target.id.split('|').every((k) => remainingKeys.has(k)),
      ),
    },
  };
  const lostCapacity = buildings.reduce((s, b) => s + BLOCKS[b.kind].capacity, 0);
  next = {
    ...next,
    population: g.city.enabled
      ? g.population
      : Math.min(analyze(next).capacity, Math.max(0, g.population - lostCapacity)),
  };
  next = recordEvent(
    next,
    'collapse',
    platforms.length ? key(platforms[0]) : String(buildings[0].id),
    platforms[0] ?? buildings[0].origin,
    platforms,
    buildings,
  );
  if (buildings.some((b) => BLOCKS[b.kind].power > 0))
    next = recordEvent(
      next,
      'powerLost',
      'grid',
      buildings.find((b) => BLOCKS[b.kind].power > 0)!.origin,
    );
  return next;
}
