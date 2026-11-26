import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, DISASTER, PHYSICAL } from '../data/rules';
import { freshDisaster } from '../game/disasters/state';
import { forecast } from '../game/disasters/scheduler';
import { applyImpact, updateDefenses } from '../game/disasters/protection';
import { aetherFactor, weatherLoads, evacuatedTotal } from '../game/disasters/effects';
import { evacuate, returnResidents } from '../game/disasters/evacuation';
import { recoveryStep } from '../game/disasters/recovery';
import { claimWave } from '../game/disasters/manager';
import { verticalBase, add } from '../game/vertical/scenarios';
import { tick } from '../game/engine';
import { decodeSave } from '../game/storage';
import { analyze } from '../game/analysis';
import { cityReport } from '../game/city/report';
import { reconcileResidents } from '../game/city/population';
import type { Game } from '../types/game';
function base() {
  let g = verticalBase(DEFAULT_SETTINGS);
  g = {
    ...g,
    labPaused: false,
    disaster: freshDisaster('lab'),
    city: { ...g.city, unlimited: false, speed: 1 },
  };
  return g;
}
function active(kind: 'storm' | 'aether' | 'cold' = 'storm') {
  let g = forecast(base(), kind, { duration: 20, level: 4, direction: 90, wind: 40, warning: 2 });
  g = {
    ...g,
    disaster: {
      ...g.disaster!,
      phase: 'active',
      clock: 10,
      weather: { ...g.disaster!.weather, wind: 40, direction: 90 },
    },
  };
  return g;
}
function advance(g: Game, seconds: number) {
  for (let i = 0; i < seconds * 4; i++) g = tick(g, 0.25);
  return g;
}
describe('deterministic disaster engine', () => {
  it('free-build forecasts vary deterministically instead of repeating survival wave one', () => {
    const sequence = () => {
      let g: Game = { ...base(), disaster: freshDisaster('free') };
      const kinds: string[] = [];
      for (let i = 0; i < 30; i++) {
        g = forecast(g);
        kinds.push(g.disaster!.threat!.kind);
      }
      return kinds;
    };
    const kinds = sequence();
    expect(sequence()).toEqual(kinds);
    expect(new Set(kinds).size).toBeGreaterThan(5);
  });
  it('keeps earlier cities opt-in and follows the forecast through one impact and save resume', () => {
    const old = verticalBase(DEFAULT_SETTINGS);
    expect(tick({ ...old, labPaused: false }, 1).disaster).toBeUndefined();
    let g = forecast(base(), 'meteor', {
      duration: 8,
      warning: 2,
      level: 1,
      target: { x: -1, y: 0, z: -2 },
      direction: 90,
    });
    g = advance(g, 4.5);
    expect(g.disaster!.phase).toBe('active');
    expect(g.disaster!.applied).toHaveLength(1);
    const save = decodeSave(JSON.stringify(g));
    expect(save.ok).toBe(true);
    if (!save.ok) return;
    const left = advance(g, 7),
      right = advance(save.game, 7);
    expect(right).toEqual(left);
    expect(left.disaster!.applied).toHaveLength(2);
    expect(left.disaster!.reports).toHaveLength(1);
    expect(left.disaster!.weather.direction).toBe(90);
  });
  it('raises exposed high-floor wind loads and reduces them behind an oriented windbreak without changing mass', () => {
    const g = active(),
      home = g.buildings.find((b) => b.kind === 'home')!;
    const low = weatherLoads(g).forces.get(home.id)!;
    const high = {
      ...g,
      buildings: g.buildings.map((b) =>
        b.id === home.id ? { ...b, y: 2, origin: { ...b.origin, y: 2 } } : b,
      ),
    };
    expect(weatherLoads(high).forces.get(home.id)).toBeGreaterThan(low);
    const clear = { ...g, disaster: { ...g.disaster!, phase: 'calm' as const } };
    expect(analyze(g).mass).toBe(analyze(clear).mass);
    expect(analyze(g).structural.torque.z).not.toBe(analyze(clear).structural.torque.z);
    const guarded = {
      ...g,
      buildings: g.buildings.filter(
        (b) => b.origin.x !== home.origin.x - 1 || b.origin.z !== home.origin.z,
      ),
    };
    add(guarded, 'reinforcedWindbreak', home.origin.x - 1, home.origin.z, 0, 'single', 1);
    expect(weatherLoads(guarded).forces.get(home.id)).toBeLessThan(low);
  });
  it('charges shields with real aether, absorbs bounded impact energy and transmits overflow only once', () => {
    let g = base();
    add(g, 'shieldSmall', 1, -2);
    g = updateDefenses(g, 30);
    const shield = g.buildings.find((b) => b.kind === 'shieldSmall')!;
    expect(g.disaster!.shields[shield.id]).toBeGreaterThan(0);
    expect(cityReport(g).stocks.aether).toBeLessThan(30);
    const impact = {
      id: '1:m0',
      at: 0,
      cell: { x: -1, y: 0, z: -2 },
      kind: 'meteor' as const,
      power: 110,
      radius: 1,
    };
    const defended = applyImpact(g, impact),
      unguarded = applyImpact({ ...g, disaster: { ...g.disaster!, defenses: false } }, impact);
    expect(defended.disaster!.shields[shield.id]).toBe(0);
    expect(defended.buildings.find((b) => b.kind === 'home')!.durability).toBeGreaterThan(
      unguarded.buildings.find((b) => b.kind === 'home')!.durability,
    );
    expect(applyImpact(defended, impact)).toBe(defended);
  });
  it('lightning protection reduces damage and avoids the target outage', () => {
    const g = base(),
      target = g.buildings.find((b) => b.kind === 'power')!;
    const impact = {
      id: '2:l0',
      at: 0,
      cell: target.origin,
      kind: 'lightning' as const,
      power: 50,
      radius: 0.6,
    };
    const hit = applyImpact(g, impact);
    expect(hit.disaster!.outages[target.id]).toBeGreaterThan(0);
    const guarded = { ...g, buildings: [...g.buildings] };
    add(guarded, 'lightningRod', 1, -2);
    const protectedCity = applyImpact(guarded, impact);
    expect(protectedCity.buildings.find((b) => b.id === target.id)!.durability).toBe(
      target.durability,
    );
    expect(protectedCity.disaster!.stats.lightningProtected).toBe(1);
  });
  it('applies temporary aether lift reduction and restores it when the threat ends', () => {
    let g = active('aether'),
      lift = g.buildings.find((b) => b.kind === 'liftSmall')!;
    const calm = { ...g, disaster: { ...g.disaster!, phase: 'recovery' as const } };
    expect(aetherFactor(g, lift)).toBeLessThan(1);
    expect(analyze(g).lift).toBeLessThan(analyze(calm).lift);
    expect(aetherFactor(calm, lift)).toBe(1);
    add(g, 'stabilizer', 2, 3);
    g = { ...g, disaster: { ...g.disaster!, ready: g.buildings.map((b) => b.id) } };
    expect(aetherFactor(g, lift)).toBeGreaterThan(aetherFactor(active('aether'), lift));
  });
  it('evacuates along real roads, preserves population accounting and returns people after danger', () => {
    let g = forecast(base(), 'meteor', { target: { x: -1, y: 0, z: -2 } });
    add(g, 'shelter', 1, -2);
    g = updateDefenses(g, 0.25);
    const count = g.population;
    const moved = evacuate(g);
    expect(evacuatedTotal(moved)).toBeGreaterThan(0);
    expect(evacuatedTotal(moved)).toBeLessThanOrEqual(DISASTER.shelterCapacity);
    expect(
      Object.values(moved.city.residents).reduce((a, b) => a + b, 0) +
        evacuatedTotal(moved) +
        moved.city.displaced,
    ).toBeCloseTo(count);
    expect(reconcileResidents(moved).population).toBe(count);
    expect(decodeSave(JSON.stringify(moved)).ok).toBe(true);
    const back = returnResidents({ ...moved, disaster: { ...moved.disaster!, phase: 'recovery' } });
    expect(evacuatedTotal(back)).toBe(0);
    expect(back.population).toBe(count);
    const cut = { ...g, buildings: g.buildings.filter((b) => b.kind !== 'road') };
    expect(evacuatedTotal(evacuate(cut))).toBe(0);
  });
  it('cold affects actual housing demand and farm output while settings do not change rules', () => {
    const g = base(),
      cold = {
        ...g,
        disaster: { ...g.disaster!, weather: { ...g.disaster!.weather, temperature: -20 } },
      };
    expect(cityReport(cold).demand).toBeGreaterThan(cityReport(g).demand);
    expect(cityReport(cold).foodProduction).toBeLessThan(cityReport(g).foodProduction);
    expect(
      cityReport({ ...cold, settings: { ...cold.settings, reducedMotion: true } }).demand,
    ).toBe(cityReport(cold).demand);
  });
  it('repair centers pay for queued repairs and wave rewards cannot be claimed twice after saving', () => {
    let g = base();
    add(g, 'repairCenter', 1, -2);
    const plant = g.buildings.find((b) => b.kind === 'power')!;
    g = {
      ...g,
      buildings: g.buildings.map((b) =>
        b.id === plant.id ? { ...b, durability: PHYSICAL[b.kind].hp * 0.5 } : b,
      ),
      disaster: { ...g.disaster!, ready: g.buildings.map((b) => b.id) },
    };
    const repaired = recoveryStep(g, 4);
    expect(repaired.structure.repairs.length).toBeGreaterThan(0);
    expect(repaired.resources).toBeLessThan(g.resources);
    const rewardBase = base();
    rewardBase.population = 130;
    rewardBase.city.residents = {};
    rewardBase.city.displaced = 130;
    const rewarded = claimWave(
      { ...rewardBase, disaster: { ...freshDisaster('survival'), reward: 1 } },
      'energy',
    );
    expect(rewarded.disaster!.wave).toBe(2);
    expect(claimWave(rewarded, 'energy')).toBe(rewarded);
    const save = decodeSave(JSON.stringify(rewarded));
    expect(save.ok).toBe(true);
    if (save.ok) expect(claimWave(save.game, 'energy')).toBe(save.game);
  });
});
