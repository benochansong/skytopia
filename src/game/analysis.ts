import type { Game, Stats } from '../types/game';
import type { City } from './stability/types';
import { analyzeNetwork } from './stability/network';
import { evaluateStructure } from './stability/evaluator';
// Reference-keyed cache excludes cursor, countdown, population and rendering frames.
const cache: { city: City; stats: Stats }[] = [];
export function analyze(city: City): Stats {
  const hit = cache.find(
    (c) =>
      c.city.platforms === city.platforms &&
      c.city.buildings === city.buildings &&
      c.city.structure?.edges === city.structure?.edges &&
      c.city.structure?.lifts === city.structure?.lifts &&
      c.city.structure?.coreDurability === city.structure?.coreDurability &&
      c.city.structure?.emergency === city.structure?.emergency &&
      c.city.difficulty === city.difficulty,
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
      platforms: city.platforms,
      buildings: city.buildings,
      structure: city.structure,
      difficulty: city.difficulty,
    },
    stats,
  });
  if (cache.length > 8) cache.pop();
  return stats;
}
export function objectives(g: Game, s = analyze(g)) {
  const r = s.structural;
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
