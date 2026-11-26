import { VERTICAL_DEFS } from '../../data/rules';
import { endpoints } from '../vertical/geometry';
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
  freight: GridNetwork;
  vehicle: GridNetwork;
  enabled?: string;
}[] = [];
export function networks(city: City, elevators?: Set<number>) {
  const enabled = elevators ? [...elevators].sort((a, b) => a - b).join(',') : undefined;
  const hit = cache.find(
    (c) =>
      c.platforms === city.platforms &&
      c.buildings === city.buildings &&
      c.edges === city.structure?.edges &&
      c.enabled === enabled,
  );
  if (hit) return hit;
  const platforms = new Set(city.platforms.filter((p) => p.durability > 0).map(key));
  const intact = (a: string, b: string) =>
    platforms.has(a) &&
    platforms.has(b) &&
    (city.structure?.edges[edgeKey(a, b)]?.durability ?? 100) > 0;
  function build(channel: 'road' | 'power' | 'freight' | 'vehicle'): GridNetwork {
    const power = channel === 'power';
    const links = city.buildings.filter((b) => {
      if (
        !b.enabled ||
        b.durability <= 0 ||
        !endpoints(b, b.origin).every((c) => platforms.has(key(c)))
      )
        return false;
      const d = VERTICAL_DEFS[b.kind];
      if (!d) return false;
      if (power) return d.power;
      if (d.role === 'bridge')
        return (
          (b.kind !== 'aetherBridge' || !elevators || elevators.has(b.id)) &&
          (channel === 'road' || d.freight)
        );
      if (d.role !== 'transport') return false;
      if (b.kind !== 'stairs' && elevators && !elevators.has(b.id)) return false;
      return channel === 'road' || (channel === 'freight' && d.freight);
    });
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
    for (const b of links) for (const c of endpoints(b, b.origin)) carriers.add(key(c));
    // Elevator terminals distribute power on each landing; only relays bridge floors.
    if (power)
      for (const b of city.buildings)
        if (
          b.enabled &&
          b.durability > 0 &&
          ['elevator', 'cargoElevator', 'aetherElevator'].includes(b.kind)
        )
          for (const c of endpoints(b, b.origin)) if (platforms.has(key(c))) carriers.add(key(c));
    const adjacency = new Map(
      [...carriers].map((k) => [
        k,
        neighbors(fromKey(k))
          .map(key)
          .filter((n) => carriers.has(n) && intact(k, n)),
      ]),
    );
    for (const b of links) {
      const [a, z] = endpoints(b, b.origin).map(key);
      adjacency.get(a)!.push(z);
      adjacency.get(z)!.push(a);
    }
    if (power)
      for (const b of city.buildings.filter(
        (b) => b.kind === 'relay' && b.enabled && b.durability > 0,
      ))
        for (const n of neighbors(b.origin)) {
          const a = key(b.origin),
            middle = key(n),
            end = key({ x: n.x + (n.x - b.origin.x), z: n.z + (n.z - b.origin.z), y: b.y });
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
    enabled,
    road: build('road'),
    power: build('power'),
    freight: build('freight'),
    vehicle: build('vehicle'),
  };
  cache.unshift(value);
  if (cache.length > 12) cache.pop();
  return value;
}
