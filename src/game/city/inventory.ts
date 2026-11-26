import { BASE_STORAGE, OPERATION } from '../../data/cityRules';
import type { Game } from '../../types/game';
import type { Stock, Resource, GridNetwork } from '../../types/city';
import type { City } from '../stability/types';
import { emptyStock } from './state';
import { operatingNetwork } from './operations';
export const RESOURCES: Resource[] = ['food', 'materials', 'aether'];
export function inventory(city: City, road: GridNetwork = operatingNetwork(city).road) {
  const stocks = city.city?.stocks ?? {},
    groups = new Map<string, string>(),
    capacities = new Map<string, Stock>(),
    poolStocks = new Map<string, Stock>(),
    poolCapacity = new Map<string, Stock>();
  groups.set('core', road.root ?? 'isolated:core');
  capacities.set('core', {
    ...BASE_STORAGE,
    materials: BASE_STORAGE.materials + Math.max(0, (city.city?.tier ?? 1) - 1) * 100,
  });
  for (const b of city.buildings) {
    const d = OPERATION[b.kind];
    if (RESOURCES.some((r) => d.storage[r] > 0) && b.durability > 0) {
      const id = String(b.id);
      groups.set(id, road.attachments.get(b.id) ?? 'isolated:' + id);
      capacities.set(
        id,
        Object.fromEntries(
          RESOURCES.map((r) => [r, d.storage[r] * (1 + 0.5 * (b.level ?? 0))]),
        ) as Stock,
      );
    }
  }
  for (const [id, group] of groups) {
    const total = poolStocks.get(group) ?? emptyStock(),
      cap = poolCapacity.get(group) ?? emptyStock();
    for (const r of RESOURCES) {
      total[r] += Math.min(stocks[id]?.[r] ?? 0, capacities.get(id)![r]);
      cap[r] += capacities.get(id)![r];
    }
    poolStocks.set(group, total);
    poolCapacity.set(group, cap);
  }
  const root = road.root ?? 'isolated:core';
  return {
    groups,
    capacities,
    poolStocks,
    poolCapacity,
    stocks: poolStocks.get(root) ?? emptyStock(),
    capacity: poolCapacity.get(root) ?? emptyStock(),
    root,
  };
}
// Inventories belong to physical stores: cutting a road never teleports or duplicates stocks.
export function adjustStock(g: Game, group: string, resource: Resource, delta: number): Game {
  const inv = inventory(g),
    stocks = { ...g.city.stocks };
  let left = Math.abs(delta);
  for (const [id, pool] of inv.groups) {
    if (pool !== group) continue;
    const stock = { ...(stocks[id] ?? emptyStock()) },
      amount = Math.min(
        left,
        delta >= 0
          ? Math.max(0, inv.capacities.get(id)![resource] - stock[resource])
          : stock[resource],
      );
    stock[resource] += delta >= 0 ? amount : -amount;
    stocks[id] = stock;
    left -= amount;
    if (left < 1e-9) break;
  }
  const next = { ...g, city: { ...g.city, stocks } };
  return { ...next, resources: inventory(next).stocks.materials };
}
export type Cost = { materials: number; credits: number; aether: number };
export function canPay(g: Game, cost: Cost) {
  const s = inventory(g).stocks;
  return (
    g.city.unlimited ||
    (s.materials + 1e-8 >= cost.materials &&
      g.city.credits + 1e-8 >= cost.credits &&
      s.aether + 1e-8 >= cost.aether)
  );
}
export function pay(g: Game, cost: Cost): Game {
  if (!g.city.enabled || g.city.unlimited) return g;
  if (!canPay(g, cost)) return g;
  const root = inventory(g).root;
  let next = adjustStock(g, root, 'materials', -cost.materials);
  next = adjustStock(next, root, 'aether', -cost.aether);
  return {
    ...next,
    city: { ...next.city, credits: Math.max(0, next.city.credits - cost.credits) },
  };
}
