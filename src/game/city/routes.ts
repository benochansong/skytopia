import type { Cell, Game } from '../../types/game';
import { networks } from './networks';
import { cellsOf, key } from '../grid';
import { facility, OPERATION } from '../../data/cityRules';
const cache: {
  road: ReturnType<typeof networks>['road'];
  buildings: Game['buildings'];
  routes: Cell[][];
  freight: Cell[][];
}[] = [];
export function cityRoutes(g: Game) {
  const road = networks(g).road,
    hit = cache.find((c) => c.road === road && c.buildings === g.buildings);
  if (hit) return hit;
  const adjacency = new Map<string, string[]>();
  for (const [a, b] of road.edges) {
    const x = key(a),
      z = key(b);
    adjacency.set(x, [...(adjacency.get(x) ?? []), z]);
    adjacency.set(z, [...(adjacency.get(z) ?? []), x]);
  }
  const entrance = (id: number) => {
    const b = g.buildings.find((b) => b.id === id)!;
    const cells = cellsOf(b, b.origin),
      group = road.attachments.get(id);
    return [...(road.groups.get(group ?? '') ?? [])].find((k) => {
      const [x, z] = k.split(',').map(Number);
      return cells.some((c) => Math.abs(c.x - x) + Math.abs(c.z - z) <= 1);
    });
  };
  function path(a: number, b: number) {
    const start = entrance(a),
      end = entrance(b);
    if (!start || !end) return [];
    const prev = new Map<string, string | null>([[start, null]]),
      q = [start];
    for (let i = 0; i < q.length && !prev.has(end); i++)
      for (const next of adjacency.get(q[i]) ?? [])
        if (!prev.has(next)) {
          prev.set(next, q[i]);
          q.push(next);
        }
    if (!prev.has(end)) return [];
    const out: Cell[] = [];
    for (let at: string | null = end; at; at = prev.get(at) ?? null) {
      const [x, z] = at.split(',').map(Number);
      out.unshift({ x, z });
    }
    return out;
  }
  const homes = g.buildings.filter((b) => facility(b).capacity > 0 && b.enabled),
    dest = g.buildings.filter(
      (b) => b.enabled && (OPERATION[b.kind].jobs || OPERATION[b.kind].amenity),
    ),
    stores = g.buildings.filter(
      (b) =>
        b.enabled &&
        (b.kind === 'warehouse' || b.kind === 'logisticsDepot' || facility(b).capacity),
    );
  const routes: Cell[][] = [],
    freight: Cell[][] = [];
  for (const h of homes)
    for (const d of dest) {
      if (routes.length >= 48) break;
      const p = path(h.id, d.id);
      if (p.length > 1) routes.push(p);
    }
  for (const producer of dest.filter((b) => OPERATION[b.kind].food || OPERATION[b.kind].materials))
    for (const store of stores) {
      if (freight.length >= 16) break;
      const p = path(producer.id, store.id);
      if (p.length > 1) freight.push(p);
    }
  const result = { road, buildings: g.buildings, routes, freight };
  cache.unshift(result);
  if (cache.length > 4) cache.pop();
  return result;
}
