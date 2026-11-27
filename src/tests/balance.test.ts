import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, OPERATION, CITY_RULES, BALANCE } from '../data/rules';
import { newGame } from '../game/engine';
import { draw } from '../game/supply';
import { newHand, advanceHand } from '../game/online/match';
import { decodeSave, settingsSchema } from '../game/storage';
import { selectAdvice, foodRunway } from '../game/city/advisor';
import { cityReport } from '../game/city/report';
import { cityExample } from '../game/city/scenarios';
import { emergencyFood, aid, supportReason } from '../game/city/actions';
import { inventory, adjustStock } from '../game/city/inventory';
import type { Kind, Supply } from '../types/game';

describe('phase 11 bounded supply and compatibility', () => {
  it('bounds persistent essential gaps and repeats over multiple deterministic seeds', () => {
    const needed: Kind[] = ['platform', 'road', 'power', 'farm', 'liftSmall'];
    for (let seed = 0; seed < 32; seed++) {
      let supply: Supply = { seed, draws: 0, bag: [], policy: 'adaptive', version: 2, recent: [] };
      const last = Object.fromEntries(needed.map((k) => [k, -1]));
      let previous: Kind | null = null,
        run = 0;
      for (let i = 0; i < 500; i++) {
        const context = {
          needsLift: true,
          needsSpace: true,
          needsRoad: true,
          city: { tier: 1, needFood: true, needPower: true },
        };
        const [p, next] = draw(supply, false, context);
        expect(draw(supply, false, context)).toEqual([p, next]);
        expect(OPERATION[p.kind].unlock).toBeLessThanOrEqual(1);
        run = previous === p.kind ? run + 1 : 1;
        previous = p.kind;
        expect(run).toBeLessThanOrEqual(BALANCE.repeatLimit);
        for (const k of needed) expect(i - last[k]).toBeLessThanOrEqual(12);
        if (p.kind in last) last[p.kind] = i;
        supply = next;
      }
    }
  }, 20000);
  it('accepts bounded late-game v2 bags while preserving the legacy limit', () => {
    const g = newGame();
    const supply = { ...g.supply, bag: Array(80).fill('road') };
    expect(decodeSave(JSON.stringify({ ...g, supply })).ok).toBe(true);
    expect(
      decodeSave(JSON.stringify({ ...g, supply: { ...supply, bag: Array(129).fill('road') } })).ok,
    ).toBe(false);
    expect(
      decodeSave(
        JSON.stringify({ ...g, supply: { ...supply, version: undefined, recent: undefined } }),
      ).ok,
    ).toBe(false);
  });
  it('avoids a third repeat even when only that kind remains in the bag', () => {
    const [p] = draw({ seed: 1, draws: 5, bag: ['road'], version: 2, recent: ['road', 'road'] });
    expect(p.kind).not.toBe('road');
  });
  it('preserves old saves and rejects unknown/incomplete supply or UX versions', () => {
    const g = newGame();
    const legacy = { ...g, supply: { seed: 42, bag: [], draws: 4, policy: 'adaptive' } };
    const old = decodeSave(JSON.stringify(legacy));
    expect(old.ok).toBe(true);
    if (old.ok) expect(old.game.supply.version).toBeUndefined();
    expect(decodeSave(JSON.stringify(g)).ok).toBe(true);
    for (const supply of [
      { ...g.supply, version: 3 },
      { ...g.supply, recent: undefined },
      { ...g.supply, recent: Array(25).fill('home') },
    ])
      expect(decodeSave(JSON.stringify({ ...g, supply })).ok).toBe(false);
    const { uxVersion, textScale, highContrast, onboarding, ...oldSettings } = DEFAULT_SETTINGS;
    expect(settingsSchema.parse(oldSettings)).toMatchObject({
      uxVersion: 1,
      textScale: 1,
      highContrast: false,
      onboarding: true,
    });
    for (const patch of [{ uxVersion: 2 }, { textScale: 2 }, { textScale: NaN }])
      expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...patch }).success).toBe(false);
  });
  it('keeps campaign scripts exact and online equal without offline adaptation', () => {
    let a = newHand(123),
      b = newHand(123);
    for (let i = 0; i < 500; i++) {
      expect(a.active).toEqual(b.active);
      expect(a.supply.version).toBeUndefined();
      a = advanceHand(a);
      b = advanceHand(b);
    }
    const s: Supply = { seed: 3, bag: [], draws: 0, version: 2, recent: [] };
    expect(draw(s, false, { script: ['home'] })[0].kind).toBe('home');
  });
});
describe('phase 11 advice and recovery boundaries', () => {
  it('uses the shortest real food runway and never counts isolated surplus as relief', () => {
    expect(
      foodRunway([
        { stock: 10, production: 1, consumption: 2 },
        { stock: 200, production: 20, consumption: 1 },
      ]),
    ).toBe(10);
    expect(foodRunway([{ stock: 0, production: 2, consumption: 2 }])).toBe(Infinity);
    expect(foodRunway([{ stock: 0, production: 0, consumption: 1 }])).toBe(0);
  });
  it('keeps every simultaneous fatal warning, deduplicates, and lets resolved advice disappear', () => {
    const advice = ['core', 'lift', 'structure', 'power', 'food'].map((id, i) => ({
      id,
      priority: 120 - i,
      value: 1,
      fatal: true,
    }));
    expect(
      selectAdvice(
        [...advice, advice[0], { id: 'credits', priority: 1, value: 0 }],
        { core: 100 },
        100,
      ),
    ).toHaveLength(5);
    expect(selectAdvice([], { core: 100 }, 101)).toEqual([]);
    expect(
      selectAdvice([{ id: 'credits', priority: 10, value: 1 }], { credits: 100 }, 129),
    ).toEqual([]);
    expect(
      selectAdvice([{ id: 'credits', priority: 10, value: 1 }], { credits: 100 }, 130),
    ).toHaveLength(1);
  });
  it('does not charge for an undeliverable food package; successful aid stays bounded', () => {
    let g = cityExample(newGame('citylab', 11), 'C');
    g = { ...g, city: { ...g.city, unlimited: false } };
    const inv = inventory(g);
    g = adjustStock(g, inv.root, 'food', inv.capacity.food);
    expect(supportReason(g, 'food')).toBe('storage');
    expect(emergencyFood(g)).toBe(g);
    g = adjustStock(g, inventory(g).root, 'food', -CITY_RULES.foodDelivery);
    const before = inventory(g).stocks.food,
      credits = g.city.credits;
    const next = emergencyFood(g);
    expect(inventory(next).stocks.food - before).toBeCloseTo(80);
    expect(next.city.credits).toBe(credits - CITY_RULES.foodPrice);
    expect(emergencyFood(next)).toBe(next);
    g = { ...g, city: { ...g.city, credits: 0, aidUses: 0 } };
    const grant = aid(g);
    expect(grant.city.aidUses).toBe(1);
    expect(aid({ ...grant, city: { ...grant.city, credits: 0 } }).city.aidUses).toBe(1);
  });
  it('reports fatal power, core and lift hazards independently of acknowledgement', () => {
    let g = cityExample(newGame('citylab', 11), 'C');
    g = {
      ...g,
      structure: { ...g.structure, coreDurability: 10 },
      buildings: g.buildings.map((b) => ({
        ...b,
        enabled: !['advancedPower', 'liftLarge'].includes(b.kind),
      })),
      city: { ...g.city, dismissed: { core: 0, lift: 0, power: 0 } },
    };
    const advice = cityReport(g).advice;
    expect(advice.find((a) => a.id === 'core')?.fatal).toBe(true);
    expect(advice.find((a) => a.id === 'power')?.fatal).toBe(true);
  });
});
