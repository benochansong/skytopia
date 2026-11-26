import { canUse } from '../campaign/runtime';
import type { Game, Kind } from '../../types/game';
import { BLOCKS, PHYSICAL } from '../../data/rules';
import { OPERATION, CITY_RULES, facility, cityDifficulty } from '../../data/cityRules';
import { canPay, pay, adjustStock, inventory } from './inventory';
import type { Cost } from './inventory';
import { cityReport } from './report';
import { cityEvent } from './state';
import { analyze } from '../analysis';
export function unlocked(g: Game, kind: Kind) {
  if (g.campaign) return canUse(g, kind);
  return (
    g.mode === 'citylab' ||
    OPERATION[kind].unlock <=
      Math.max(g.city.tier, g.missionId >= 8 ? 4 : g.missionId >= 7 ? 3 : g.missionId >= 6 ? 2 : 1)
  );
}
export function constructionCost(g: Game, kind: Kind, emergency = !!g.reservedActive): Cost {
  const base = PHYSICAL[kind].cost,
    mult = g.difficulty === 'easy' ? 0.75 : g.difficulty === 'hard' ? 1.2 : 1;
  return {
    materials: emergency ? Math.ceil(base * mult) : 0,
    credits: Math.ceil(base * (emergency ? 0.6 : 0.15) * mult),
    aether: ['liftLarge', 'aetherPower', 'manufacturer', 'hydroponics'].includes(kind) ? 2 : 0,
  };
}
export function orderCost(kind: Kind): Cost {
  return {
    materials: Math.ceil(PHYSICAL[kind].cost * 1.25),
    credits: Math.ceil(PHYSICAL[kind].cost * 1.5),
    aether: OPERATION[kind].unlock >= 4 ? 5 : 0,
  };
}
export function orderBuilding(g: Game, kind: Kind): Game {
  const cost = orderCost(kind);
  if (
    !g.city.enabled ||
    g.campaign?.stage === 101 ||
    !unlocked(g, kind) ||
    g.city.orders.length >= CITY_RULES.maxOrders ||
    g.city.orderCooldown > 0 ||
    !canPay(g, cost) ||
    g.structure.loss
  )
    return g;
  const next = pay(g, cost);
  return {
    ...next,
    city: {
      ...next.city,
      orders: [
        ...next.city.orders,
        {
          piece: { kind, shape: BLOCKS[kind].shapes[0], rotation: 0 },
          remaining: CITY_RULES.orderSeconds,
        },
      ],
      orderCooldown: CITY_RULES.orderCooldown,
    },
  };
}
export function upgradePreview(g: Game, id: number) {
  const b = g.buildings.find((b) => b.id === id);
  if (!b) return null;
  const level = b.level ?? 0,
    cost: Cost = {
      materials: PHYSICAL[b.kind].cost * (level + 1),
      credits: PHYSICAL[b.kind].cost * 2 * (level + 1),
      aether:
        level || ['liftLarge', 'aetherPower', 'manufacturer', 'hydroponics'].includes(b.kind)
          ? 5
          : 0,
    };
  const next = {
      ...g,
      buildings: g.buildings.map((v) => (v.id === id ? { ...v, level: level + 1 } : v)),
    },
    before = facility(b),
    after = facility({ ...b, level: level + 1 }),
    stats = analyze(next),
    operation = cityReport(g).operations.get(id);
  return {
    next,
    cost,
    before,
    after,
    stability: stats.stability,
    allowed:
      (!g.campaign || g.campaign.continued || g.campaign.stage >= 11) &&
      g.city.enabled &&
      level < OPERATION[b.kind].maxLevel &&
      !!operation?.road &&
      operation.status !== 'power' &&
      b.enabled &&
      b.durability > 0 &&
      !stats.structural.critical &&
      (stats.structural.worst?.ratio ?? 0) <= 1.25 &&
      canPay(g, cost),
  };
}
export function upgrade(g: Game, id: number): Game {
  const p = upgradePreview(g, id);
  if (!p?.allowed || g.structure.loss) return g;
  return cityEvent({ ...pay(g, p.cost), buildings: p.next.buildings }, 'upgrade', id);
}
export function setOperation(
  g: Game,
  id: number,
  patch: { enabled?: boolean; priority?: number },
): Game {
  if (g.structure.loss) return g;
  if (
    patch.priority !== undefined &&
    (!Number.isInteger(patch.priority) || patch.priority < 0 || patch.priority > 5)
  )
    return g;
  return { ...g, buildings: g.buildings.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
}
export function emergencyFood(g: Game): Game {
  const cost = { materials: 0, credits: CITY_RULES.foodPrice, aether: 0 };
  if (g.structure.loss) return g;
  if (g.city.foodCooldown > 0 || !canPay(g, cost) || !g.city.enabled) return g;
  const next = adjustStock(pay(g, cost), inventory(g).root, 'food', CITY_RULES.foodDelivery);
  return cityEvent(
    { ...next, city: { ...next.city, foodCooldown: CITY_RULES.foodCooldown } },
    'aid',
    CITY_RULES.foodDelivery,
  );
}
export function emergencyPower(g: Game): Game {
  const cost = { materials: 15, credits: 35, aether: 2 };
  if (g.structure.loss || !g.city.enabled || g.city.powerCooldown > 0 || !canPay(g, cost)) return g;
  const next = pay(g, cost);
  return cityEvent(
    {
      ...next,
      city: {
        ...next.city,
        powerBoost: CITY_RULES.powerSeconds,
        powerCooldown: CITY_RULES.powerCooldown,
      },
    },
    'aid',
    30,
  );
}
export function aid(g: Game): Game {
  if (
    g.structure.loss ||
    !g.city.enabled ||
    g.city.aidUses >= cityDifficulty[g.difficulty].aid ||
    g.city.credits >= 100
  )
    return g;
  let next = adjustStock(g, inventory(g).root, 'food', 60);
  next = adjustStock(next, inventory(next).root, 'materials', 30);
  return cityEvent(
    {
      ...next,
      city: { ...next.city, credits: next.city.credits + 100, aidUses: next.city.aidUses + 1 },
    },
    'aid',
    100,
  );
}
export function sell(g: Game, resource: 'food' | 'materials' | 'aether'): Game {
  const stock = inventory(g),
    amount = Math.min(20, stock.stocks[resource]);
  if (g.structure.loss || !g.city.enabled || g.city.unlimited || amount <= 0) return g;
  const next = adjustStock(g, stock.root, resource, -amount);
  return {
    ...next,
    city: {
      ...next.city,
      credits: next.city.credits + amount * (resource === 'aether' ? 2 : 0.25),
    },
  };
}
