import { DIFFICULTIES, STRUCTURE } from '../../data/rules';
import type { Game } from '../../types/game';
import { analyze } from '../analysis';
import { key, cellsOf } from '../grid';
import { damagePerSecond } from './evaluator';
import { fromKey } from './state';
import { recordEvent } from './events';
import { processCollapse } from './collapseSystem';
import { restoreTarget } from '../repair/maintenance';
export function structureStep(g: Game, dt = STRUCTURE.step): Game {
  if (g.structure.loss) return g;
  let next = g;
  const before = analyze(g).structural,
    difficulty = DIFFICULTIES[g.difficulty];
  // Output inertia gives the player a grace interval after grid failure.
  let lifts = g.structure.lifts;
  for (const l of before.lifts.filter((l) => l.id >= 0)) {
    const old = g.structure.lifts[l.id] ?? { factor: l.factor, outage: 0 };
    const outage = l.desired < 1 ? old.outage + dt : 0;
    const target =
      l.desired < old.factor && outage <= STRUCTURE.liftGrace
        ? old.factor
        : Math.max(l.desired, l.connected ? STRUCTURE.emergencyFloor : 0);
    const factor =
      old.factor < target
        ? Math.min(target, old.factor + dt * STRUCTURE.liftRecoveryPerSecond)
        : Math.max(target, old.factor - dt * STRUCTURE.liftFadePerSecond);
    if (factor !== old.factor || outage !== old.outage || !lifts[l.id]) {
      if (lifts === g.structure.lifts) lifts = { ...lifts };
      lifts[l.id] = { factor, outage };
    }
    if (old.outage <= STRUCTURE.liftGrace && outage > STRUCTURE.liftGrace)
      next = recordEvent(next, 'liftFading', String(l.id), l.cell);
  }
  const oldEmergency = g.structure.emergency;
  const emergency =
    oldEmergency.remaining > 0 || oldEmergency.cooldown > 0
      ? {
          ...oldEmergency,
          remaining: Math.max(0, oldEmergency.remaining - dt),
          cooldown: Math.max(0, oldEmergency.cooldown - dt),
        }
      : oldEmergency;
  next = {
    ...next,
    structure: { ...next.structure, lifts, emergency, grace: Math.max(0, g.structure.grace - dt) },
  };
  const report = analyze(next).structural;
  let platforms = next.platforms,
    edges = next.structure.edges,
    buildings = next.buildings;
  if (g.structure.grace <= 0) {
    platforms = next.platforms.map((p) => {
      const n = report.nodes.get(key(p))!,
        loss = damagePerSecond(n.ratio) * difficulty.damage * dt;
      if (loss <= 0) return p;
      const hp = Math.max(0, p.durability - loss);
      if (p.durability >= n.maxHP * 0.65 && hp < n.maxHP * 0.65)
        next = recordEvent(next, 'crack', key(p), p);
      return { ...p, durability: hp };
    });
    if (platforms.every((p, i) => p === next.platforms[i])) platforms = next.platforms;
    for (const [id, e] of report.edges) {
      const loss = damagePerSecond(e.ratio) * difficulty.damage * dt;
      if (loss <= 0 || e.hp <= 0) continue;
      if (edges === next.structure.edges) edges = { ...edges };
      const hp = Math.max(0, e.hp - loss);
      edges[id] = { durability: hp, reinforcement: e.reinforcement };
      if (hp === 0) next = recordEvent(next, 'edgeFailed', id, fromKey(e.a));
      else if (e.hp >= e.maxHP * 0.65 && hp < e.maxHP * 0.65)
        next = recordEvent(next, 'crack', id, fromKey(e.a));
    }
    buildings = next.buildings.map((b) => {
      const stress = Math.max(
        0,
        ...cellsOf(b, b.origin).map((c) => report.nodes.get(key(c))?.ratio ?? 0),
      );
      const loss = stress > 1.2 ? damagePerSecond(stress) * 0.18 * dt * difficulty.damage : 0;
      return loss ? { ...b, durability: Math.max(0, b.durability - loss) } : b;
    });
    if (buildings.every((b, i) => b === next.buildings[i])) buildings = next.buildings;
  }
  next = {
    ...next,
    platforms,
    buildings,
    structure: {
      ...next.structure,
      edges,
      repairs: next.structure.repairs.map((r) => ({ ...r, remaining: r.remaining - dt })),
    },
  };
  for (const r of next.structure.repairs.filter((r) => r.remaining <= 0))
    next = restoreTarget(next, r.target);
  if (next.structure.repairs.some((r) => r.remaining <= 0))
    next = {
      ...next,
      structure: {
        ...next.structure,
        repairs: next.structure.repairs.filter((r) => r.remaining > 0),
      },
    };
  next = processCollapse(next);
  const after = analyze(next).structural;
  const criticalTime =
    after.critical && next.structure.grace <= 0 ? g.structure.criticalTime + dt : 0;
  if (criticalTime > 0 && g.structure.criticalTime === 0)
    next = recordEvent(next, 'critical', after.critical!, after.worst?.cell ?? { x: 0, z: 0 });
  if (!after.critical && g.structure.criticalTime > 0)
    next = recordEvent(next, 'recovered', 'city', { x: 0, z: 0 });
  const loss =
    after.critical && criticalTime >= difficulty.grace
      ? {
          reason: after.critical,
          time: next.elapsed,
          firstFailure:
            next.structure.events.find((e) => e.kind === 'edgeFailed' || e.kind === 'collapse')
              ?.target ??
            after.worst?.id ??
            'core',
        }
      : null;
  return {
    ...next,
    structure: {
      ...next.structure,
      criticalTime,
      loss,
      maxCitySize: Math.max(g.structure.maxCitySize, next.platforms.length + next.buildings.length),
    },
  };
}
export function simulateStructure(g: Game, dt: number): Game {
  let next = g,
    acc = g.structure.accumulator + dt,
    steps = 0;
  while (acc + 1e-9 >= STRUCTURE.step && steps < 8 && !next.structure.loss) {
    next = structureStep(next);
    acc -= STRUCTURE.step;
    steps++;
  }
  return { ...next, structure: { ...next.structure, accumulator: Math.max(0, acc) } };
}
