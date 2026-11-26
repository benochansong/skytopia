import type { Game } from '../../types/game';
import { OPERATION, CITY_RULES, cityDifficulty } from '../../data/cityRules';
import { cityReport } from './report';
import { inventory, adjustStock, RESOURCES } from './inventory';
import { emptyStock, cityEvent } from './state';
import { populationStep, reconcileResidents } from './population';
import { operatingNetwork } from './operations';
export function reconcileStores(g: Game): Game {
  const inv = inventory(g),
    stocks: Game['city']['stocks'] = {};
  let lost = 0;
  for (const [id, s] of Object.entries(g.city.stocks)) {
    const cap = inv.capacities.get(id);
    if (!cap) {
      lost += s.food + s.materials + s.aether;
      continue;
    }
    stocks[id] = { ...s };
    for (const r of RESOURCES) {
      lost += Math.max(0, s[r] - cap[r]);
      stocks[id][r] = Math.min(s[r], cap[r]);
    }
  }
  for (const id of inv.capacities.keys()) stocks[id] ??= emptyStock();
  const batteries = Object.fromEntries(
    Object.entries(g.city.batteries).filter(([id]) =>
      g.buildings.some((b) => String(b.id) === id && b.kind === 'battery'),
    ),
  );
  let next = { ...g, city: { ...g.city, stocks, batteries } };
  next = { ...next, resources: inventory(next).stocks.materials };
  return lost > 0.001 ? cityEvent(next, 'storageLoss', lost) : next;
}
export function economyStep(g: Game): Game {
  let next = reconcileStores(reconcileResidents(g));
  const r = cityReport(next),
    net = operatingNetwork(next),
    difficulty = cityDifficulty[g.difficulty];
  const activity = { ...next.city.activity };
  for (const b of next.buildings) {
    const o = r.operations.get(b.id)!;
    const ready =
      b.enabled && o.road && o.condition > 0 && o.status !== 'power' && o.status !== 'input';
    activity[b.id] = ready ? Math.min(1, (activity[b.id] ?? 1) + 0.25) : 0;
  }
  const liveIds = new Set(next.buildings.map((b) => String(b.id)));
  for (const id of Object.keys(activity)) if (!liveIds.has(id)) delete activity[id];
  let hungry = 0;
  const needs = new Map<string, number>();
  for (const [id, n] of Object.entries(next.city.residents)) {
    const group = r.roads.attachments.get(Number(id));
    if (group)
      needs.set(
        group,
        (needs.get(group) ?? 0) + n * CITY_RULES.foodPerPerson * difficulty.consumption,
      );
    else hungry += n;
  }
  if (next.city.displaced)
    needs.set(
      net.inv.root,
      (needs.get(net.inv.root) ?? 0) +
        next.city.displaced * CITY_RULES.foodPerPerson * difficulty.consumption,
    );
  // Production and consumption reserve quantities per road pool; stores on isolated roads stay local.
  const output = new Map<string, ReturnType<typeof emptyStock>>();
  for (const o of r.operations.values()) {
    if (!o.road) continue;
    const sum = output.get(o.road) ?? emptyStock();
    sum.food += o.food;
    sum.materials += o.materials;
    sum.aether += o.aether - OPERATION[o.kind].inputAether * o.efficiency;
    output.set(o.road, sum);
  }
  for (const [pool, sum] of output)
    for (const resource of RESOURCES)
      if (resource !== 'food' && sum[resource])
        next = adjustStock(next, pool, resource, sum[resource]);
  for (const pool of new Set([...needs.keys(), ...output.keys()])) {
    const need = needs.get(pool) ?? 0,
      production = output.get(pool)?.food ?? 0;
    const available = inventory(next).poolStocks.get(pool)?.food ?? 0;
    if (available + production + 1e-8 < need)
      hungry += Math.max(1, need / CITY_RULES.foodPerPerson);
    next = adjustStock(next, pool, 'food', production - need);
  }
  const batteries = { ...next.city.batteries };
  for (const [group, cells] of r.powerGrid.groups) {
    void cells;
    const demand = [...r.operations.values()]
        .filter((o) => o.powerGrid === group)
        .reduce((s, o) => s + o.demand, 0),
      boost = group === r.powerGrid.root && next.city.powerBoost > 0 ? CITY_RULES.powerBoost : 0;
    let balance = (net.generationByGrid.get(group) ?? 0) + boost - demand;
    for (const b of next.buildings.filter(
      (b) => b.kind === 'battery' && b.enabled && r.powerGrid.attachments.get(b.id) === group,
    )) {
      const stored = batteries[b.id] ?? 0,
        capacity = CITY_RULES.batteryCapacity * (1 + 0.5 * (b.level ?? 0));
      const amount =
        balance >= 0
          ? Math.min(balance, CITY_RULES.batteryRate, capacity - stored)
          : -Math.min(-balance, CITY_RULES.batteryRate, stored);
      batteries[b.id] = stored + amount;
      balance -= amount;
    }
  }
  const previousHunger = next.city.hungerTime,
    grace = Math.max(0, next.city.grace - 1),
    hungerTime = hungry > 0 ? previousHunger + 1 : Math.max(0, previousHunger - 2);
  next = {
    ...next,
    city: {
      ...next.city,
      activity,
      batteries,
      credits: Math.max(0, next.city.credits + r.net),
      grace,
      hungerTime,
      blackoutTime:
        r.deficit > r.demand * 0.3 || r.availableHousing < next.population * 0.7
          ? next.city.blackoutTime + 1
          : Math.max(0, next.city.blackoutTime - 2),
      distressTime:
        next.city.happiness < 35
          ? next.city.distressTime + 1
          : Math.max(0, next.city.distressTime - 2),
      shelterTime: next.city.displaced > 0 ? next.city.shelterTime + 1 : 0,
    },
  };
  if (hungerTime === 1) next = cityEvent(next, 'shortage');
  if (previousHunger > 0 && hungerTime === 0) next = cityEvent(next, 'recovery');
  if (r.tierEligible > next.city.rewardedTier) {
    const gain = r.tierEligible - next.city.rewardedTier;
    next = adjustStock(next, inventory(next).root, 'materials', gain * 50);
    next = {
      ...next,
      city: {
        ...next.city,
        tier: r.tierEligible,
        rewardedTier: r.tierEligible,
        credits: next.city.credits + gain * 150,
      },
    };
    next = cityEvent(next, 'tier', r.tierEligible);
  }
  if (next.city.unlimited)
    next = {
      ...next,
      city: {
        ...next.city,
        credits: Math.max(10000, next.city.credits),
        stocks: { ...next.city.stocks, core: { food: 300, materials: 600, aether: 80 } },
      },
    };
  return { ...next, resources: inventory(next).stocks.materials };
}
export function tickCity(g: Game, dt: number): Game {
  let next = {
    ...g,
    city: {
      ...g.city,
      dayTime: (g.city.dayTime + dt) % CITY_RULES.daySeconds,
      economyClock: g.city.economyClock + dt,
      migrationClock: g.city.migrationClock + dt,
      orderCooldown: Math.max(0, g.city.orderCooldown - dt),
      foodCooldown: Math.max(0, g.city.foodCooldown - dt),
      powerBoost: Math.max(0, g.city.powerBoost - dt),
      powerCooldown: Math.max(0, g.city.powerCooldown - dt),
      orders: g.city.orders.map((o) => ({ ...o, remaining: Math.max(0, o.remaining - dt) })),
    },
  };
  if (next.city.economyClock + 1e-9 >= 1) {
    next = economyStep(next);
    next = {
      ...next,
      city: { ...next.city, economyClock: Math.max(0, next.city.economyClock - 1) },
    };
  }
  if (next.city.migrationClock + 1e-9 >= 5) {
    next = populationStep(next);
    next = {
      ...next,
      city: { ...next.city, migrationClock: Math.max(0, next.city.migrationClock - 5) },
    };
  }
  return next;
}
