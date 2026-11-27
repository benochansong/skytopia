import { selectAdvice, foodRunway } from './advisor';
import type { Game } from '../../types/game';
import type { CityReport } from '../../types/city';
import { OPERATION, facility, TIER_POP, cityDifficulty, CITY_RULES } from '../../data/cityRules';
import { analyze } from '../analysis';
import { operatingNetwork } from './operations';
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const cache: { g: Game; r: CityReport }[] = [];
export function cityReport(g: Game): CityReport {
  const old = cache.find(
    (c) =>
      c.g.worldContext === g.worldContext &&
      c.g.disaster === g.disaster &&
      c.g.city === g.city &&
      c.g.buildings === g.buildings &&
      c.g.platforms === g.platforms &&
      c.g.structure === g.structure &&
      c.g.population === g.population &&
      c.g.difficulty === g.difficulty,
  );
  if (old) return old.r;
  const o = operatingNetwork(g),
    s = analyze(g),
    environment = new Map<number, number>();
  const houses = g.buildings.filter((b) => facility(b).capacity > 0);
  let access = 0;
  for (const h of houses) {
    let amenity = 0,
      noise = 0;
    const op = o.operations.get(h.id)!;
    for (const b of g.buildings) {
      const d = OPERATION[b.kind],
        other = o.operations.get(b.id)!,
        distance =
          Math.abs(b.origin.x - h.origin.x) +
          Math.abs(b.origin.z - h.origin.z) +
          Math.abs(b.y - h.y) * 2;
      if (distance > 4 || !b.enabled || !other.road || other.road !== op.road) continue;
      const activity = other.efficiency;
      amenity += d.amenity * activity * Math.max(0, 1 - distance / 5);
      noise += d.noise * activity * Math.max(0, 1 - distance / 5);
    }
    const value = Math.max(-25, Math.min(25, amenity - noise * Math.max(0.2, 1 - amenity / 25)));
    environment.set(h.id, value);
    op.environment = value;
    access += value;
  }
  const foodConsumption =
    g.population * CITY_RULES.foodPerPerson * cityDifficulty[g.difficulty].consumption;
  const operations = [...o.operations.values()],
    foodProduction = operations.reduce((n, b) => n + b.food, 0),
    materialsProduction = operations.reduce((n, b) => n + b.materials, 0),
    aetherProduction = operations.reduce((n, b) => n + b.aether, 0);
  const foodCoverage = g.population
    ? Object.entries(g.city.residents).reduce(
        (n, [id, count]) => {
          const pool = o.road.attachments.get(Number(id));
          return n + (pool && (o.inv.poolStocks.get(pool)?.food ?? 0) > 0 ? count : 0);
        },
        (g.disaster?.evacuated ?? []).reduce((n, e) => {
          const pool = o.road.attachments.get(e.shelter);
          return n + (pool && (o.inv.poolStocks.get(pool)?.food ?? 0) > 0 ? e.count : 0);
        }, 0),
      ) / g.population
    : 1;
  const powerCoverage = houses.length
    ? houses.reduce((n, b) => n + (o.network.powerRatios.get(b.id) ?? 0), 0) / houses.length
    : 1;
  const connected = houses.length
    ? houses.filter((b) => o.road.attachments.has(b.id)).length / houses.length
    : 1;
  const factors = [
    { code: 'food', value: foodCoverage >= 0.95 ? 8 : -25 * (1 - foodCoverage) },
    { code: 'power', value: powerCoverage >= 0.95 ? 7 : -20 * (1 - powerCoverage) },
    { code: 'roads', value: connected >= 0.99 ? 5 : -20 * (1 - connected) },
    { code: 'jobs', value: o.workforce ? 4 - (12 * o.unemployed) / o.workforce : 0 },
    { code: 'environment', value: houses.length ? access / houses.length : 0 },
    { code: 'safety', value: s.stability >= 80 ? 8 : -Math.max(0, 80 - s.stability) * 0.35 },
    {
      code: 'collapse',
      value: g.structure.events.some((e) => e.kind === 'collapse' && g.elapsed - e.time < 60)
        ? -15
        : 0,
    },
    { code: 'housing', value: g.city.displaced > 0 ? -20 : 3 },
  ];
  const happinessTarget = clamp(
    48 +
      (g.worldContext?.techs.includes('healthyCity') ? 5 : 0) +
      (g.worldContext?.specialty === 'residential' ? 5 : 0) +
      factors.reduce((n, f) => n + f.value, 0),
  );
  const income =
      g.population * 0.018 * (0.5 + g.city.happiness / 100) * (0.15 + 0.85 * powerCoverage) +
      operations.reduce((n, b) => n + b.income, 0),
    expense = operations.reduce((n, b) => n + b.upkeep, 0),
    net = income - expense;
  let tierEligible = 1;
  if (
    powerCoverage >= 0.95 &&
    foodProduction >= foodConsumption &&
    s.stability >= 70 &&
    g.city.happiness >= 55
  )
    TIER_POP.forEach((n, i) => {
      if (g.population >= n) tierEligible = i + 1;
    });
  const poolNeeds = new Map<string, number>();
  const consume = (pool: string, count: number) =>
    poolNeeds.set(
      pool,
      (poolNeeds.get(pool) ?? 0) +
        count * CITY_RULES.foodPerPerson * cityDifficulty[g.difficulty].consumption,
    );
  for (const [id, count] of Object.entries(g.city.residents))
    consume(o.road.attachments.get(Number(id)) ?? 'isolated:' + id, count);
  for (const e of g.disaster?.evacuated ?? [])
    consume(o.road.attachments.get(e.shelter) ?? 'isolated:' + e.shelter, e.count);
  consume(o.inv.root, g.city.displaced);
  const foodETA = foodRunway(
    [...poolNeeds].map(([pool, consumption]) => ({
      consumption,
      stock: o.inv.poolStocks.get(pool)?.food ?? 0,
      production: operations.filter((op) => op.road === pool).reduce((n, op) => n + op.food, 0),
    })),
  );
  const creditETA = net < 0 ? g.city.credits / -net : Infinity;
  const advice: CityReport['advice'] = [];
  if (g.structure.coreDurability < 125)
    advice.push({
      id: 'core',
      priority: 120,
      value: g.structure.coreDurability,
      cell: { x: 0, z: 0 },
      fatal: true,
    });
  if (s.mass > s.lift)
    advice.push({ id: 'lift', priority: 115, value: s.mass - s.lift, cell: s.center, fatal: true });
  if (g.disaster?.threat && ['forecast', 'active'].includes(g.disaster.phase))
    advice.push({
      id: 'disaster',
      priority: 85,
      value: Math.max(
        0,
        (g.disaster.phase === 'forecast' ? g.disaster.threat.warning : g.disaster.threat.duration) -
          g.disaster.clock,
      ),
      cell: g.disaster.threat.target,
      fatal: g.disaster.phase === 'active',
    });
  if (s.structural.critical || (s.structural.worst && s.structural.worst.ratio > 1))
    advice.push({
      id: 'structure',
      fatal: !!s.structural.critical,
      priority: 100,
      value: s.structural.worst?.ratio ?? 0,
      cell: s.structural.worst?.cell,
    });
  if (foodETA < 120 || g.city.hungerTime > 0)
    advice.push({ id: 'food', priority: 90, value: foodETA, fatal: g.city.hungerTime > 0 });
  if (o.deficit > 0)
    advice.push({
      id: 'power',
      fatal: o.deficit > o.network.demand * 0.3,
      priority: 95,
      value: o.deficit,
      cell: g.buildings.find((b) => (o.network.powerRatios.get(b.id) ?? 1) < 0.5)?.origin,
    });
  if (g.city.displaced > 0) advice.push({ id: 'shelter', priority: 84, value: g.city.displaced });
  const disconnected = operations.find((b) => b.status === 'road');
  if (disconnected)
    advice.push({
      id: 'roads',
      priority: 80,
      value: disconnected.id,
      cell: g.buildings.find((b) => b.id === disconnected.id)?.origin,
    });
  const labor = operations.filter((b) => b.status === 'workers');
  if (labor.length)
    advice.push({
      id: 'workers',
      priority: 65,
      value:
        100 * (1 - labor.reduce((n, b) => n + (b.jobs ? b.workers / b.jobs : 1), 0) / labor.length),
    });
  if (net < 0) advice.push({ id: 'credits', priority: 60, value: net * 60 });
  if (g.city.happiness < 55)
    advice.push({ id: 'happiness', priority: 55, value: g.city.happiness });
  if (operations.some((b) => b.status === 'storage'))
    advice.push({ id: 'storage', priority: 40, value: 0 });
  const r: CityReport = {
    roads: o.road,
    powerGrid: o.grid,
    operations: o.operations,
    stocks: o.inv.stocks,
    capacity: o.inv.capacity,
    poolStocks: o.inv.poolStocks,
    poolCapacity: o.inv.poolCapacity,
    storageGroups: o.inv.groups,
    workforce: o.workforce,
    employed: o.employed,
    unemployed: o.unemployed,
    availableHousing: o.network.poweredCapacity,
    housing: o.network.capacity,
    generation: o.generation,
    connectedGeneration: o.connectedGeneration,
    demand: o.network.demand,
    supplied: o.supplied,
    deficit: o.deficit,
    battery: o.battery,
    foodProduction,
    foodConsumption,
    materialsProduction,
    aetherProduction,
    income,
    expense,
    net,
    foodETA,
    creditETA,
    happinessTarget,
    factors,
    environment,
    tierEligible,
    advice: selectAdvice(advice, g.city.dismissed, g.elapsed),
  };
  cache.unshift({ g, r });
  // Two generations for each of the world's six independent cities.
  if (cache.length > 12) cache.pop();
  return r;
}
