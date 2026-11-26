import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../data/rules';
import { verticalBase, add } from '../game/vertical/scenarios';
import { disasterExample } from '../game/disasters/scenarios';
import { freshDisaster } from '../game/disasters/state';
import { forecast } from '../game/disasters/scheduler';
import { applyImpact } from '../game/disasters/protection';
import { changeDisasterSetting } from '../game/disasters/manager';
import { gravityFactor } from '../game/disasters/effects';
import { analyze } from '../game/analysis';
import { tick } from '../game/engine';
import { decodeSave } from '../game/storage';
import { operatingNetwork } from '../game/city/operations';
import type { Game } from '../types/game';
function base() {
  const g = verticalBase(DEFAULT_SETTINGS);
  return {
    ...g,
    labPaused: false,
    disaster: freshDisaster('lab'),
    city: { ...g.city, unlimited: false },
  };
}
function run(g: Game, n: number) {
  for (let i = 0; i < n * 4; i++) g = tick(g, 0.25);
  return g;
}
describe('disaster boundaries and coupled systems', () => {
  it('freezes warning, impact and damage clocks on pause and preserves simulation time at 3x', () => {
    const g = forecast(base(), 'meteor', { duration: 10, warning: 10 });
    expect(tick({ ...g, labPaused: true }, 1).disaster).toEqual(g.disaster);
    expect(tick({ ...g, city: { ...g.city, speed: 0 } }, 1).disaster).toEqual(g.disaster);
    const fast = run({ ...g, city: { ...g.city, speed: 3 } }, 4),
      normal = run(g, 12);
    expect(fast.disaster).toEqual(normal.disaster);
    expect(fast.buildings).toEqual(normal.buildings);
  });
  it('uses local effective gravity and leaves stored mass unchanged', () => {
    let g = forecast(base(), 'gravity', { target: { x: 2, y: 0, z: 2 }, level: 5 });
    g = { ...g, disaster: { ...g.disaster!, phase: 'active', clock: 20 } };
    const calm = { ...g, disaster: { ...g.disaster!, phase: 'calm' as const } };
    expect(gravityFactor(g, { x: 2, z: 2 })).toBeGreaterThan(gravityFactor(g, { x: -3, z: -3 }));
    expect(analyze(g).mass).toBe(analyze(calm).mass);
    expect(analyze(g).structural.nodes.get('2,2')!.load).toBeGreaterThanOrEqual(
      analyze(calm).structural.nodes.get('2,2')!.load,
    );
  });
  it('lightning causes actual generation loss and finite charged batteries support the network', () => {
    const g = base(),
      plant = g.buildings.find((b) => b.kind === 'power')!;
    let hit = applyImpact(g, {
      id: '1:l0',
      at: 0,
      cell: plant.origin,
      kind: 'lightning',
      power: 45,
      radius: 0.6,
    });
    expect(operatingNetwork(hit).generation).toBeLessThan(operatingNetwork(g).generation);
    const unbacked = run(hit, 10);
    add(hit, 'emergencyBattery', 1, -2);
    const battery = hit.buildings.at(-1)!;
    hit = { ...hit, city: { ...hit.city, batteries: { [battery.id]: 180 } } };
    const backed = run(hit, 10);
    expect(backed.city.batteries[battery.id]).toBeLessThan(180);
    expect(analyze(backed).lift).toBeGreaterThan(analyze(unbacked).lift);
    expect(decodeSave(JSON.stringify(backed)).ok).toBe(true);
  });
  it('rejects inconsistent rewards, duplicate impacts and overflowing shelter saves', () => {
    const g = forecast(base(), 'meteor');
    const bad = structuredClone(g);
    bad.disaster!.threat!.impacts.push(bad.disaster!.threat!.impacts[0]);
    expect(decodeSave(JSON.stringify(bad)).ok).toBe(false);
    const reward = structuredClone(g);
    reward.disaster!.mode = 'survival';
    reward.disaster!.reward = 1;
    reward.disaster!.claimed = [1];
    expect(decodeSave(JSON.stringify(reward)).ok).toBe(false);
    add(g, 'shelter', 1, -2);
    g.disaster!.evacuated = [{ home: 1, shelter: g.buildings.at(-1)!.id, count: 81 }];
    expect(decodeSave(JSON.stringify(g)).ok).toBe(false);
  });
  it('weather-only free play removes temporary effects without deleting sheltered people', () => {
    let g = base();
    add(g, 'shelter', 1, -2);
    const home = g.buildings.find((b) => b.kind === 'home')!,
      shelter = g.buildings.at(-1)!;
    const count = g.city.residents[home.id];
    g = {
      ...g,
      city: { ...g.city, residents: { ...g.city.residents, [home.id]: 0 } },
      disaster: {
        ...g.disaster!,
        mode: 'free',
        evacuated: [{ home: home.id, shelter: shelter.id, count }],
        outages: { [home.id]: 8 },
      },
    };
    const off = changeDisasterSetting(g, 'weather');
    expect(off.population).toBe(g.population);
    expect(off.city.displaced).toBe(g.city.displaced + count);
    expect(off.disaster!.outages).toEqual({});
    expect(decodeSave(JSON.stringify(off)).ok).toBe(true);
  });
  for (const example of ['A', 'B', 'C', 'D', 'E', 'F'] as const)
    it(
      'validates independent laboratory ' + example,
      () => {
        const g = disasterExample(DEFAULT_SETTINGS, example);
        expect(decodeSave(JSON.stringify(g)).ok).toBe(true);
        expect(g.campaign).toBeUndefined();
      },
      20000,
    );
});
