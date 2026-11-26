import { verticalPlacement } from './vertical/placement';
import { isLink } from './vertical/geometry';
import { canUse } from './campaign/runtime';
import { stage } from './campaign/definitions';
import { canPay } from './city/inventory';
import { constructionCost } from './city/actions';
import type { Game, Piece, Cell, Placement, PlacementReason } from '../types/game';
import { cellsOf, inBounds, key, neighbors } from './grid';
import { analyze } from './analysis';
import { PHYSICAL, STRUCTURE, isPlatform, VERTICAL_KINDS } from '../data/rules';
import { projectPlacement, braceTarget } from './building';
import { costFor, targetInfo } from './repair/maintenance';
export function validatePlacement(
  g: Game,
  p: Piece = g.active,
  cursor: Cell = g.cursor,
  warnings = true,
): Placement {
  const cells = cellsOf(p, cursor);
  const result = (
    valid: boolean,
    reason: PlacementReason,
    warning = false,
    risk: 0 | 1 | 2 | 3 = 0,
  ): Placement => ({ valid, reason, warning, cells, risk });
  if (
    !canUse(g, p.kind) ||
    (g.campaign &&
      !g.campaign.continued &&
      stage(g.campaign.stage).limit &&
      g.campaign.used >= stage(g.campaign.stage).limit!)
  )
    return result(false, 'resourcesNeeded');
  if (!g.vertical && (VERTICAL_KINDS.includes(p.kind) || (cursor.y ?? 0) !== 0))
    return result(false, 'verticalLocked');
  if (g.vertical) {
    const error = verticalPlacement(g, p, cursor);
    if (error) return result(false, error);
  }
  if (cells.some((c) => !inBounds(c))) return result(false, 'bounds');
  if (cells.some((c) => c.x === 0 && c.z === 0)) return result(false, 'core');
  const reserved = new Set(g.structure.pending);
  for (const e of g.structure.events)
    if (e.kind === 'collapse' && g.elapsed - e.time < STRUCTURE.debrisSeconds)
      for (const c of e.platforms) reserved.add(key(c));
  if (cells.some((c) => reserved.has(key(c)))) return result(false, 'settling');
  const platforms = new Set(g.platforms.filter((p) => p.durability > 0).map(key));
  const occupied = new Set(g.buildings.flatMap((b) => cellsOf(b, b.origin).map(key)));
  if (isPlatform(p.kind)) {
    if (cells.some((c) => platforms.has(key(c)))) return result(false, 'overlap');
    if (
      !(g.vertical && cells.some((c) => (c.y ?? 0) !== 0)) &&
      !cells.some((c) => neighbors(c).some((n) => platforms.has(key(n))))
    )
      return result(false, 'disconnectedPlatform');
  } else {
    if (!isLink(p) && cells.some((c) => !platforms.has(key(c))))
      return result(false, 'missingPlatform');
    if (p.kind === 'brace') {
      const info = targetInfo(g, braceTarget(g, p, cursor));
      if (!info || info.hp <= 0 || info.reinforcement >= STRUCTURE.maxReinforcement)
        return result(false, 'reinforcementLimit');
    } else if (!g.vertical && cells.some((c) => occupied.has(key(c))))
      return result(false, 'overlap');
  }
  if (
    g.city.enabled
      ? !canPay(g, constructionCost(g, p.kind))
      : g.reservedActive && g.resources < costFor(g, PHYSICAL[p.kind].cost)
  )
    return result(false, 'resourcesNeeded');
  if (warnings) {
    const projected = projectPlacement(g, p, cursor),
      s = analyze(projected),
      r = s.structural;
    if (r.critical || (r.worst && r.worst.ratio >= 1.5))
      return result(true, 'criticalWarning', true, 3);
    if (r.worst && r.worst.ratio > 1) return result(true, 'overloadWarning', true, 2);
    if (s.stability < 70) return result(true, 'balanceWarning', true, 1);
    if (!isPlatform(p.kind) && p.kind !== 'brace' && !s.connectedIds.has(g.nextId))
      return result(true, 'connectionWarning', true, 1);
    if (s.power < s.demand) return result(true, 'balanceWarning', true, 1);
  }
  return result(true, 'ready');
}
