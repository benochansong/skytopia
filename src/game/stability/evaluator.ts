import { weatherLoads, gravityFactor } from '../disasters/effects';
import { memberCapacity } from '../vertical/support';
import { hasVertical } from '../vertical/geometry';
import { DIFFICULTIES, STRUCTURE } from '../../data/rules';
import { key } from '../grid';
import { analyzeNetwork } from './network';
import { calculateMass } from './massCalculator';
import { calculateLift } from './liftCalculator';
import { solveLoads } from './loadSolver';
import { buildGraph } from './structuralGraph';
import { edgeKey, platformDefinition, platformMaxHP, fromKey } from './state';
import type { City, Network, StructuralEdge, StructuralNode, StructuralReport } from './types';
export const damagePerSecond = (ratio: number) =>
  ratio > 1 ? STRUCTURE.damageRate * Math.pow(ratio - 1, 1.5) : 0;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
export function evaluateStructure(
  city: City,
  network: Network = analyzeNetwork(city),
): StructuralReport {
  const mass = calculateMass(city),
    lift = calculateLift(city, network),
    graph = buildGraph(city),
    difficulty = DIFFICULTIES[city.difficulty ?? 'normal'];
  const weather = weatherLoads(city);
  const residual = new Map(
      [...mass.local].map(([k, n]) => [
        k,
        n * gravityFactor(city, graph.nodes.get(k) ?? { x: 0, z: 0 }) + (weather.local.get(k) ?? 0),
      ]),
    ),
    nodes = new Map<string, StructuralNode>(),
    edges = new Map<string, StructuralEdge>();
  for (const l of lift.lifts) {
    const starts = l.cells.filter((k) => graph.nodes.has(k));
    const reached = new Map<string, number>(),
      q = starts.map((k) => ({ k, d: 0 }));
    for (let i = 0; i < q.length; i++) {
      const { k, d } = q[i];
      if (reached.has(k) || d > 2) continue;
      reached.set(k, d);
      q.push(...graph.adjacency.get(k)!.map((n) => ({ k: n, d: d + 1 })));
    }
    const total = [...reached.keys()].reduce((s, k) => s + (residual.get(k) ?? 0), 0),
      fraction = Math.min(1, l.output / Math.max(1, total));
    for (const k of reached.keys()) residual.set(k, (residual.get(k) ?? 0) * (1 - fraction));
  }
  const components = graph.components.map((c, index) => ({
    ...c,
    mass: c.keys.reduce(
      (s, k) => s + (mass.local.get(k) ?? 0) * gravityFactor(city, graph.nodes.get(k)!),
      0,
    ),
    lift: lift.lifts.reduce(
      (s, l) => s + (l.output * l.cells.filter((k) => c.keys.includes(k)).length) / l.cells.length,
      0,
    ),
    index,
  }));
  for (const comp of components) {
    const distance = new Map<string, number>();
    const roots = comp.anchored
      ? comp.keys.filter((k) => graph.nodes.get(k)!.anchor || k === '0,0')
      : comp.keys.filter((k) => lift.lifts.some((l) => l.output > 0 && l.cells.includes(k)));
    const queue = roots.map((k) => ({ k, d: 0 }));
    for (let i = 0; i < queue.length; i++) {
      const { k, d } = queue[i];
      if (distance.has(k)) continue;
      distance.set(k, d);
      queue.push(...graph.adjacency.get(k)!.map((n) => ({ k: n, d: d + 1 })));
    }
    const potential = solveLoads(comp.keys, graph.adjacency, roots, residual);
    for (const k of comp.keys) {
      const p = graph.nodes.get(k)!,
        d = distance.get(k) ?? 99,
        maxHP = platformMaxHP(p),
        hp = p.durability;
      const capacity =
        platformDefinition(p).maxLoad *
        (1 + p.reinforcement * STRUCTURE.braceCapacity) *
        difficulty.strength *
        (0.35 + 0.65 * Math.min(1, hp / maxHP));
      const current =
        (residual.get(k) ?? 0) +
        graph.adjacency
          .get(k)!
          .reduce((s, n) => s + Math.max(0, potential.get(n)! - potential.get(k)!), 0);
      nodes.set(k, {
        key: k,
        platform: p,
        mass: mass.local.get(k) ?? 0,
        load: current,
        capacity,
        ratio: current / Math.max(1, capacity),
        hp,
        maxHP,
        distance: d,
        component: comp.index,
        supported: comp.anchored || comp.lift >= comp.mass,
      });
      for (const n of graph.adjacency.get(k)!) {
        const eid = edgeKey(k, n);
        if (edges.has(eid)) continue;
        const other = graph.nodes.get(n)!,
          state = city.structure?.edges[eid],
          reinforcement = state?.reinforcement ?? 0;
        const edgeHP = STRUCTURE.linkHP + reinforcement * STRUCTURE.braceHP,
          health = state?.durability ?? edgeHP;
        const support = graph.members.get(eid);
        const allowed = support
          ? support.reduce(
              (n, b) => n + memberCapacity(b, city, (network.powerRatios.get(b.id) ?? 0) >= 0.99),
              0,
            ) * difficulty.strength
          : Math.min(platformDefinition(p).linkStrength, platformDefinition(other).linkStrength) *
            (1 + reinforcement * STRUCTURE.braceCapacity) *
            difficulty.strength *
            (0.35 + 0.65 * Math.min(1, health / edgeHP));
        const edgeLoad =
          Math.abs(potential.get(k)! - potential.get(n)!) *
          (1 + Math.max(d, distance.get(n) ?? 0) * STRUCTURE.momentPerSpan);
        edges.set(eid, {
          key: eid,
          a: k,
          b: n,
          load: edgeLoad,
          capacity: allowed,
          ratio: edgeLoad / Math.max(1, allowed),
          hp: support ? Math.min(...support.map((b) => b.durability)) : health,
          maxHP: support ? 200 : edgeHP,
          reinforcement,
        });
      }
    }
  }

  for (const [k, p] of graph.nodes)
    for (const q of [
      { x: p.x + 1, y: p.y, z: p.z },
      { x: p.x, y: p.y, z: p.z + 1 },
    ])
      if (graph.nodes.has(key(q))) {
        const eid = edgeKey(k, key(q));
        if (edges.has(eid)) continue;
        const st = city.structure?.edges[eid],
          r = st?.reinforcement ?? 0,
          maxHP = STRUCTURE.linkHP + r * STRUCTURE.braceHP;
        edges.set(eid, {
          key: eid,
          a: k,
          b: key(q),
          load: 0,
          capacity:
            Math.min(
              platformDefinition(p).linkStrength,
              platformDefinition(graph.nodes.get(key(q))!).linkStrength,
            ) *
            (1 + r * STRUCTURE.braceCapacity) *
            difficulty.strength,
          ratio: 0,
          hp: st?.durability ?? maxHP,
          maxHP,
          reinforcement: r,
        });
      }
  const usedLift = Math.min(mass.mass, lift.total),
    torque = {
      x: usedLift * lift.center.z - mass.mass * mass.center.z + weather.torqueX,
      z: mass.mass * mass.center.x - usedLift * lift.center.x + weather.torqueZ,
    };
  const angle = (v: number) =>
    Math.max(
      -STRUCTURE.maxTilt,
      Math.min(
        STRUCTURE.maxTilt,
        (Math.atan(
          v /
            (STRUCTURE.stiffness /
              (hasVertical(city) ? 1 + Math.max(0, mass.center.y - lift.center.y) * 0.08 : 1)),
        ) *
          180) /
          Math.PI,
      ),
    );
  const tilt = { x: angle(torque.x), z: angle(torque.z) },
    separation = Math.hypot(mass.center.x - lift.center.x, mass.center.z - lift.center.z);
  const liftScore = clamp(100 - Math.max(0, mass.mass / Math.max(1, lift.total) - 0.8) * 150),
    balanceScore = clamp(100 - separation * 18 - Math.hypot(tilt.x, tilt.z) * 0.5);
  let worst: StructuralReport['worst'] = null,
    damage = 0,
    maxRatio = 0,
    minHealth = 1;
  const consider = (
    type: 'platform' | 'edge',
    id: string,
    cell: { x: number; z: number },
    ratio: number,
    hp: number,
    maxHP: number,
  ) => {
    if (hp < maxHP - 0.01) damage++;
    maxRatio = Math.max(maxRatio, ratio);
    minHealth = Math.min(minHealth, hp / maxHP);
    const severity = Math.max(ratio, 1 - hp / maxHP);
    if (!worst || severity > Math.max(worst.ratio, 1 - worst.hp / worst.maxHP))
      worst = {
        type,
        id,
        cell,
        ratio,
        hp,
        maxHP,
        eta:
          damagePerSecond(ratio) > 0 ? hp / (damagePerSecond(ratio) * difficulty.damage) : Infinity,
      };
  };
  for (const [k, n] of nodes) consider('platform', k, n.platform, n.ratio, n.hp, n.maxHP);
  for (const [k, e] of edges) consider('edge', k, fromKey(e.a), e.ratio, e.hp, e.maxHP);
  const structureScore = clamp(100 - Math.max(0, maxRatio - 0.7) * 75 - (1 - minHealth) * 20);
  const critical =
    !graph.nodes.has('0,0') || (city.structure?.coreDurability ?? 500) <= 0
      ? 'core'
      : lift.total / mass.mass < STRUCTURE.criticalLiftRatio
        ? 'lift'
        : separation > STRUCTURE.criticalSeparation ||
            Math.hypot(tilt.x, tilt.z) > STRUCTURE.criticalTilt
          ? 'balance'
          : null;
  return {
    mass: mass.mass,
    center: mass.center,
    lift: lift.total,
    liftMaximum: lift.maximum,
    centerLift: lift.center,
    torque,
    tilt,
    separation,
    liftScore,
    balanceScore,
    structureScore,
    overall: 0.35 * liftScore + 0.3 * balanceScore + 0.35 * structureScore,
    critical,
    nodes,
    edges,
    components,
    lifts: lift.lifts,
    worst,
    damaged: damage,
    disconnectedGroups: components.filter((c) => !c.anchored).length,
    unsafeEdges: [...edges.values()].filter((e) => e.ratio > 1 || e.hp <= 0).length,
  };
}
