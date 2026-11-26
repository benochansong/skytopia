import { productionFactor, demandFactor, hasTech } from '../world/effects';
import { operationalFactor, temperatureDemand, harvestFactor } from '../disasters/effects';
import { isBattery } from '../../data/rules';
import { BLOCKS, PHYSICAL, isLift } from '../../data/rules';
import { facility, OPERATION, CITY_RULES, cityDifficulty } from '../../data/cityRules';
import type { Operation } from '../../types/city';
import type { City, Network } from '../stability/types';
import { networks } from './networks';
import { inventory } from './inventory';
const clamp = (v: number) => Math.max(0, Math.min(1, v));
function calculateOperations(city: City, elevators?: Set<number>) {
  const { road, power: grid, freight, vehicle } = networks(city, elevators),
    inv = inventory(city, road),
    operations = new Map<number, Operation>(),
    settings = cityDifficulty[city.difficulty ?? 'normal'];
  const people = new Map<string, number>();
  for (const b of city.buildings) {
    const group = road.attachments.get(b.id);
    if (group) people.set(group, (people.get(group) ?? 0) + (city.city?.residents[b.id] ?? 0));
  }
  const workers = new Map([...people].map(([g, n]) => [g, Math.floor(n * settings.workers)]));
  for (const e of city.disaster?.evacuated ?? []) {
    const group = road.attachments.get(e.shelter);
    if (group) people.set(group, (people.get(group) ?? 0) + e.count);
  }
  let workforce = [...workers.values()].reduce((a, b) => a + b, 0),
    employed = 0;
  const fuelNeed = new Map<string, number>();
  for (const b of city.buildings) {
    const group = road.attachments.get(b.id);
    if (group && b.enabled)
      fuelNeed.set(group, (fuelNeed.get(group) ?? 0) + OPERATION[b.kind].inputAether);
  }
  const sorted = [...city.buildings].sort(
    (a, b) =>
      (a.priority ?? OPERATION[a.kind].priority) - (b.priority ?? OPERATION[b.kind].priority) ||
      a.id - b.id,
  );
  const generation = new Map<string, number>();
  for (const b of sorted) {
    const f = facility(b),
      d = OPERATION[b.kind],
      group = road.attachments.get(b.id) ?? null,
      powerGrid = grid.attachments.get(b.id) ?? null,
      condition = clamp(b.durability / PHYSICAL[b.kind].hp);
    const jobs = b.enabled ? f.jobs : 0,
      assigned = b.enabled && group && condition > 0 ? Math.min(jobs, workers.get(group) ?? 0) : 0;
    if (group) workers.set(group, (workers.get(group) ?? 0) - assigned);
    employed += assigned;
    const labor = jobs ? assigned / jobs : 1,
      input =
        d.inputAether && group
          ? clamp(
              (inv.poolStocks.get(group)?.aether ?? 0) / Math.max(0.001, fuelNeed.get(group) ?? 1),
            )
          : d.inputAether
            ? 0
            : 1;
    const efficiency =
      b.enabled && group ? labor * condition * input * operationalFactor(city, b) : 0;
    const output =
      f.power * productionFactor(city, 'power') * efficiency * (city.city?.activity[b.id] ?? 1);
    if (powerGrid) generation.set(powerGrid, (generation.get(powerGrid) ?? 0) + output);
    operations.set(b.id, {
      id: b.id,
      kind: b.kind,
      road: group,
      powerGrid,
      workers: assigned,
      jobs,
      power: output,
      demand: b.enabled
        ? f.demand * demandFactor(city) * temperatureDemand(city, b) * operationalFactor(city, b)
        : 0,
      efficiency,
      status: !b.enabled
        ? 'paused'
        : !group
          ? 'road'
          : condition < 0.3
            ? 'damage'
            : labor < 0.99
              ? 'workers'
              : input < 0.99
                ? 'input'
                : 'running',
      food: 0,
      materials: 0,
      aether: 0,
      income: 0,
      upkeep: b.enabled
        ? f.upkeep * settings.upkeep * (hasTech(city, 'efficientCity') ? 0.9 : 1)
        : 0,
      condition,
      environment: 0,
    });
  }
  const remaining = new Map(generation),
    batteryStored = new Map<string, number>();
  let battery = 0;
  for (const b of city.buildings.filter(
    (b) => isBattery(b.kind) && b.enabled && b.durability > 0,
  )) {
    const group = grid.attachments.get(b.id),
      stored = city.city?.batteries[b.id] ?? 0;
    battery += stored;
    if (group)
      batteryStored.set(
        group,
        (batteryStored.get(group) ?? 0) + Math.min(stored, CITY_RULES.batteryRate),
      );
  }
  for (const [group, amount] of batteryStored)
    remaining.set(group, (remaining.get(group) ?? 0) + amount);
  if (grid.root && (city.city?.powerBoost ?? 0) > 0)
    remaining.set(grid.root, (remaining.get(grid.root) ?? 0) + CITY_RULES.powerBoost);
  const priority = (kind: (typeof sorted)[number]['kind']) =>
    (city.disaster?.policy === 'defense' && ['shieldSmall', 'shieldLarge'].includes(kind)) ||
    (city.disaster?.policy === 'recovery' && kind === 'repairCenter')
      ? -1
      : isLift(kind)
        ? 0
        : kind === 'clinic'
          ? 1
          : BLOCKS[kind].capacity
            ? 2
            : OPERATION[kind].food
              ? 3
              : kind === 'shop'
                ? 5
                : 4;
  const powerRatios = new Map<number, number>(),
    connectedIds = new Set<number>(),
    operational = new Set<number>();
  let capacity = 0,
    poweredCapacity = 0,
    demand = 0,
    supplied = 0,
    food = 0;
  for (const b of [...sorted].sort((a, b) => priority(a.kind) - priority(b.kind) || a.id - b.id)) {
    const o = operations.get(b.id)!,
      f = facility(b),
      d = OPERATION[b.kind];
    capacity += f.capacity;
    demand += o.demand;
    const available = o.powerGrid ? (remaining.get(o.powerGrid) ?? 0) : 0,
      amount = b.enabled ? Math.min(o.demand, available) : 0,
      ratio = !b.enabled ? 0 : o.demand ? amount / o.demand : o.road ? 1 : 0;
    if (o.powerGrid) remaining.set(o.powerGrid, available - amount);
    supplied += amount;
    if (!f.power) o.power = amount;
    powerRatios.set(b.id, ratio);
    if (o.road && b.enabled && o.condition > 0) {
      operational.add(b.id);
      if (o.road === road.root) connectedIds.add(b.id);
    }
    if (o.road && ratio >= 0.99) poweredCapacity += f.capacity;
    const happiness = 0.65 + (0.35 * (city.city?.happiness ?? 72)) / 100,
      activity = city.city?.activity[b.id] ?? 1;
    // Generators self-start using labor and fuel; their own supply ratio never feeds back.
    if (!f.power) o.efficiency *= ratio * happiness * activity;
    else o.efficiency *= activity;
    o.food =
      f.food *
      productionFactor(city, 'food') *
      harvestFactor(city, b) *
      o.efficiency *
      (b.y !== 0 && freight.attachments.get(b.id) !== freight.root ? 0.35 : 1);
    const freightFactor = b.y !== 0 && freight.attachments.get(b.id) !== freight.root ? 0.35 : 1;
    o.materials = f.materials * productionFactor(city, 'materials') * o.efficiency * freightFactor;
    o.aether = f.aether * productionFactor(city, 'aether') * o.efficiency * freightFactor;
    o.income = f.income * o.efficiency * clamp((city.population ?? 0) / 25);
    if (o.status === 'running' && ratio < 0.99 && o.demand) o.status = 'power';
    if (o.status === 'running' && (o.food || o.materials || o.aether) && o.road) {
      const stock = inv.poolStocks.get(o.road),
        cap = inv.poolCapacity.get(o.road);
      if (
        stock &&
        cap &&
        ((o.food && stock.food >= cap.food) ||
          (o.materials && stock.materials >= cap.materials) ||
          (o.aether && stock.aether >= cap.aether))
      )
        o.status = 'storage';
    }
    if (o.status === 'running' && f.capacity && (city.city?.residents[b.id] ?? 0) < 0.01)
      o.status = 'empty';
    food += o.food;
    void d;
  }
  // Limit actual throughput by physical storage space, allowing same-tick consumption.
  for (const [pool, stock] of inv.poolStocks) {
    const members = [...operations.values()].filter((o) => o.road === pool),
      cap = inv.poolCapacity.get(pool)!;
    for (const resource of ['food', 'materials', 'aether'] as const) {
      const total = members.reduce((n, o) => n + o[resource], 0);
      const consumption =
        resource === 'food'
          ? ((people.get(pool) ?? 0) + (pool === inv.root ? (city.city?.displaced ?? 0) : 0)) *
            CITY_RULES.foodPerPerson *
            settings.consumption
          : resource === 'aether'
            ? members.reduce((n, o) => n + OPERATION[o.kind].inputAether * o.efficiency, 0)
            : 0;
      const room = Math.max(0, cap[resource] - stock[resource]) + consumption,
        ratio = total > 0 ? Math.min(1, room / total) : 1;
      if (ratio < 1)
        for (const o of members) {
          if (o[resource] > 0) {
            o[resource] *= ratio;
            if (ratio < 0.01) o.status = 'storage';
          }
        }
    }
  }
  food = [...operations.values()].reduce((n, o) => n + o.food, 0);
  const totalGeneration = [...generation.values()].reduce((a, b) => a + b, 0),
    connectedGeneration = grid.root ? (generation.get(grid.root) ?? 0) : 0;
  const network: Network = {
    roads: road.root ? road.groups.get(road.root)! : new Set(),
    connectedIds,
    power: totalGeneration,
    demand,
    capacity,
    poweredCapacity,
    food,
    disconnected: city.buildings.filter((b) => !connectedIds.has(b.id)).length,
    powerRatios,
    operational,
  };
  return {
    network,
    freight,
    vehicle,
    road,
    grid,
    inv,
    operations,
    workforce,
    employed,
    unemployed: Math.max(0, workforce - employed),
    generation: totalGeneration,
    connectedGeneration,
    supplied,
    deficit: Math.max(0, demand - supplied),
    battery,
    generationByGrid: generation,
  };
}

const operationCache: { city: City; result: ReturnType<typeof calculateOperations> }[] = [];
export function operatingNetwork(city: City) {
  const hit = operationCache.find(
    (c) =>
      c.city.worldContext === city.worldContext &&
      c.city.disaster === city.disaster &&
      c.city.city === city.city &&
      c.city.population === city.population &&
      c.city.difficulty === city.difficulty &&
      c.city.platforms === city.platforms &&
      c.city.buildings === city.buildings &&
      c.city.structure?.edges === city.structure?.edges,
  );
  if (hit) return hit.result;
  let result = calculateOperations(city);
  const lifts = city.buildings.filter((b) =>
    ['elevator', 'cargoElevator', 'aetherElevator', 'aetherBridge'].includes(b.kind),
  );
  if (lifts.length) {
    let enabled = new Set(lifts.filter((b) => b.enabled && b.durability > 0).map((b) => b.id));
    for (let i = 0; i < lifts.length + 1; i++) {
      // Monotone removal prevents circular power/transport feedback and unbounded iteration.
      const next = new Set(
        [...enabled].filter((id) => (result.network.powerRatios.get(id) ?? 0) >= 0.99),
      );
      if (next.size === enabled.size) break;
      enabled = next;
      result = calculateOperations(city, enabled);
    }
  }
  operationCache.unshift({ city, result });
  if (operationCache.length > 12) operationCache.pop();
  return result;
}
