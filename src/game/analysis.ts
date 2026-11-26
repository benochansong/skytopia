import { cityReport } from './city/report';
import { facility } from '../data/cityRules';
import type { Game, Stats } from '../types/game';
import type { City } from './stability/types';
import { analyzeNetwork } from './stability/network';
import { evaluateStructure } from './stability/evaluator';
// Reference-keyed cache excludes cursor, countdown, population and rendering frames.
const cache: { city: City; stats: Stats }[] = [];
export function analyze(city: City): Stats {
  const hit = cache.find(
    (c) =>
      c.city.disaster === city.disaster &&
      c.city.platforms === city.platforms &&
      c.city.buildings === city.buildings &&
      c.city.structure?.edges === city.structure?.edges &&
      c.city.structure?.lifts === city.structure?.lifts &&
      c.city.structure?.coreDurability === city.structure?.coreDurability &&
      c.city.structure?.emergency === city.structure?.emergency &&
      c.city.difficulty === city.difficulty &&
      c.city.city === city.city &&
      c.city.population === city.population,
  );
  if (hit) return hit.stats;
  const network = analyzeNetwork(city),
    structural = evaluateStructure(city, network);
  const stats: Stats = {
    ...network,
    mass: structural.mass,
    center: structural.center,
    stability: structural.overall,
    lift: structural.lift,
    homes: city.buildings.filter((b) => b.kind === 'home' || b.kind === 'largeHome').length,
    addedPower: city.buildings.filter((b) => b.kind === 'power' && !b.initial).length,
    expansion: city.platforms.filter((p) => !p.anchor).length,
    structural,
  };
  cache.unshift({
    city: {
      disaster: city.disaster,
      platforms: city.platforms,
      buildings: city.buildings,
      structure: city.structure,
      difficulty: city.difficulty,
      city: city.city,
      population: city.population,
    },
    stats,
  });
  if (cache.length > 8) cache.pop();
  return stats;
}
export function objectives(g: Game, s = analyze(g)) {
  const r = s.structural;
  if (g.city.enabled && g.missionId >= 5) {
    const c = cityReport(g),
      ops = [...c.operations.values()],
      farms = ops.filter((o) => o.food > 0.3),
      industry = ops.filter((o) => o.materials > 0.1),
      power = c.deficit < 0.01,
      homes = g.buildings
        .filter((b) => facility(b).capacity > 0)
        .every((b) => (s.powerRatios.get(b.id) ?? 0) >= 0.99),
      food = c.foodProduction >= c.foodConsumption;
    if (g.missionId === 5)
      return [g.population >= 50, farms.length >= 2, food, c.stocks.food >= 60, s.stability >= 75];
    if (g.missionId === 6)
      return [
        power && c.generation >= 280,
        homes,
        g.buildings
          .filter((b) => facility(b).lift > 0)
          .every((b) => (s.powerRatios.get(b.id) ?? 0) >= 0.99),
        industry.some((o) => o.efficiency >= 0.7),
        s.stability >= 75,
      ];
    if (g.missionId === 7)
      return [
        g.population >= 100,
        industry.length >= 2,
        c.materialsProduction >= 0.5,
        c.net > 0,
        r.unsafeEdges === 0,
      ];
    if (g.missionId === 8)
      return [
        g.population >= 150,
        g.city.happiness >= 80,
        power && food,
        ops.some((o) => o.kind === 'park' && o.efficiency > 0.5) &&
          ops.some((o) => o.kind === 'clinic' && o.efficiency > 0.5),
        s.stability >= 80,
      ];
    return [
      c.stocks.food >= 60,
      power,
      g.structure.repairsDone > 0 && s.stability >= 80,
      g.city.happiness >= 70,
      c.net > 0,
    ];
  }
  if (g.missionId === 2)
    return [
      g.population >= 50,
      g.buildings.some((b) => b.kind === 'liftSmall'),
      s.mass >= 300,
      s.stability >= 75,
      r.unsafeEdges === 0,
    ];
  if (g.missionId === 3)
    return [
      r.separation < g.baselineSeparation * 0.75,
      g.buildings.some((b) => b.kind === 'liftSmall' || b.kind === 'liftLarge'),
      Object.values(g.structure.edges).some((e) => e.reinforcement > 0),
      s.stability >= 80,
      g.structure.collapsedCount === 0,
    ];
  if (g.missionId === 4)
    return [
      g.structure.repairsDone >= 1,
      Object.values(g.structure.edges).filter((e) => e.reinforcement > 0).length >= 2,
      s.lift >= s.mass,
      g.structure.coreDurability > 0,
      g.elapsed >= 60,
    ];
  return [
    s.expansion >= 5,
    s.homes >= 5,
    g.population >= 25,
    s.addedPower >= 1,
    g.buildings
      .filter((b) => b.kind === 'home' || b.kind === 'largeHome')
      .every((b) => s.connectedIds.has(b.id)),
    s.power >= s.demand,
    s.stability >= 70,
  ];
}
