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
  return { nodes, adjacency, componentOf, components };
}
