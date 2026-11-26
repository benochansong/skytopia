import { describe, it, expect } from 'vitest';
import { worldExample } from '../game/world/scenarios';
import { newGame, tick } from '../game/engine';
import { attachWorld, createWorld, context, syncWorld, switchCity } from '../game/world/state';
import {
  mutableWorld,
  dispatch,
  moveCargo,
  cargoStock,
  routeRisk,
  working,
} from '../game/world/logistics';
import { transportStep, bridgeStep, tickWorld } from '../game/world/runtime';
import { decodeWorld } from '../game/world/storage';
import { authorPlot } from '../game/disasters/scenarios';
import { forecast } from '../game/disasters/scheduler';
import { buildBridge, specialize } from '../game/world/management';
import { inventory } from '../game/city/inventory';
import { cityReport } from '../game/city/report';
import { startResearch, researchStep } from '../game/world/research';
import { technologies } from '../game/world/definitions';
import { worldAchievements } from '../game/world/progress';
import { freshProfile } from '../game/campaign/progress';
import { demandFactor } from '../game/world/effects';
import type { Game } from '../types/game';
const fleetOnly = (g: Game, seconds: number) => {
  const w = mutableWorld(syncWorld(g));
  for (let t = 0; t < seconds; t += 0.25) {
    w.clock += 0.25;
    transportStep(w, 0.25);
  }
  return attachWorld(g, w);
};
function fixture() {
  let g = worldExample('A'),
    w = mutableWorld(syncWorld(g));
  w.routes = [];
  w.mode = 'civilization';
  for (const c of w.cities) c.game = { ...c.game, city: { ...c.game.city, unlimited: false } };
  return attachWorld(g, w);
}
describe('world safety and integration', () => {
  it('uses a working world observatory to anticipate forecast route hazards', () => {
    const w = mutableWorld(syncWorld(fixture()));
    const destination = w.cities[1].game;
    w.cities[1].game = forecast(
      { ...destination, disaster: { ...destination.disaster!, setting: 'normal' } },
      'storm',
    );
    expect(w.cities[1].game.disaster!.phase).toBe('forecast');
    const before = routeRisk(w, w.cities[0].id, w.cities[1].id);
    w.cities[0].game = authorPlot(w.cities[0].game, 'worldObservatory');
    expect(working(w.cities[0].game, 'worldObservatory')).toHaveLength(1);
    expect(routeRisk(w, w.cities[0].id, w.cities[1].id)).toBeGreaterThan(before);
  });
  it('preserves custom timers without charging background time on city activation', () => {
    let g = fixture();
    g = {
      ...g,
      remaining: 90,
      world: { ...g.world!, config: { ...g.world!.config, blockTime: 90 }, view: 'map' },
    };
    const saved = decodeWorld(JSON.stringify(syncWorld(g)));
    expect(saved.ok && saved.game.remaining).toBe(90);
    g = tickWorld(g, 0.75, (city) => city);
    expect(g.remaining).toBe(90);
    g = { ...g, world: { ...g.world!, view: 'city' } };
    g = tickWorld(g, 0.25, (city) => city);
    expect(g.remaining).toBe(89.75);
    const bad = syncWorld(g);
    bad.cities[0].game = { ...bad.cities[0].game, remaining: 121 };
    expect(decodeWorld(JSON.stringify(bad)).ok).toBe(false);
  });
  it('migrates a pre-economy city to a capital without losing people or buildings', () => {
    const legacy = newGame('mission', 7),
      g = createWorld(legacy);
    expect(g.population).toBe(legacy.population);
    expect(g.buildings).toEqual(legacy.buildings);
    expect(decodeWorld(JSON.stringify(syncWorld(g))).ok).toBe(true);
  });
  it('transports real passengers and never counts them in both cities', () => {
    let g = switchCity(fixture(), 'city-2'),
      before = g.world!.cities.reduce((n, c) => n + c.game.population, 0);
    g = dispatch(g, {
      ship: 'ship-lab',
      to: 'city-1',
      task: 'passengers',
      cargo: { passengers: 12 },
    });
    expect(syncWorld(g).cities.reduce((n, c) => n + c.game.population, 0)).toBe(before - 12);
    expect(g.world!.ships[0].cargo.passengers).toBe(12);
    g = fleetOnly(g, 100);
    expect(g.world!.ships[0].state).toBe('docked');
    expect(syncWorld(g).cities.reduce((n, c) => n + c.game.population, 0)).toBe(before);
    expect(decodeWorld(JSON.stringify(syncWorld(g))).ok).toBe(true);
  }, 60000);
  it('holds fuel and cargo when a storm blocks an already-departed route', () => {
    let g = switchCity(fixture(), 'city-2');
    g = dispatch(g, { ship: 'ship-lab', to: 'city-1', task: 'trade', cargo: { materials: 30 } });
    g = fleetOnly(g, 4);
    const w = mutableWorld(syncWorld(g)),
      c = w.cities[0];
    c.game = forecast({ ...c.game, disaster: { ...c.game.disaster!, setting: 'normal' } }, 'storm');
    c.game = { ...c.game, disaster: { ...c.game.disaster!, phase: 'active' } };
    const fuel = w.ships[0].fuel;
    g = fleetOnly(attachWorld(g, w), 10);
    expect(g.world!.ships[0].state).toBe('avoiding');
    expect(g.world!.ships[0].fuel).toBe(fuel);
    expect(g.world!.ships[0].cargo.materials).toBe(30);
    expect(decodeWorld(JSON.stringify(syncWorld(g))).ok).toBe(true);
  }, 60000);
  it('keeps inactive cities running when the active capital is lost', () => {
    let g = fixture();
    g = {
      ...g,
      structure: { ...g.structure, loss: { reason: 'core', time: 0, firstFailure: 'core' } },
    };
    g = tick(g, 1);
    expect(g.world!.clock).toBe(1);
    expect(g.world!.cities[1].game.elapsed).toBe(1);
    expect(g.world!.cities[0].game.elapsed).toBe(0);
  }, 60000);
  it('applies specialty and completed research bonuses once, with real costs', () => {
    let g = fixture(),
      before = cityReport(g).foodProduction;
    expect(
      demandFactor({
        ...g,
        worldContext: { ...g.worldContext!, region: 'frozen', specialty: 'industry' },
      }),
    ).toBeCloseTo(1.32);
    g = specialize(g, 'city-1', 'agriculture');
    expect(cityReport(g).foodProduction).toBeGreaterThan(before);
    const materials = inventory(g).stocks.materials;
    g = { ...g, world: { ...g.world!, research: { ...g.world!.research, points: 100 } } };
    g = startResearch(g, 'betterFarms');
    expect(inventory(g).stocks.materials).toBe(materials - 20);
    const w = mutableWorld(syncWorld(g));
    researchStep(w, 21);
    g = attachWorld(g, w);
    expect(w.research.completed).toContain('betterFarms');
    const output = cityReport(g).foodProduction;
    g = startResearch(g, 'betterFarms');
    expect(cityReport(g).foodProduction).toBe(output);
    expect(g.world!.research.completed.filter((id) => id === 'betterFarms')).toHaveLength(1);
  }, 60000);
  it('bridges impose real anchor mass, pay both cities and carry finite in-transit cargo', () => {
    let g = fixture(),
      w = mutableWorld(syncWorld(g));
    w.research.completed = ['strongFrame', 'lightFrame', 'skyBridges'];
    for (const c of w.cities) {
      c.game = { ...c.game, worldContext: context(w, c) };
      c.game = authorPlot(c.game, 'skybridgeAnchor');
    }
    g = attachWorld(g, w);
    const target = w.cities[1].id,
      before = w.cities.map((c) => inventory(c.game).stocks.materials);
    g = buildBridge(g, target);
    expect(g.world!.bridges).toHaveLength(1);
    expect(syncWorld(g).cities.map((c) => inventory(c.game).stocks.materials)).toEqual(
      before.map((n) => n - 120),
    );
    w = mutableWorld(syncWorld(g));
    const total = w.cities.reduce((n, c) => n + cargoStock(c, 'materials'), 0);
    bridgeStep(w, 1);
    expect(w.bridges[0].cargo).toBe(5);
    expect(w.cities.reduce((n, c) => n + cargoStock(c, 'materials'), 0) + w.bridges[0].cargo).toBe(
      total,
    );
    expect(decodeWorld(JSON.stringify(w)).ok).toBe(true);
  }, 60000);
  it('rejects malformed transit state and never awards lab or duplicate achievements', () => {
    const g = fixture(),
      w = mutableWorld(syncWorld(g));
    w.stats.deliveries = 1;
    const first = worldAchievements(freshProfile(), attachWorld(g, w));
    expect(first.achievements.firstTrade).toBeTruthy();
    expect(worldAchievements(first, attachWorld(g, w)).xp).toBe(first.xp);
    w.mode = 'lab';
    expect(worldAchievements(freshProfile(), attachWorld(g, w)).achievements).toEqual({});
    w.ships[0].cargo = { materials: 999 };
    expect(decodeWorld(JSON.stringify(w)).ok).toBe(false);
    expect(technologies).toHaveLength(18);
  }, 60000);
  it('changes passenger counts only as far as actual residents and housing permit', () => {
    const c = mutableWorld(syncWorld(fixture())).cities[0],
      before = c.game.population;
    const removed = moveCargo(c, 'passengers', -1e6);
    expect(removed).toBe(before);
    expect(c.game.population).toBe(0);
    expect(Object.values(c.game.city.residents).reduce((a, b) => a + b, 0)).toBe(0);
  }, 60000);
});
