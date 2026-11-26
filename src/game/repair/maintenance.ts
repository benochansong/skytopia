import { BLOCKS } from '../../data/rules';
import { pay, canPay, adjustStock, inventory } from '../city/inventory';
import { reconcileResidents } from '../city/population';
import { reconcileStores } from '../city/simulation';
import { DIFFICULTIES, PHYSICAL, STRUCTURE, isLift } from '../../data/rules';
import type { Game, Target, Cell, Kind } from '../../types/game';
import { analyze } from '../analysis';
import { cellsOf, key } from '../grid';
import { fromKey, platformMaxHP, platformDefinition } from '../stability/state';
import { recordEvent } from '../stability/events';
export function targetAt(g: Game, c: Cell): Target {
  const b = g.buildings.find((b) => cellsOf(b, b.origin).some((p) => key(p) === key(c)));
  return b ? { type: 'building', id: String(b.id) } : { type: 'platform', id: key(c) };
}
export function targetInfo(g: Game, target: Target) {
  const s = analyze(g).structural;
  if (target.type === 'building') {
    const b = g.buildings.find((b) => String(b.id) === target.id);
    return b
      ? {
          hp: b.durability,
          maxHP: PHYSICAL[b.kind].hp,
          cell: b.origin,
          cost: PHYSICAL[b.kind].repairCost,
          reinforcement: 0,
        }
      : null;
  }
  if (target.type === 'platform') {
    const p = g.platforms.find((p) => key(p) === target.id);
    return p
      ? {
          hp: p.durability,
          maxHP: platformMaxHP(p),
          cell: p,
          cost: platformDefinition(p).repairCost,
          reinforcement: p.reinforcement,
        }
      : null;
  }
  const e = s.edges.get(target.id);
  return e
    ? { hp: e.hp, maxHP: e.maxHP, cell: fromKey(e.a), cost: 15, reinforcement: e.reinforcement }
    : null;
}
export const costFor = (g: Game, base: number) =>
  g.mode === 'lab' || g.city.unlimited ? 0 : Math.ceil(base * DIFFICULTIES[g.difficulty].cost);
export function repair(g: Game, target: Target): Game {
  const info = targetInfo(g, target);
  if (
    !info ||
    info.hp >= info.maxHP ||
    g.structure.repairs.some((r) => r.target.type === target.type && r.target.id === target.id) ||
    g.structure.loss
  )
    return g;
  const cost = costFor(g, info.cost);
  if (
    g.city.enabled
      ? !canPay(g, { materials: cost, credits: cost / 2, aether: 0 })
      : g.resources < cost
  )
    return g;
  return {
    ...(g.city.enabled
      ? pay(g, { materials: cost, credits: cost / 2, aether: 0 })
      : { ...g, resources: g.resources - cost }),
    structure: {
      ...g.structure,
      repairs: [...g.structure.repairs, { target, remaining: STRUCTURE.repairSeconds }],
    },
  };
}
export function restoreTarget(g: Game, target: Target): Game {
  const info = targetInfo(g, target);
  if (!info) return g;
  const hp = Math.min(info.maxHP, info.hp + info.maxHP * STRUCTURE.repairFraction);
  let next = g;
  if (target.type === 'platform')
    next = {
      ...g,
      platforms: g.platforms.map((p) => (key(p) === target.id ? { ...p, durability: hp } : p)),
    };
  else if (target.type === 'building')
    next = {
      ...g,
      buildings: g.buildings.map((b) =>
        String(b.id) === target.id ? { ...b, durability: hp } : b,
      ),
    };
  else
    next = {
      ...g,
      structure: {
        ...g.structure,
        edges: {
          ...g.structure.edges,
          [target.id]: { durability: hp, reinforcement: info.reinforcement },
        },
      },
    };
  next = { ...next, structure: { ...next.structure, repairsDone: next.structure.repairsDone + 1 } };
  return recordEvent(next, 'repair', target.id, info.cell);
}
export function reinforce(g: Game, target: Target, free = false): Game {
  if (target.type === 'building' || g.structure.loss) return g;
  const info = targetInfo(g, target);
  if (!info || info.reinforcement >= STRUCTURE.maxReinforcement || info.hp <= 0) return g;
  const cost = free ? 0 : costFor(g, PHYSICAL.brace.cost);
  if (
    g.city.enabled
      ? !canPay(g, { materials: cost, credits: cost / 2, aether: 0 })
      : g.resources < cost
  )
    return g;
  let next = g.city.enabled
    ? pay(g, { materials: cost, credits: cost / 2, aether: 0 })
    : { ...g, resources: g.resources - cost };
  if (target.type === 'platform')
    next = {
      ...next,
      platforms: g.platforms.map((p) =>
        key(p) === target.id
          ? {
              ...p,
              reinforcement: p.reinforcement + 1,
              durability: p.durability + STRUCTURE.braceHP,
            }
          : p,
      ),
    };
  else
    next = {
      ...next,
      structure: {
        ...g.structure,
        edges: {
          ...g.structure.edges,
          [target.id]: {
            durability: info.hp + STRUCTURE.braceHP,
            reinforcement: info.reinforcement + 1,
          },
        },
      },
    };
  next = {
    ...next,
    structure: { ...next.structure, reinforcementsDone: next.structure.reinforcementsDone + 1 },
  };
  return recordEvent(next, 'reinforce', target.id, info.cell);
}
export function demolitionPreview(g: Game, target: Target): Game {
  if (target.type !== 'building') return g;
  const b = g.buildings.find((b) => String(b.id) === target.id);
  if (!b) return g;
  const lifts = { ...g.structure.lifts };
  delete lifts[b.id];
  const next = {
    ...g,
    buildings: g.buildings.filter((v) => v.id !== b.id),
    structure: { ...g.structure, lifts },
  };
  return g.city.enabled
    ? reconcileStores(reconcileResidents(next))
    : { ...next, population: Math.min(next.population, analyze(next).capacity) };
}
export function demolish(g: Game, target: Target): Game {
  if (g.structure.loss) return g;
  let next = demolitionPreview(g, target);
  if (next === g) return g;
  const b = g.buildings.find((b) => String(b.id) === target.id)!;
  if (g.city.enabled)
    next = adjustStock(
      next,
      inventory(next).root,
      'materials',
      Math.floor(PHYSICAL[b.kind].cost * STRUCTURE.salvageFraction),
    );
  return recordEvent(
    {
      ...next,
      resources: g.city.enabled
        ? next.resources
        : g.resources +
          (g.mode === 'lab' ? 0 : Math.floor(PHYSICAL[b.kind].cost * STRUCTURE.salvageFraction)),
    },
    'demolish',
    target.id,
    b.origin,
    [],
    [b],
  );
}
export function emergencyLift(g: Game, cell: Cell): Game {
  const cost = costFor(g, STRUCTURE.emergencyCost);
  if (
    g.structure.loss ||
    g.structure.emergency.cooldown > 0 ||
    (g.city.enabled
      ? !canPay(g, { materials: cost, credits: cost / 2, aether: 2 })
      : g.resources < cost) ||
    !g.platforms.some((p) => p.durability > 0 && key(p) === key(cell))
  )
    return g;
  return recordEvent(
    {
      ...(g.city.enabled
        ? pay(g, { materials: cost, credits: cost / 2, aether: 2 })
        : { ...g, resources: g.resources - cost }),
      structure: {
        ...g.structure,
        emergency: {
          cell: { x: cell.x, z: cell.z },
          remaining: STRUCTURE.emergencySeconds,
          cooldown: STRUCTURE.emergencyCooldown,
        },
      },
    },
    'emergency',
    key(cell),
    cell,
  );
}
export const EMERGENCY_KINDS: Kind[] = [
  'platform',
  'metalPlatform',
  'road',
  'power',
  'liftSmall',
  'liftLarge',
  'brace',
  'ballast',
];
export function selectBlueprint(g: Game, kind: Kind): Game {
  if (g.structure.loss || (!['lab', 'citylab'].includes(g.mode) && !EMERGENCY_KINDS.includes(kind)))
    return g;
  return {
    ...g,
    active: {
      kind,
      shape: BLOCKS[kind].shapes[0],
      rotation: 0,
    },
    reservedActive: ['lab', 'citylab'].includes(g.mode) ? null : (g.reservedActive ?? g.active),
  };
}
export function toggleLift(g: Game, id: number): Game {
  if (!g.buildings.some((b) => b.id === id && isLift(b.kind))) return g;
  return {
    ...g,
    buildings: g.buildings.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)),
  };
}
