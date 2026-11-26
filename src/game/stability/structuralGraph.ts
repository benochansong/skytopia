import { segments, role } from '../vertical/geometry';
import type { Building } from '../../types/game';
import { STRUCTURE } from '../../data/rules';
import type { City } from './types';
import { key, neighbors } from '../grid';
import { edgeKey } from './state';
export function buildGraph(city: City) {
  const nodes = new Map(city.platforms.map((p) => [key(p), p])),
    adjacency = new Map<string, string[]>();
  for (const [k, p] of nodes)
    adjacency.set(
      k,
      neighbors(p)
        .map(key)
        .filter(
          (n) =>
            nodes.has(n) &&
            p.durability > 0 &&
            nodes.get(n)!.durability > 0 &&
            (city.structure?.edges[edgeKey(k, n)]?.durability ?? STRUCTURE.linkHP) > 0,
        )
        .sort(),
    );
  const members = new Map<string, Building[]>();
  for (const b of city.buildings) {
    if (
      !['column', 'beam', 'hanger', 'bridge', 'brace'].includes(role(b) ?? '') ||
      !b.enabled ||
      b.durability <= 0
    )
      continue;
    for (const pair of segments(b, b.origin)) {
      const [a, z] = pair.map(key),
        id = edgeKey(a, z);
      if (
        !nodes.has(a) ||
        !nodes.has(z) ||
        nodes.get(a)!.durability <= 0 ||
        nodes.get(z)!.durability <= 0
      )
        continue;
      members.set(id, [...(members.get(id) ?? []), b]);
      if (!adjacency.get(a)!.includes(z)) adjacency.get(a)!.push(z);
      if (!adjacency.get(z)!.includes(a)) adjacency.get(z)!.push(a);
    }
  }
  const componentOf = new Map<string, number>(),
    components: { keys: string[]; anchored: boolean }[] = [];
  for (const start of [...nodes.keys()].sort()) {
    if (componentOf.has(start)) continue;
    const id = components.length,
      keys: string[] = [],
      q = [start];
    for (let i = 0; i < q.length; i++) {
      const k = q[i];
      if (componentOf.has(k)) continue;
      componentOf.set(k, id);
      keys.push(k);
      q.push(...adjacency.get(k)!);
    }
    components.push({
      keys,
      anchored: keys.includes('0,0') && (city.structure?.coreDurability ?? STRUCTURE.coreHP) > 0,
    });
  }
  return { nodes, adjacency, componentOf, components, members };
}
