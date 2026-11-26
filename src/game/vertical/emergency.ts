import type { Game, Target } from '../../types/game';
import { VERTICAL } from '../../data/rules';
import { isLink } from './geometry';
import { canPay, pay } from '../city/inventory';
import { costFor } from '../repair/maintenance';
export function temporarySupport(g: Game, target: Target): Game {
  const b =
    target.type === 'building' ? g.buildings.find((b) => String(b.id) === target.id) : undefined;
  if (
    !g.vertical ||
    !b ||
    !isLink(b) ||
    b.durability <= 0 ||
    g.vertical.emergencyCooldown > 0 ||
    g.structure.loss
  )
    return g;
  const cost = costFor(g, 20),
    fee = { materials: cost, credits: cost / 2, aether: 0 };
  if (g.city.enabled ? !canPay(g, fee) : g.resources < cost) return g;
  const paid = g.city.enabled ? pay(g, fee) : { ...g, resources: g.resources - cost };
  return {
    ...paid,
    buildings: g.buildings.map((o) =>
      o.id === b.id ? { ...o, temporary: VERTICAL.emergencySeconds } : o,
    ),
    vertical: { ...g.vertical, emergencyCooldown: 45 },
  };
}
