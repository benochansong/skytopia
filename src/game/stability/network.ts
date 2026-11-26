import { operatingNetwork } from '../city/operations';
import { facility } from '../../data/cityRules';
import { PHYSICAL } from '../../data/rules';
import { cellsOf, key, neighbors } from '../grid';
import { edgeKey } from './state';
import type { City, Network } from './types';
export function analyzeNetwork(city: City): Network {
  if (city.city?.enabled) return operatingNetwork(city).network;
  const platforms = new Set(city.platforms.filter((p) => p.durability > 0).map(key));
  const allRoads = new Set(
    city.buildings
      .filter((b) => b.kind === 'road' && b.durability > 0)
      .flatMap((b) => cellsOf(b, b.origin).map(key))
      .filter((k) => platforms.has(k)),
  );
  const circuits = new Map<string, number>(),
    groups: Set<string>[] = [];
  for (const start of [...allRoads].sort()) {
    if (circuits.has(start)) continue;
    const index = groups.length,
      reached = new Set<string>(),
      queue = [start];
    groups.push(reached);
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i];
      if (circuits.has(k)) continue;
      circuits.set(k, index);
      reached.add(k);
      const [x, z] = k.split(',').map(Number);
      for (const n of neighbors({ x, z })) {
        const nk = key(n);
        if (
          allRoads.has(nk) &&
          !circuits.has(nk) &&
          (city.structure?.edges[edgeKey(k, nk)]?.durability ?? 100) > 0
        )
          queue.push(nk);
      }
    }
  }
  const root = circuits.get('0,-1'),
    roads = root === undefined ? new Set<string>() : groups[root];
  const connectedIds = new Set<number>(),
    operational = new Set<number>(),
    attachments = new Map<number, number>();
  const supply = new Map<number, number>(),
    usage = new Map<number, number>();
  let power = 0,
    demand = 0,
    capacity = 0,
    food = 0,
    disconnected = 0;
  for (const b of city.buildings) {
    const def = facility(b),
      hp = Math.max(0, b.durability / PHYSICAL[b.kind].hp);
    const candidates = new Set<number>();
    for (const c of cellsOf(b, b.origin))
      for (const n of b.kind === 'road' ? [c] : neighbors(c)) {
        const circuit = circuits.get(key(n));
        if (
          circuit !== undefined &&
          (b.kind === 'road' ||
            (city.structure?.edges[edgeKey(key(c), key(n))]?.durability ?? 100) > 0)
        )
          candidates.add(circuit);
      }
    const circuit =
      root !== undefined && candidates.has(root) ? root : [...candidates].sort((a, b) => a - b)[0];
    if (circuit !== undefined && b.enabled && hp > 0) {
      attachments.set(b.id, circuit);
      operational.add(b.id);
      supply.set(circuit, (supply.get(circuit) ?? 0) + def.power * Math.min(1, hp));
      usage.set(circuit, (usage.get(circuit) ?? 0) + def.demand);
      if (circuit === root) {
        connectedIds.add(b.id);
        power += def.power * Math.min(1, hp);
      }
    }
    if (!connectedIds.has(b.id)) disconnected++;
    capacity += def.capacity;
    demand += b.enabled ? def.demand : 0;
    food += def.food * hp;
  }
  const powerRatios = new Map<number, number>();
  let poweredCapacity = 0;
  for (const b of city.buildings) {
    const circuit = attachments.get(b.id);
    const ratio =
      circuit === undefined
        ? 0
        : Math.min(1, (supply.get(circuit) ?? 0) / Math.max(1, usage.get(circuit) ?? 0));
    powerRatios.set(b.id, ratio);
    if (connectedIds.has(b.id) && ratio >= 1) poweredCapacity += facility(b).capacity;
  }
  return {
    roads,
    connectedIds,
    power,
    demand,
    capacity,
    poweredCapacity,
    food,
    disconnected,
    powerRatios,
    operational,
  };
}
