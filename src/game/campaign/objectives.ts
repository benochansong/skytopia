import { PHYSICAL, DISASTER } from '../../data/rules';
import { defenseReady, evacuatedTotal } from '../disasters/effects';
import { resilience } from '../disasters/report';
import { VERTICAL_DEFS } from '../../data/rules';
import { endpoints, hasPlatform } from '../vertical/geometry';
import type { Game } from '../../types/game';
import type { Goal, Metric, RunResult } from '../../types/campaign';
import { analyze } from '../analysis';
import { cityReport } from '../city/report';
import { facility } from '../../data/cityRules';
import { cellsOf, key } from '../grid';
import { stage } from './definitions';
export function metrics(g: Game): Record<Metric, number> {
  const s = analyze(g),
    c = g.campaign!,
    r = g.city.enabled ? cityReport(g) : null;
  const homes = g.buildings.filter((b) => facility(b).capacity > 0),
    ops = r ? [...r.operations.values()] : [];
  const connection = homes.length
    ? homes.filter((b) => s.connectedIds.has(b.id)).length / homes.length
    : 0;
  const newTiles = new Set(
    g.platforms.filter((p) => !c.initialPlatforms.includes(key(p))).map(key),
  );
  const links = g.buildings.filter(
    (b) => b.enabled && b.durability > 0 && endpoints(b, b.origin).every((c) => hasPlatform(g, c)),
  );
  return {
    observations: g.buildings.filter(
      (b) => ['weatherStation', 'weatherTower'].includes(b.kind) && defenseReady(g, b),
    ).length,
    windDefenses: g.buildings.filter(
      (b) => ['windbreak', 'reinforcedWindbreak'].includes(b.kind) && defenseReady(g, b),
    ).length,
    shieldUnits: g.buildings.filter(
      (b) =>
        ['shieldSmall', 'shieldLarge'].includes(b.kind) &&
        defenseReady(g, b) &&
        (g.disaster?.shields[b.id] ?? 0) > 10,
    ).length,
    stabilizers: g.buildings.filter((b) => b.kind === 'stabilizer' && defenseReady(g, b)).length,
    shelterCapacity:
      g.buildings.filter((b) => b.kind === 'shelter' && defenseReady(g, b)).length *
      DISASTER.shelterCapacity,
    disasters: g.disaster?.stats.completed ?? 0,
    shieldAbsorbed: g.disaster?.stats.absorbed ?? 0,
    storedEnergy: r?.battery ?? 0,
    damagedFacilities: g.buildings.filter((b) => b.durability < PHYSICAL[b.kind].hp * 0.9).length,
    evacuated: evacuatedTotal(g),
    recoveryCenters: g.buildings.filter((b) => b.kind === 'repairCenter' && defenseReady(g, b))
      .length,
    preparedReinforcement: g.structure.reinforcementsDone,
    resilience: g.disaster ? resilience(g).score : 0,
    upperDecks: g.platforms.filter((p) => p.y > 0).length,
    columns: links.filter((b) => VERTICAL_DEFS[b.kind]?.role === 'column').length,
    upperHomes: homes.filter(
      (b) => b.y > 0 && s.connectedIds.has(b.id) && (s.powerRatios.get(b.id) ?? 0) >= 1,
    ).length,
    verticalAccess: links.filter(
      (b) =>
        VERTICAL_DEFS[b.kind]?.role === 'transport' &&
        (b.kind === 'stairs' || (s.powerRatios.get(b.id) ?? 0) >= 1),
    ).length,
    bridges: links.filter((b) => VERTICAL_DEFS[b.kind]?.role === 'bridge').length,
    freightLinks: links.filter(
      (b) =>
        VERTICAL_DEFS[b.kind]?.freight &&
        (VERTICAL_DEFS[b.kind]?.role === 'bridge' || (s.powerRatios.get(b.id) ?? 0) >= 1),
    ).length,
    lowerDecks: g.platforms.filter((p) => p.y < 0).length,
    lowerIndustry: ops.filter(
      (o) =>
        (o.materials > 0.05 || o.aether > 0.01) && g.buildings.find((b) => b.id === o.id)!.y < 0,
    ).length,
    cargoLifts: links.filter(
      (b) =>
        ['cargoElevator', 'aetherElevator'].includes(b.kind) && (s.powerRatios.get(b.id) ?? 0) >= 1,
    ).length,
    lowerPower: g.buildings.filter(
      (b) => b.y < 0 && facility(b).demand > 0 && (s.powerRatios.get(b.id) ?? 0) >= 1,
    ).length,
    usedFloors: new Set(
      g.buildings
        .filter(
          (b) =>
            b.enabled &&
            b.durability > 0 &&
            !VERTICAL_DEFS[b.kind]?.role?.match(/column|beam|hanger|power|brace/),
        )
        .map((b) => b.y),
    ).size,
    skyGardens: ops.filter(
      (o) =>
        o.kind === 'skyGarden' &&
        o.efficiency > 0.5 &&
        g.buildings.find((b) => b.id === o.id)!.y > 0,
    ).length,
    newPower: g.buildings.filter(
      (b) => !b.initial && ['power', 'advancedPower', 'aetherPower'].includes(b.kind),
    ).length,
    population: g.population,
    placed: c.placed,
    homes: homes.length,
    expansion: newTiles.size,
    outerHome: homes.filter(
      (b) => s.connectedIds.has(b.id) && cellsOf(b, b.origin).some((p) => newTiles.has(key(p))),
    ).length,
    connection,
    powerMargin: r ? (r.deficit > 0.01 ? -r.deficit : r.generation - r.demand) : s.power - s.demand,
    stability: s.stability,
    foodMargin: r ? r.foodProduction - r.foodConsumption : 0,
    foodStock: r?.stocks.food ?? 0,
    farms: ops.filter((o) => o.food > 0.1).length,
    amenities: ops.filter((o) => ['park', 'plaza'].includes(o.kind) && o.efficiency > 0.5).length,
    lifts: s.structural.lifts.filter((l) => l.factor >= 0.9 && l.powered).length,
    separationGain: c.initialSeparation ? 1 - s.structural.separation / c.initialSeparation : 0,
    reinforced: Object.values(g.structure.edges).filter((e) => e.reinforcement > 0).length,
    alternatePath:
      g.platforms.some((p) => p.x === 3 && p.z === -1) &&
      g.platforms.some((p) => p.x === 4 && p.z === -1)
        ? 1
        : 0,
    overloads:
      s.structural.unsafeEdges +
      (g.vertical ? [...s.structural.nodes.values()].filter((n) => n.ratio > 1).length : 0),
    critical: s.structural.critical ? 1 : 0,
    repairs: g.structure.repairsDone,
    industry: ops.filter((o) => o.materials > 0.1).length,
    materials: r?.materialsProduction ?? 0,
    net: r?.net ?? 0,
    happiness: g.city.happiness,
    housingSpare: s.capacity - g.population,
    clinic: ops.filter((o) => o.kind === 'clinic' && o.efficiency > 0.5).length,
    noise: Math.max(0, -(r?.factors.find((f) => f.code === 'environment')?.value ?? 0)),
    liftMargin: s.lift - s.mass,
    workers: ops.reduce((n, o) => n + o.workers - o.jobs, 0),
    survive: g.elapsed,
    credits: g.city.enabled ? g.city.credits : g.resources,
    collapse: g.structure.collapsedCount - c.lastCollapsed,
  };
}
export function goalMet(
  goal: Goal,
  values: Record<Metric, number>,
  latched: string[] = [],
): boolean {
  if (goal.once && latched.includes(goal.id)) return true;
  if (goal.all) return goal.all.every((o) => goalMet(o, values, latched));
  if (goal.any) return goal.any.some((o) => goalMet(o, values, latched));
  const n = values[goal.metric!],
    target = goal.target!;
  return goal.max ? n <= target + 1e-7 : n + 1e-7 >= target;
}
export function campaignGoals(g: Game) {
  const v = metrics(g);
  return stage(g.campaign!.stage).goals.map((o) => goalMet(o, v, g.campaign!.latched));
}
export function evaluateResult(g: Game): RunResult {
  const def = stage(g.campaign!.stage),
    v = metrics(g),
    optional = def.optional.map((o) => goalMet(o, v, g.campaign!.latched));
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const breakdown: Record<string, number> = {
    objectives: 3000,
    structure: Math.round(v.stability * 25),
    connection: Math.round(v.connection * 1000),
    efficiency: Math.round(
      500 *
        clamp(
          1 -
            g.campaign!.spent / (def.resources * 2) -
            g.campaign!.placed / (g.platforms.length * 4),
        ),
    ),
    optional: optional.filter(Boolean).length * 250,
  };
  if (g.city.enabled) {
    breakdown.economy = Math.round(1500 * clamp((v.net + 1) / 4));
    breakdown.life = Math.round(v.happiness * 10);
  } else {
    breakdown.structure += 1000;
    breakdown.efficiency += 1500;
  }
  const checkpoint = g.campaign!.checkpointUsed;
  const score = Math.round(
    Object.values(breakdown).reduce((a, b) => a + b, 0) *
      (checkpoint && g.difficulty === 'hard' ? 0.9 : 1),
  );
  return {
    stars: 1 + (optional[0] ? 1 : 0) + (optional.every(Boolean) ? 1 : 0),
    score,
    time: g.elapsed,
    population: g.population,
    stability: v.stability,
    net: v.net,
    optional,
    breakdown,
    checkpoint,
  };
}
