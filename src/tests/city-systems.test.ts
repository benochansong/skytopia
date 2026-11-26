import { describe, it, expect } from 'vitest';
import { newGame, tick, recycle } from '../game/engine';
import { cityExample } from '../game/city/scenarios';
import { cityReport } from '../game/city/report';
import { economyStep } from '../game/city/simulation';
import { populationStep, reconcileResidents } from '../game/city/population';
import {
  upgrade,
  upgradePreview,
  setOperation,
  emergencyFood,
  emergencyPower,
  aid,
  orderBuilding,
  sell,
} from '../game/city/actions';
import { inventory, adjustStock } from '../game/city/inventory';
import { cityRoutes } from '../game/city/routes';
import { networks } from '../game/city/networks';
import { analyze } from '../game/analysis';
import { demolish, repair, emergencyLift } from '../game/repair/maintenance';
import { decodeSave } from '../game/storage';
import { makeBuilding, edgeKey } from '../game/stability/state';
import { facility, DEFAULT_SETTINGS } from '../data/rules';
import { runCity } from './city-helpers';
const lab = () => ({ ...cityExample(newGame('citylab', 42), 'C'), labPaused: false });
describe('city resource and population invariants', () => {
  it('A: grows gradually with food, power and housing; workforce derives from residents', () => {
    let g = lab(),
      pop = g.population;
    g = populationStep(g);
    const r = cityReport(g);
    expect(g.population).toBeGreaterThan(pop);
    expect(g.population - pop).toBeLessThan(3);
    expect(r.workforce).toBe(Math.floor(g.population * 0.6));
    expect(r.employed).toBeLessThanOrEqual(r.workforce);
  });
  it('B: starvation has a grace period, then lowers happiness and causes gradual departures', () => {
    let g = lab();
    g = {
      ...g,
      city: { ...g.city, grace: 0 },
      buildings: g.buildings.map((b) =>
        ['greenhouse', 'farm'].includes(b.kind) ? { ...b, enabled: false } : b,
      ),
    };
    g = adjustStock(g, inventory(g).root, 'food', -10000);
    const pop = g.population;
    for (let i = 0; i < 40; i++) g = economyStep(g);
    g = populationStep(g);
    expect(g.population).toBeGreaterThanOrEqual(pop);
    for (let i = 0; i < 30; i++) g = economyStep(g);
    const before = g.population;
    g = populationStep(g);
    expect(g.population).toBeLessThan(before);
    expect(g.population).toBeGreaterThan(before * 0.95);
    expect(g.city.happiness).toBeLessThan(72);
    g = emergencyFood(g);
    g = economyStep(g);
    expect(g.city.hungerTime).toBeLessThan(70);
  });
  it('C: grid failure prioritizes lift before housing and industry; batteries bridge finite demand', () => {
    let g = lab();
    g = economyStep(g);
    const battery = g.buildings.find((b) => b.kind === 'battery')!;
    expect(g.city.batteries[battery.id]).toBeGreaterThan(0);
    for (const b of g.buildings)
      if (facility(b).power) g = setOperation(g, b.id, { enabled: false });
    const r = cityReport(g);
    expect(r.deficit).toBeGreaterThan(0);
    const lift = [...r.operations.values()].find((o) => o.kind === 'liftLarge')!,
      industry = [...r.operations.values()].find((o) => o.kind === 'factory')!;
    expect(lift.power).toBeGreaterThan(industry.power);
    g = economyStep(g);
    expect(g.city.batteries[battery.id]).toBe(0);
    for (const b of g.buildings)
      if (facility(b).power) g = setOperation(g, b.id, { enabled: true });
    for (let i = 0; i < 5; i++) g = economyStep(g);
    expect(cityReport(g).deficit).toBe(0);
  });
  it('D: labor shortage reduces production, reprioritizing moves workers without creating them', () => {
    let g = lab();
    g = { ...g, population: 20, city: { ...g.city, residents: {}, displaced: 20 } };
    g = reconcileResidents(g);
    const factory = g.buildings.find((b) => b.kind === 'factory')!,
      before = cityReport(g).operations.get(factory.id)!.workers;
    g = setOperation(g, factory.id, { priority: 0 });
    const r = cityReport(g);
    expect(r.operations.get(factory.id)!.workers).toBeGreaterThan(before);
    expect(r.employed).toBeLessThanOrEqual(12);
    expect(r.operations.get(factory.id)!.workers).toBeLessThan(facility(factory).jobs);
  });
  it('E: connected industry actually produces material and pays upkeep', () => {
    let g = lab();
    const before = inventory(g).stocks.materials,
      report = cityReport(g);
    g = economyStep(g);
    expect(inventory(g).stocks.materials - before).toBeCloseTo(report.materialsProduction);
    expect(g.city.credits).toBeCloseTo(500 + report.net);
    const factory = g.buildings.find((b) => b.kind === 'factory')!;
    const stopped = setOperation(g, factory.id, { enabled: false });
    expect(cityReport(stopped).expense).toBeLessThan(report.expense);
    expect(cityReport(stopped).materialsProduction).toBeLessThan(report.materialsProduction);
  });
  it('F: bankrupt cities have bounded aid, sale and emergency cooldowns, never negative money', () => {
    let g = lab();
    g = { ...g, city: { ...g.city, credits: 0 } };
    g = aid(g);
    expect(g.city.credits).toBe(100);
    expect(aid({ ...g, city: { ...g.city, credits: 0 } }).city.credits).toBe(0);
    g = emergencyFood(g);
    expect(g.city.credits).toBe(55);
    expect(emergencyFood(g)).toBe(g);
    const before = g.city.credits;
    g = sell(g, 'aether');
    expect(g.city.credits).toBeGreaterThan(before);
    g = emergencyPower(g);
    expect(g.city.powerBoost).toBe(20);
    expect(emergencyPower(g)).toBe(g);
    expect(g.city.credits).toBeGreaterThanOrEqual(0);
  });
  it('G: lost housing displaces people; lost stores remove their inventory immediately', () => {
    let g = lab();
    const warehouse = g.buildings.find((b) => b.kind === 'warehouse')!;
    g = {
      ...g,
      city: {
        ...g.city,
        stocks: { ...g.city.stocks, [warehouse.id]: { food: 100, materials: 100, aether: 10 } },
      },
    };
    const before = inventory(g).stocks.food;
    g = demolish(g, { type: 'building', id: String(warehouse.id) });
    expect(inventory(g).stocks.food).toBe(before - 100);
    expect(g.city.stocks[warehouse.id]).toBeUndefined();
    const pop = g.population;
    for (const b of g.buildings.filter((b) => facility(b).capacity))
      g = demolish(g, { type: 'building', id: String(b.id) });
    expect(g.population).toBe(pop);
    expect(g.city.displaced).toBeCloseTo(pop);
    expect(g.city.events.some((e) => e.kind === 'storageLoss')).toBe(true);
  });
  it('H: upgrade preserves footprint, changes mass and demand and pays actual stocks', () => {
    let g = lab();
    const b = g.buildings.find((b) => b.kind === 'warehouse')!,
      before = analyze(g),
      p = upgradePreview(g, b.id)!;
    expect(p.allowed).toBe(true);
    g = upgrade(g, b.id);
    expect(g.buildings.find((v) => v.id === b.id)!.origin).toEqual(b.origin);
    expect(analyze(g).mass - before.mass).toBeCloseTo(p.after.mass - p.before.mass);
    expect(g.city.credits).toBe(500 - p.cost.credits);
    expect(g.resources).toBeCloseTo(inventory(g).stocks.materials);
    expect(upgrade(g, b.id)).toBe(g);
  });
  it('I/J: day, economy, orders and migration share pause and speed with frame-independent steps', () => {
    let a = lab(),
      b = lab();
    a = orderBuilding(a, 'farm');
    b = orderBuilding(b, 'farm');
    a = runCity(a, 5);
    for (let i = 0; i < 50; i++) b = tick(b, 0.1);
    expect(b.city).toEqual(a.city);
    const paused = { ...a, city: { ...a.city, speed: 0 as const } };
    expect(tick(paused, 1)).toBe(paused);
    const fast = { ...lab(), city: { ...lab().city, speed: 3 as const } };
    const result = tick(fast, 1);
    expect(result.elapsed).toBe(3);
    expect(result.city.dayTime).toBe(93);
  });
  it('K: v3 round trip and v2 migration preserve state; corrupt accounting is rejected', () => {
    const g = lab();
    expect(decodeSave(JSON.stringify(g))).toEqual({ ok: true, game: g });
    const old = { ...newGame(), version: 2, city: undefined };
    const migrated = decodeSave(JSON.stringify(old));
    expect(migrated.ok).toBe(true);
    if (migrated.ok) {
      expect(migrated.game.version).toBe(5);
      expect(migrated.game.supply).toEqual(old.supply);
      expect(migrated.game.city.enabled).toBe(false);
    }
    expect(decodeSave(JSON.stringify({ ...g, city: { ...g.city, credits: -1 } })).ok).toBe(false);
    expect(decodeSave(JSON.stringify({ ...g, population: 999 })).ok).toBe(false);
    expect(
      decodeSave(
        JSON.stringify({
          ...g,
          city: { ...g.city, stocks: { core: { food: 99999, materials: 0, aether: 0 } } },
        }),
      ).ok,
    ).toBe(false);
  });
  it('orders are capped and delayed and join the random queue without replacing the active block', () => {
    let g = lab();
    g = { ...g, mode: 'mission', missionId: 7, cursor: { x: 0, z: 0 } };
    const active = g.active;
    g = orderBuilding(g, 'park');
    expect(g.active).toEqual(active);
    expect(orderBuilding(g, 'farm')).toBe(g);
    g = runCity(g, 19);
    expect(g.city.orders[0].remaining).toBe(0);
    g = recycle(g);
    expect(g.next.at(-1)?.kind).toBe('park');
    expect(g.city.orders).toHaveLength(0);
  });
  it('maintenance consumes the same materials shown in inventory and cannot mint refunds', () => {
    let g = lab();
    g = {
      ...g,
      platforms: g.platforms.map((p) => (p.x === 0 && p.z === 0 ? { ...p, durability: 50 } : p)),
    };
    const stock = inventory(g).stocks.materials;
    g = repair(g, { type: 'platform', id: '0,0' });
    expect(inventory(g).stocks.materials).toBeLessThan(stock);
    expect(g.resources).toBe(inventory(g).stocks.materials);
  });
  it('difficulty changes labor, consumption and bounded recovery aid', () => {
    const normal = lab(),
      hard = { ...normal, difficulty: 'hard' as const },
      easy = { ...normal, difficulty: 'easy' as const };
    expect(cityReport(hard).workforce).toBeLessThan(cityReport(normal).workforce);
    expect(cityReport(easy).foodConsumption).toBeLessThan(cityReport(normal).foodConsumption);
    expect(aid({ ...hard, city: { ...hard.city, credits: 0 } }).city.credits).toBe(0);
  });
  it('roads and power have separate components; disconnected stores cannot feed the core', () => {
    let g = newGame('mission', 42, DEFAULT_SETTINGS, 5);
    const placements = [
      ['road', 0, -3],
      ['road', 0, -2],
      ['road', 0, -1],
      ['home', -1, -2],
      ['power', 1, -2],
      ['road', 2, 0],
      ['road', 2, 1],
      ['road', 2, 2],
      ['warehouse', 1, 1],
      ['home', 3, 2],
      ['power', 3, 1],
    ] as const;
    g = {
      ...g,
      buildings: placements.map(([kind, x, z], i) =>
        makeBuilding({ kind, shape: 'single', rotation: 0 }, { x, z }, i + 1),
      ),
      nextId: 12,
      population: 10,
      city: {
        ...g.city,
        residents: { 4: 5, 10: 5 },
        displaced: 0,
        stocks: {
          core: { food: 0, materials: 0, aether: 0 },
          9: { food: 50, materials: 100, aether: 0 },
        },
      },
    };
    const r = cityReport(g);
    expect(r.roads.groups.size).toBe(2);
    expect(r.stocks.food).toBe(0);
    g = economyStep(g);
    expect(g.city.hungerTime).toBe(1);
    expect(g.city.stocks[9].food).toBeLessThan(50);
    const before = inventory(g).stocks.materials;
    g = {
      ...g,
      buildings: [
        ...g.buildings,
        makeBuilding({ kind: 'powerLink', shape: 'single', rotation: 0 }, { x: 1, z: -1 }, 12),
        makeBuilding({ kind: 'powerLink', shape: 'single', rotation: 0 }, { x: 2, z: -1 }, 13),
      ],
      nextId: 14,
    };
    expect(networks(g).power.groups.size).toBe(1);
    expect(networks(g).road.groups.size).toBe(2);
    expect(inventory(g).stocks.materials).toBe(before);
  });
  it('representative routes remain on intact road edges, are cached and bounded', () => {
    const g = lab(),
      routes = cityRoutes(g);
    expect(cityRoutes(g)).toBe(routes);
    expect(routes.routes.length).toBeLessThanOrEqual(48);
    expect(routes.freight.length).toBeLessThanOrEqual(16);
    for (const path of routes.routes)
      for (let i = 1; i < path.length; i++)
        expect(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].z - path[i - 1].z)).toBe(1);
    const [a, b] = networks(g).road.edges[0],
      cut = {
        ...g,
        structure: {
          ...g.structure,
          edges: {
            ...g.structure.edges,
            [edgeKey(`${a.x},${a.z}`, `${b.x},${b.z}`)]: { durability: 0, reinforcement: 0 },
          },
        },
      };
    expect(cityRoutes(cut)).not.toBe(routes);
  });
  it('unlimited mode refills core stocks, can be disabled, and cannot farm money by trading', () => {
    let g = lab();
    g = { ...g, city: { ...g.city, unlimited: true, credits: 0 } };
    g = economyStep(g);
    expect(g.city.credits).toBeGreaterThanOrEqual(10000);
    expect(sell(g, 'aether')).toBe(g);
    g = { ...g, city: { ...g.city, unlimited: false } };
    expect(sell(g, 'aether').city.credits).toBeGreaterThan(g.city.credits);
  });
});

it('storage-limited output matches actual inventory including simultaneous food consumption', () => {
  let g = lab();
  g = adjustStock(g, inventory(g).root, 'food', 10000);
  g = adjustStock(g, inventory(g).root, 'materials', 10000);
  const r = cityReport(g);
  expect(r.foodProduction).toBeCloseTo(r.foodConsumption);
  expect(r.materialsProduction).toBe(0);
  const next = economyStep(g);
  expect(inventory(next).stocks.food).toBeCloseTo(r.capacity.food);
  expect(inventory(next).stocks.materials).toBe(r.capacity.materials);
});
it('real collapse removes city generation and physical stock before the next economy tick', () => {
  let g = lab();
  const plant = g.buildings.find((b) => b.kind === 'advancedPower')!,
    store = g.buildings.find((b) => b.kind === 'warehouse')!;
  g = {
    ...g,
    buildings: g.buildings.map((b) =>
      [plant.id, store.id].includes(b.id) ? { ...b, durability: 0 } : b,
    ),
    city: {
      ...g.city,
      stocks: { ...g.city.stocks, [store.id]: { food: 40, materials: 20, aether: 0 } },
    },
  };
  const pop = g.population;
  g = tick(g, 0.25);
  expect(g.buildings.some((b) => b.id === plant.id || b.id === store.id)).toBe(false);
  expect(g.city.stocks[store.id]).toBeUndefined();
  expect(cityReport(g).generation).toBe(130);
  expect(g.population).toBe(pop);
  expect(g.structure.events.some((e) => e.kind === 'powerLost')).toBe(true);
  expect(decodeSave(JSON.stringify(g)).ok).toBe(true);
});
it('game over during 3x clears remaining fixed-step time and saves safely', () => {
  let g = lab();
  g = {
    ...g,
    city: { ...g.city, speed: 3 },
    structure: { ...g.structure, coreDurability: 0, criticalTime: 100, grace: 0 },
  };
  g = tick(g, 1);
  expect(g.structure.loss).not.toBeNull();
  expect(g.city.accumulator).toBe(0);
  expect(decodeSave(JSON.stringify(g)).ok).toBe(true);
});
it('emergency structural lift pays both physical materials and Aether once', () => {
  const g = lab(),
    before = inventory(g).stocks,
    next = emergencyLift(g, { x: 0, z: 0 });
  expect(inventory(next).stocks.aether).toBe(before.aether - 2);
  expect(inventory(next).stocks.materials).toBeLessThan(before.materials);
  expect(emergencyLift(next, { x: 0, z: 0 })).toBe(next);
});
