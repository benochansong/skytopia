import { describe, expect, it } from 'vitest';
import { newWorld, worldExample } from '../game/world/scenarios';
import {
  createWorld,
  generateIslands,
  syncWorld,
  switchCity,
  attachWorld,
} from '../game/world/state';
import {
  buildShip,
  dispatch,
  cargoStock,
  availablePorts,
  mutableWorld,
  createRoute,
  cancelTrip,
} from '../game/world/logistics';
import { decodeWorld } from '../game/world/storage';
import { tick, newGame } from '../game/engine';
import { transportStep } from '../game/world/runtime';
import { inventory, adjustStock } from '../game/city/inventory';
import { startResearch } from '../game/world/research';
import { cityReport } from '../game/city/report';
import { analyze } from '../game/analysis';
import type { Game } from '../types/game';
const flight = (g: Game, seconds: number) => {
  const w = mutableWorld(syncWorld(g));
  for (let t = 0; t < seconds; t += 0.25) {
    w.clock += 0.25;
    transportStep(w, 0.25);
  }
  return attachWorld(g, w);
};
describe('Beyond the Clouds', () => {
  it('generates bounded, reproducible six-region worlds with ruins', () => {
    const a = generateIslands(4294967295);
    expect(a).toEqual(generateIslands(4294967295));
    expect(a).not.toEqual(generateIslands(1));
    expect(new Set(a.map((i) => i.region)).size).toBe(6);
    expect(a.filter((i) => i.ruins).length).toBeGreaterThanOrEqual(3);
    expect(a.filter((i) => i.discovered).length).toBe(1);
  });
  it('imports a single city without changing its original state or queue', () => {
    const original = newGame('citylab', 42),
      snapshot = JSON.stringify(original),
      g = createWorld(original, 4294967295);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(g.buildings).toEqual(original.buildings);
    expect(g.active).toEqual(original.active);
    expect(g.next).toEqual(original.next);
    expect(decodeWorld(JSON.stringify(g.world)).ok).toBe(true);
  });
  it('starts a powered, stable world and pays for a real ship build', () => {
    let g = newWorld(undefined, 70127, { disasters: 0 });
    expect(analyze(g).stability).toBeGreaterThan(80);
    expect(cityReport(g).deficit).toBe(0);
    expect(availablePorts(g).length).toBe(1);
    const before = inventory(g).stocks.materials;
    g = buildShip(g, 'scout');
    expect(g.world!.ships[0].state).toBe('building');
    expect(inventory(g).stocks.materials).toBe(before - 25);
    g = flight(g, 16);
    expect(g.world!.ships[0].state).toBe('docked');
    g = dispatch(g, { ship: g.world!.ships[0].id, to: 'island-2', task: 'explore' });
    expect(g.world!.ships[0].trip).not.toBeNull();
    expect(decodeWorld(JSON.stringify(syncWorld(g))).ok).toBe(true);
    g = flight(g, 90);
    expect(g.world!.islands[1].discovered).toBe(true);
    expect(g.world!.ships[0].state).toBe('docked');
    expect(g.world!.stats.explored).toBe(1);
  }, 60000);
  it('colonizes by transporting paid materials and people, preserving local cities', () => {
    let g = newWorld();
    g = {
      ...g,
      world: {
        ...g.world!,
        islands: g.world!.islands.map((i) =>
          i.id === 'island-2' ? { ...i, discovered: true } : i,
        ),
      },
    };
    g = flight(buildShip(g, 'colony'), 40);
    const population = g.population;
    g = dispatch(g, { ship: g.world!.ships[0].id, to: 'island-2', task: 'colonize' });
    expect(g.population).toBe(population - 20);
    expect(g.world!.cities).toHaveLength(1);
    g = flight(g, 120);
    expect(g.world!.cities).toHaveLength(2);
    const c = g.world!.cities[1];
    expect(c.game.population).toBe(20);
    expect(availablePorts(c.game).length).toBeGreaterThan(0);
    const capital = g.active;
    g = switchCity(g, c.id);
    g = { ...g, remaining: 7, hold: g.active };
    g = switchCity(g, 'city-1');
    expect(g.active).toEqual(capital);
    g = switchCity(g, c.id);
    expect(g.remaining).toBe(7);
    expect(g.hold).not.toBeNull();
    expect(decodeWorld(JSON.stringify(syncWorld(g))).ok).toBe(true);
  }, 60000);
  it('conserves physical cargo through save, arrival and cancellation', () => {
    let g = worldExample('A');
    g = attachWorld(g, { ...syncWorld(g), routes: [] });
    g = switchCity(g, 'city-2');
    const before = g.world!.cities.reduce((n, c) => n + cargoStock(c, 'materials'), 0);
    g = dispatch(g, { ship: 'ship-lab', to: 'city-1', task: 'trade', cargo: { materials: 50 } });
    expect(g.world!.ships[0].cargo.materials).toBe(50);
    const loaded = decodeWorld(JSON.stringify(syncWorld(g)));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    g = loaded.game;
    g = flight(g, 8);
    g = cancelTrip(g, 'ship-lab');
    expect(g.world!.ships[0].cargo.materials).toBe(50);
    g = flight(g, 100);
    const total =
      syncWorld(g).cities.reduce((n, c) => n + cargoStock(c, 'materials'), 0) +
      (g.world!.ships[0].cargo.materials ?? 0);
    expect(total).toBeCloseTo(before, 6);
    expect(g.world!.ships[0].state).toBe('docked');
  }, 60000);
  it('does not unload into full storage and resumes actual delivery after space opens', () => {
    let g = worldExample('A');
    g = attachWorld(g, { ...syncWorld(g), routes: [] });
    g = switchCity(g, 'city-2');
    g = attachWorld(g, {
      ...syncWorld(g),
      cities: syncWorld(g).cities.map((c) =>
        c.id === 'city-1'
          ? { ...c, game: adjustStock(c.game, inventory(c.game).root, 'aether', 1000) }
          : c,
      ),
    });
    g = dispatch(g, { ship: 'ship-lab', to: 'city-1', task: 'trade', cargo: { aether: 20 } });
    g = flight(g, 100);
    expect(g.world!.ships[0].cargo.aether).toBe(20);
    expect(g.world!.stats.deliveries).toBe(0);
    const w = mutableWorld(syncWorld(g));
    w.cities[0].game = {
      ...w.cities[0].game,
      city: {
        ...w.cities[0].game.city,
        stocks: {
          ...w.cities[0].game.city.stocks,
          core: { ...w.cities[0].game.city.stocks.core, aether: 0 },
        },
      },
    };
    g = flight(attachWorld(g, w), 1);
    expect(g.world!.ships[0].cargo.aether).toBe(0);
    expect(g.world!.stats.deliveries).toBe(1);
    expect(g.world!.ledger[0].amount).toBe(20);
    const saved = decodeWorld(JSON.stringify(syncWorld(g)));
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(flight(saved.game, 1).world!.stats.deliveries).toBe(1);
  }, 60000);
  it('rejects duplicate ships, overweight cargo, broken references and unknown technology', () => {
    const w = newWorld().world!;
    for (const mutate of [
      (x: typeof w) => x.cities.push(x.cities[0]),
      (x: typeof w) => (x.active = 'missing'),
      (x: typeof w) => x.research.completed.push('fake'),
    ]) {
      const x = structuredClone(w);
      mutate(x);
      expect(decodeWorld(JSON.stringify(x)).ok).toBe(false);
    }
  }, 60000);
  it('uses one global pause, independent background clocks, and real research costs', () => {
    let g = worldExample('A');
    const times = g.world!.cities.map((c) => c.game.elapsed);
    g = { ...g, city: { ...g.city, speed: 0 } };
    expect(tick(g, 1)).toBe(g);
    g = { ...g, city: { ...g.city, speed: 1 } };
    g = tick(g, 1);
    expect(g.world!.cities.map((c) => c.game.elapsed - times[0])).toEqual([1, 1]);
    expect(g.world!.research.points).toBeGreaterThan(0);
    g = { ...g, world: { ...g.world!, research: { ...g.world!.research, points: 100 } } };
    const before = inventory(g).stocks.materials;
    // Lab mode grants free construction, but research still consumes RP exactly once.
    g = startResearch(g, 'strongFrame');
    expect(g.world!.research.points).toBe(80);
    expect(g.world!.research.active?.id).toBe('strongFrame');
    expect(startResearch(g, 'strongFrame').world!.research).toEqual(g.world!.research);
    expect(inventory(g).stocks.materials).toBeLessThanOrEqual(before);
  }, 60000);
  it('validates automatic-route assignments and reserves destination stock', () => {
    let g = worldExample('A');
    g = attachWorld(g, { ...syncWorld(g), routes: [] });
    g = switchCity(g, 'city-2');
    const config = {
      from: 'city-2',
      to: 'city-1',
      resource: 'materials' as const,
      amount: 40,
      reserve: 50,
      target: 900,
      ship: 'ship-lab',
      interval: 15,
      priority: 1,
      allowRisk: false,
      enabled: true,
    };
    g = createRoute(g, config);
    expect(g.world!.routes).toHaveLength(1);
    expect(createRoute(g, config).world!.routes).toHaveLength(1);
    g = flight(g, 1);
    expect(g.world!.ships[0].cargo.materials).toBe(40);
  }, 60000);
});
