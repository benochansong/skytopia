import type { Game, Kind } from '../../types/game';
import type { CargoType, Specialty } from '../../types/world';
import { BLOCKS, WORLD_KINDS } from '../../data/rules';
import { attachWorld, syncWorld } from './state';
import { availablePorts, distance, mutableWorld, working } from './logistics';
import { shipDefs } from './definitions';
import { analyze } from '../analysis';
import { cityReport } from '../city/report';
import { resilience } from '../disasters/report';
import { canPay, pay } from '../city/inventory';
import { canUse } from '../campaign/runtime';
export function worldReport(g: Game) {
  const w = syncWorld(g),
    cities = w.cities.map((c) => ({
      city: c,
      structure: analyze(c.game),
      economy: cityReport(c.game),
      resilience: resilience(c.game).score,
    }));
  const stable = cities.filter(
    (c) => c.structure.stability >= 80 && !c.city.game.structure.loss && c.economy.deficit < 0.1,
  ).length;
  const operatingRoutes = w.routes.filter((r) => {
    const ship = w.ships.find((s) => s.id === r.ship);
    return (
      r.enabled &&
      r.delivered > 0 &&
      ship &&
      [r.from, r.to].every((id) => {
        const city = w.cities.find((c) => c.id === id);
        return city && availablePorts(city.game, shipDefs[ship.type].port).length > 0;
      })
    );
  });
  const routes = operatingRoutes.length;
  const population = cities.reduce((n, c) => n + c.city.game.population, 0),
    specialties = new Set(w.cities.filter((c) => c.specialty !== 'mixed').map((c) => c.specialty))
      .size;
  const score = cities.length
    ? cities.reduce(
        (n, c) =>
          n +
          (c.structure.stability * 0.5 +
            c.resilience * 0.15 +
            (c.economy.deficit < 0.1 ? 15 : 0) +
            (c.economy.stocks.food >= 60 ? 15 : 0) +
            (operatingRoutes.some((r) => r.to === c.city.id) ? 5 : 0)),
        0,
      ) / cities.length
    : 0;
  const nexus = cities.some((c) => working(c.city.game, 'nexus').length > 0);
  const tier =
    nexus && stable >= 4 && population >= 1000 && score >= 85
      ? 6
      : w.research.completed.includes('distributedCore') && stable >= 3
        ? 5
        : stable >= 3 && specialties >= 3 && routes >= 3
          ? 4
          : routes >= 2 && stable >= 2
            ? 3
            : w.cities.length >= 2
              ? 2
              : 1;
  const warnings = [
    ...cities.flatMap((c) =>
      c.economy.advice.slice(0, 3).map((a) => ({
        id: c.city.id + ':' + a.id,
        city: c.city.id,
        kind: a.id,
        priority: a.priority,
      })),
    ),
    ...cities
      .filter((c) => ['active', 'forecast'].includes(c.city.game.disaster?.phase ?? ''))
      .map((c) => ({
        id: c.city.id + ':weather',
        city: c.city.id,
        kind: c.city.game.disaster?.phase === 'active' ? 'worldStorm' : 'worldForecast',
        priority: c.city.game.disaster?.phase === 'active' ? 95 : 75,
      })),
    ...w.ships
      .filter((s) => s.state === 'avoiding' && s.trip)
      .map((s) => ({
        id: s.id + ':freight',
        city: s.trip!.from,
        kind: 'worldFreight',
        priority: 70,
      })),
  ]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8);
  return { cities, stable, routes, population, specialties, score, tier, nexus, warnings };
}
export function specialize(g: Game, id: string, specialty: Specialty): Game {
  if (!g.world) return g;
  const w = mutableWorld(syncWorld(g)),
    c = w.cities.find((c) => c.id === id);
  if (!c) return g;
  const cost = { materials: 10, credits: 50, aether: 0 };
  if (!canPay(c.game, cost)) return g;
  c.game = pay(c.game, cost);
  c.specialty = specialty;
  return attachWorld(g, w);
}
export function orderWorldFacility(g: Game, kind: Kind): Game {
  if (!g.world || !WORLD_KINDS.includes(kind) || !canUse(g, kind) || g.reservedActive) return g;
  if (kind === 'nexus') {
    const w = syncWorld(g),
      c = w.cities.find((c) => c.id === w.active)!;
    if (
      w.capital !== c.id ||
      worldReport(g).tier < 5 ||
      analyze(g).stability < 80 ||
      c.rare.pureAether < 20 ||
      c.rare.ancientAlloy < 20 ||
      !w.research.completed.includes('distributedCore')
    )
      return { ...g, world: { ...g.world, notice: 'nexusRequirements' } };
  }
  // The reserved blueprint uses the existing paid placement path; no money is taken until placed.
  return {
    ...g,
    reservedActive: g.active,
    active: { kind, shape: BLOCKS[kind].shapes[0], rotation: 0 },
  };
}
export function buildBridge(g: Game, to: string, resource: CargoType = 'materials'): Game {
  if (!g.world) return g;
  const w = mutableWorld(syncWorld(g)),
    a = w.cities.find((c) => c.id === w.active)!,
    b = w.cities.find((c) => c.id === to);
  if (
    !b ||
    a.id === b.id ||
    w.bridges.length >= 12 ||
    w.bridges.some((x) => x.from === a.id && x.to === b.id) ||
    !w.research.completed.includes('skyBridges') ||
    distance(w, a.id, b.id) > 150
  )
    return g;
  const cost = { materials: 120, credits: 150, aether: 15 };
  if (
    [a, b].some(
      (c) =>
        !working(c.game, 'skybridgeAnchor').length ||
        analyze(c.game).stability < 80 ||
        !canPay(c.game, cost),
    )
  )
    return g;
  a.game = pay(a.game, cost);
  b.game = pay(b.game, cost);
  w.bridges.push({
    id: `bridge-${w.nextId++}`,
    from: a.id,
    to: b.id,
    hp: 100,
    resource,
    cargo: 0,
    remaining: 0,
    delivered: 0,
  });
  return attachWorld(g, w);
}
