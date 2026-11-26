import { BLOCKS, DISASTER, PHYSICAL, PROTECTION } from '../../data/rules';
import type { Game } from '../../types/game';
import type { Impact } from '../../types/disaster';
import { operatingNetwork } from '../city/operations';
import { adjustStock, inventory } from '../city/inventory';
import { defenseReady, distance3, protection } from './effects';
import { key } from '../grid';
import { volume } from '../vertical/geometry';
export function updateDefenses(g: Game, dt: number): Game {
  const d = g.disaster!;
  const ops = operatingNetwork(g);
  const ready = g.buildings
    .filter(
      (b) =>
        b.enabled &&
        b.durability > 0 &&
        (!BLOCKS[b.kind].demand ||
          ((ops.network.powerRatios.get(b.id) ?? 0) >= 0.99 &&
            (ops.operations.get(b.id)?.efficiency ?? 0) > 0.4)),
    )
    .map((b) => b.id);
  let next: Game = { ...g, disaster: { ...d, ready, shields: { ...d.shields } } };
  for (const b of g.buildings.filter((b) => ['shieldSmall', 'shieldLarge'].includes(b.kind))) {
    const capacity = (PROTECTION[b.kind]!.capacity * b.durability) / PHYSICAL[b.kind].hp;
    let energy = Math.min(capacity, d.shields[b.id] ?? 0);
    if (defenseReady(next, b)) {
      const pool = ops.road.attachments.get(b.id),
        stock = pool ? (inventory(next).poolStocks.get(pool)?.aether ?? 0) : 0;
      const gain = Math.max(
        0,
        Math.min(
          capacity - energy,
          DISASTER.shieldRecharge *
            (g.worldContext?.techs.includes('shieldNetwork') ? 1.15 : 1) *
            dt,
          stock / DISASTER.shieldAether,
        ),
      );
      if (pool && gain) {
        next = adjustStock(next, pool, 'aether', -gain * DISASTER.shieldAether);
        energy += gain;
      }
    }
    next.disaster = { ...next.disaster!, shields: { ...next.disaster!.shields, [b.id]: energy } };
  }
  const live = new Set(g.buildings.map((b) => String(b.id)));
  return {
    ...next,
    disaster: {
      ...next.disaster!,
      shields: Object.fromEntries(
        Object.entries(next.disaster!.shields).filter(([id]) => live.has(id)),
      ),
    },
  };
}
export function applyImpact(g: Game, impact: Impact): Game {
  const d = g.disaster!;
  if (d.applied.includes(impact.id)) return g;
  let damage = Math.min(DISASTER.impactCap, impact.power),
    absorbed = 0,
    cell = impact.cell;
  let shields = { ...d.shields };
  let protectedCount = 0;
  if (impact.kind === 'meteor') {
    const shield = g.buildings
      .filter(
        (b) =>
          ['shieldSmall', 'shieldLarge'].includes(b.kind) &&
          defenseReady(g, b) &&
          distance3(b.origin, cell) <= PROTECTION[b.kind]!.radius,
      )
      .sort((a, b) => (shields[b.id] ?? 0) - (shields[a.id] ?? 0))[0];
    if (shield) {
      absorbed = Math.min(damage, shields[shield.id] ?? 0);
      shields[shield.id] = (shields[shield.id] ?? 0) - absorbed;
      damage -= absorbed;
      if (absorbed > 0) protectedCount++;
    }
  } else {
    const rod = g.buildings
      .filter(
        (b) =>
          ['lightningRod', 'lightningTower'].includes(b.kind) &&
          defenseReady(g, b) &&
          distance3(b.origin, cell) <= PROTECTION[b.kind]!.radius,
      )
      .sort((a, b) => PROTECTION[b.kind]!.strength - PROTECTION[a.kind]!.strength)[0];
    if (rod) {
      absorbed = damage * PROTECTION[rod.kind]!.strength;
      damage -= absorbed;
      cell = rod.origin;
      protectedCount++;
    }
  }
  const outages = { ...d.outages };
  const buildings = g.buildings.map((b) => {
    const distance = Math.min(...volume(b, b.origin).map((c) => distance3(c, cell)));
    if (distance > impact.radius) return b;
    const loss = damage * (1 - (0.55 * distance) / Math.max(1, impact.radius));
    if (impact.kind === 'lightning' && loss > 2 && !protectedCount)
      outages[b.id] = Math.max(
        outages[b.id] ?? 0,
        12 * (1 - protection(g, b.origin, ['surgeRelay'])),
      );
    return { ...b, durability: Math.max(0, b.durability - loss) };
  });
  const hitKeys = new Set(g.platforms.filter((p) => distance3(p, cell) <= impact.radius).map(key));
  const platforms = g.platforms.map((p) =>
    hitKeys.has(key(p))
      ? {
          ...p,
          durability: Math.max(
            p.x === 0 && p.z === 0 && p.y === 0 ? 25 : 0,
            p.durability - damage * (impact.kind === 'meteor' ? 0.45 : 0.08),
          ),
        }
      : p,
  );
  const edges = Object.fromEntries(
    Object.entries(g.structure.edges).map(([id, e]) => [
      id,
      id.split('|').some((k) => hitKeys.has(k))
        ? { ...e, durability: Math.max(0, e.durability - damage * 0.2) }
        : e,
    ]),
  );
  const effect = {
    id: impact.id,
    kind: absorbed >= impact.power ? ('shield' as const) : impact.kind,
    cell: { ...cell },
    age: 0,
  };
  return {
    ...g,
    buildings,
    platforms,
    structure: { ...g.structure, edges },
    disaster: {
      ...d,
      shields,
      outages,
      applied: [...d.applied, impact.id].slice(-128),
      effects: [...d.effects, effect].slice(-DISASTER.maxEffects),
      stats: {
        ...d.stats,
        absorbed: d.stats.absorbed + absorbed,
        intercepted:
          d.stats.intercepted + (impact.kind === 'meteor' && absorbed >= impact.power ? 1 : 0),
        lightningProtected:
          d.stats.lightningProtected + (impact.kind === 'lightning' ? protectedCount : 0),
      },
    },
  };
}
