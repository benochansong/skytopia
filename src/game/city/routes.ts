import type { Cell, Game } from '../../types/game';
import { operatingNetwork } from './operations';
import { cellsOf, key, parseKey, floorOf } from '../grid';
import { facility, OPERATION } from '../../data/cityRules';
const cache: {
  road: ReturnType<typeof operatingNetwork>['road'];
  buildings: Game['buildings'];
  routes: Cell[][];
  freight: Cell[][];
}[] = [];
export function cityRoutes(g: Game) {
  const network = operatingNetwork(g),
    road = network.road,
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
      const { x, z, y } = parseKey(k);
      return cells.some(
        (c) => floorOf(c) === (y ?? 0) && Math.abs(c.x - x) + Math.abs(c.z - z) <= 1,
      );
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
      out.unshift(parseKey(at));
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
      if (
        p.length > 1 &&
        p
          .slice(1)
          .every((c, i) =>
            network.vehicle.edges.some(
              ([a, b]) =>
                (key(a) === key(p[i]) && key(b) === key(c)) ||
                (key(b) === key(p[i]) && key(a) === key(c)),
            ),
          )
      )
        freight.push(p);
    }
  const result = { road, buildings: g.buildings, routes, freight };
  cache.unshift(result);
  if (cache.length > 12) cache.pop();
  return result;
}
