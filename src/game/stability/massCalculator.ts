import { VERTICAL } from '../../data/rules';
import { isLink, footprint } from '../vertical/geometry';
import { facility } from '../../data/cityRules';
import { STRUCTURE } from '../../data/rules';
import type { City, Point3 } from './types';
import { cellsOf, key } from '../grid';
import { fromKey } from './state';
export function calculateMass(city: City) {
  let mass = STRUCTURE.islandBaseMass,
    mx = mass * STRUCTURE.islandCenter.x,
    my = mass * STRUCTURE.islandCenter.y,
    mz = mass * STRUCTURE.islandCenter.z;
  const local = new Map<string, number>();
  const add = (m: number, p: Point3) => {
    mass += m;
    mx += m * p.x;
    my += m * p.y;
    mz += m * p.z;
  };
  for (const p of city.platforms) {
    const m = p.mass + p.reinforcement * STRUCTURE.braceMass;
    add(m, { ...p, y: p.y * VERTICAL.height - 0.15 });
    local.set(key(p), m);
  }
  const seen = new Set<number>();
  for (const b of city.buildings) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    const cells = isLink(b) ? footprint(b) : cellsOf(b, b.origin),
      share =
        (facility(b).mass +
          ((b.temporary ?? 0) > 0 ? 4 : 0) +
          (b.reinforcement ?? 0) * STRUCTURE.braceMass) /
        cells.length;
    for (const c of cells) {
      add(share, {
        ...c,
        y: isLink(b)
          ? (c.y ?? 0) * VERTICAL.height
          : (c.y ?? 0) * VERTICAL.height + facility(b).height / 2,
      });
      const target = city.platforms.some((p) => key(p) === key(c)) ? key(c) : key(b.origin);
      local.set(target, (local.get(target) ?? 0) + share);
    }
  }
  for (const [id, e] of Object.entries(city.structure?.edges ?? {}))
    if (e.reinforcement > 0) {
      const [a, b] = id.split('|').map(fromKey),
        m = e.reinforcement * STRUCTURE.braceMass;
      add(m, {
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        y: (((a.y ?? 0) + (b.y ?? 0)) / 2) * VERTICAL.height - 0.1,
      });
      for (const c of [a, b]) local.set(key(c), (local.get(key(c)) ?? 0) + m / 2);
    }
  const anchors = city.platforms.filter((p) => p.anchor);
  for (const p of anchors)
    local.set(
      key(p),
      (local.get(key(p)) ?? 0) + STRUCTURE.islandBaseMass / Math.max(1, anchors.length),
    );
  return { mass, center: { x: mx / mass, y: my / mass, z: mz / mass }, local };
}
