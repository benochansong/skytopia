import { DISASTER, PHYSICAL, isLift } from '../../data/rules';
import type { Game, Target } from '../../types/game';
import { defenseReady, distance3 } from './effects';
import { key } from '../grid';
import { repair, targetInfo } from '../repair/maintenance';
import { analyze } from '../analysis';
import { validatePlacement } from '../placement';
import { place } from '../engine';
export function recoveryStep(g: Game, dt: number): Game {
  const d = g.disaster!;
  if (!d.autoRepair) return g;
  let next = { ...g, disaster: { ...d, repairClock: d.repairClock + dt } };
  if (
    next.disaster.repairClock <
    DISASTER.repairInterval * (g.worldContext?.techs.includes('rapidRepair') ? 0.75 : 1)
  )
    return next;
  next.disaster.repairClock = 0;
  const centers = g.buildings.filter((b) => b.kind === 'repairCenter' && defenseReady(g, b));
  if (!centers.length) return next;
  const priority = (kind: string) =>
    ['column', 'reinforcedColumn', 'industrialColumn', 'hanger'].includes(kind)
      ? 0
      : isLift(kind as Game['active']['kind'])
        ? 1
        : kind.includes('Power') || kind === 'power'
          ? 2
          : kind.includes('Bridge') ||
              ['road', 'elevator', 'stairs', 'bridge', 'relay'].includes(kind)
            ? 3
            : kind.includes('Home') || kind === 'home'
              ? 4
              : 5;
  const targets: Target[] = [
    ...g.buildings
      .filter((b) => b.durability < PHYSICAL[b.kind].hp * 0.95)
      .sort((a, b) => priority(a.kind) - priority(b.kind) || a.durability - b.durability)
      .map((b) => ({ type: 'building' as const, id: String(b.id) })),
    ...g.platforms
      .filter((p) => {
        const v = targetInfo(g, { type: 'platform', id: key(p) });
        return v && v.hp < v.maxHP * 0.95;
      })
      .map((p) => ({ type: 'platform' as const, id: key(p) })),
    ...[...analyze(g).structural.edges.values()]
      .filter((e) => e.hp < e.maxHP * 0.95)
      .map((e) => ({ type: 'edge' as const, id: e.key })),
  ];
  const core = g.platforms.find((p) => p.x === 0 && p.z === 0 && p.y === 0);
  if (core && core.durability < targetInfo(g, { type: 'platform', id: key(core) })!.maxHP * 0.95)
    targets.unshift({ type: 'platform', id: key(core) });
  if (d.repairTarget) targets.unshift(d.repairTarget);
  for (const center of centers.slice(0, 3)) {
    if (next.structure.repairs.length >= 3) break;
    const target = targets.find((t) => {
      const info = targetInfo(next, t);
      return (
        info &&
        info.hp < info.maxHP * 0.95 &&
        distance3(center.origin, info.cell) <= 5 &&
        !next.structure.repairs.some((r) => r.target.id === t.id && r.target.type === t.type)
      );
    });
    if (target) next = repair(next, target) as typeof next;
  }
  return next;
}
export function captureBlueprints(g: Game): Game {
  const d = g.disaster;
  if (!d?.baseline) return g;
  const known = new Set(d.blueprints.map((b) => b.id)),
    blueprints = [...d.blueprints];
  for (const p of d.baseline.platforms)
    if (!g.platforms.some((v) => key(v) === key(p)) && !known.has('p:' + key(p)))
      blueprints.push({
        id: 'p:' + key(p),
        cell: { x: p.x, y: p.y, z: p.z },
        piece: {
          kind: p.kind ?? (p.material === 'metal' ? 'metalPlatform' : 'platform'),
          shape: 'single',
          rotation: 0,
        },
      });
  for (const b of d.baseline.buildings)
    if (!g.buildings.some((v) => v.id === b.id) && !known.has('b:' + b.id))
      blueprints.push({
        id: 'b:' + b.id,
        cell: { ...b.origin },
        piece: {
          kind: b.kind,
          shape: b.shape,
          rotation: b.rotation,
          ...(b.pitch ? { pitch: b.pitch } : {}),
          ...(b.roll ? { roll: b.roll } : {}),
        },
      });
  if (blueprints.length === d.blueprints.length) return g;
  return { ...g, disaster: { ...d, blueprints: blueprints.slice(-DISASTER.maxBlueprints) } };
}
export function rebuild(g: Game, id: string): Game {
  const b = g.disaster?.blueprints.find((b) => b.id === id);
  if (!b) return g;
  const draft = {
    ...g,
    active: b.piece,
    cursor: b.cell,
    reservedActive: g.reservedActive ?? g.active,
  };
  if (!validatePlacement(draft).valid) return g;
  const built = place(draft);
  return {
    ...built,
    active: g.active,
    cursor: g.cursor,
    next: g.next,
    hold: g.hold,
    holdUsed: g.holdUsed,
    supply: g.supply,
    reservedActive: g.reservedActive,
    disaster: {
      ...built.disaster!,
      blueprints: built.disaster!.blueprints.filter((b) => b.id !== id),
    },
  };
}
