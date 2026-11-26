import type { City } from '../stability/types';
import type { GridNetwork } from '../../types/city';
import { cellsOf, key, neighbors } from '../grid';
import { edgeKey, fromKey } from '../stability/state';
const cache: {
  platforms: City['platforms'];
  buildings: City['buildings'];
  edges: unknown;
  road: GridNetwork;
  power: GridNetwork;
}[] = [];
export function networks(city: City) {
  const hit = cache.find(
    (c) =>
      c.platforms === city.platforms &&
      c.buildings === city.buildings &&
      c.edges === city.structure?.edges,
  );
  if (hit) return hit;
  const platforms = new Set(city.platforms.filter((p) => p.durability > 0).map(key));
  const intact = (a: string, b: string) =>
    platforms.has(a) &&
    platforms.has(b) &&
    (city.structure?.edges[edgeKey(a, b)]?.durability ?? 100) > 0;
  function build(power: boolean): GridNetwork {
    const carriers = new Set(
      city.buildings
        .filter(
          (b) =>
            b.enabled &&
            b.durability > 0 &&
            (b.kind === 'road' || (power && ['relay', 'powerLink'].includes(b.kind))),
        )
        .flatMap((b) => cellsOf(b, b.origin).map(key))
        .filter((k) => platforms.has(k)),
    );
    const adjacency = new Map(
      [...carriers].map((k) => [
        k,
        neighbors(fromKey(k))
          .map(key)
          .filter((n) => carriers.has(n) && intact(k, n)),
      ]),
    );
    if (power)
      for (const b of city.buildings.filter(
        (b) => b.kind === 'relay' && b.enabled && b.durability > 0,
      ))
        for (const n of neighbors(b.origin)) {
          const a = key(b.origin),
            middle = key(n),
            end = key({ x: n.x + (n.x - b.origin.x), z: n.z + (n.z - b.origin.z) });
          if (carriers.has(end) && intact(a, middle) && intact(middle, end)) {
            adjacency.get(a)?.push(end);
            adjacency.get(end)?.push(a);
          }
        }
    const groups = new Map<string, Set<string>>(),
      of = new Map<string, string>(),
      edges: GridNetwork['edges'] = [];
    for (const k of [...carriers].sort()) {
      if (of.has(k)) continue;
      const reached = new Set<string>(),
        q = [k];
      for (let i = 0; i < q.length; i++) {
        const n = q[i];
        if (reached.has(n)) continue;
        reached.add(n);
        q.push(...adjacency.get(n)!);
      }
      const id = reached.has('0,-1') ? '0,-1' : [...reached].sort()[0];
      groups.set(id, reached);
      for (const n of reached) {
        of.set(n, id);
        for (const other of adjacency.get(n)!)
          if (n < other) edges.push([fromKey(n), fromKey(other)]);
      }
    }
    const root = of.get('0,-1') ?? null,
      attachments = new Map<number, string>();
    for (const b of city.buildings) {
      if (b.durability <= 0) continue;
      const candidates = new Set<string>();
      for (const c of cellsOf(b, b.origin)) {
        const ck = key(c);
        if (carriers.has(ck)) candidates.add(of.get(ck)!);
        for (const n of neighbors(c)) {
          const nk = key(n);
          if (of.has(nk) && intact(ck, nk)) candidates.add(of.get(nk)!);
        }
      }
      if (candidates.size)
        attachments.set(b.id, root && candidates.has(root) ? root : [...candidates].sort()[0]);
    }
    return { groups, of, attachments, edges, root };
  }
  const value = {
    platforms: city.platforms,
    buildings: city.buildings,
    edges: city.structure?.edges,
    road: build(false),
    power: build(true),
  };
  cache.unshift(value);
  if (cache.length > 6) cache.pop();
  return value;
}
