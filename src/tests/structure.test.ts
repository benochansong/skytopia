import { describe, it, expect } from 'vitest';
import { newGame, place, tick } from '../game/engine';
import { analyze, objectives } from '../game/analysis';
import { calculateMass } from '../game/stability/massCalculator';
import { makeBuilding, makePlatform, edgeKey, freshStructure } from '../game/stability/state';
import { structureStep, simulateStructure } from '../game/stability/simulation';
import { processCollapse } from '../game/stability/collapseSystem';
import { recordEvent } from '../game/stability/events';
import {
  reinforce,
  repair,
  demolish,
  emergencyLift,
  selectBlueprint,
} from '../game/repair/maintenance';
import { decodeSave } from '../game/storage';
import { validatePlacement } from '../game/placement';
import { DEFAULT_SETTINGS, PHYSICAL } from '../data/rules';
import type { Game, Kind, Shape } from '../types/game';
import { key } from '../game/grid';
function add(g: Game, kind: Kind, x: number, z: number, shape: Shape = 'single'): Game {
  const next = place({ ...g, active: { kind, shape, rotation: 0 }, cursor: { x, z } });
  expect(next.nextId, 'legal fixture placement ' + kind + ' ' + x + ',' + z).toBe(g.nextId + 1);
  return next;
}
const live = (g: Game): Game => ({
  ...g,
  labPaused: false,
  structure: { ...g.structure, grace: 0 },
});
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.25) g = tick(g, 0.25);
  return g;
};
function cantilever(): Game {
  let g = newGame('lab', 22);
  for (let x = 3; x <= 6; x++) g = add(g, 'platform', x, 0);
  g = add(g, 'factory', 6, 0);
  return live(g);
}
describe('mass, lift and torque', () => {
  it('symmetric weights around the core cancel both moments', () => {
    let g = newGame('lab', 1);
    g = {
      ...g,
      platforms: Array.from({ length: 25 }, (_, i) =>
        makePlatform({ x: (i % 5) - 2, z: Math.floor(i / 5) - 2 }, 'platform', i, 1, true),
      ),
      buildings: [
        makeBuilding({ kind: 'factory', shape: 'single', rotation: 0 }, { x: 2, z: 0 }, 1),
        makeBuilding({ kind: 'factory', shape: 'single', rotation: 0 }, { x: -2, z: 0 }, 2),
        makeBuilding({ kind: 'factory', shape: 'single', rotation: 0 }, { x: 0, z: 2 }, 3),
        makeBuilding({ kind: 'factory', shape: 'single', rotation: 0 }, { x: 0, z: -2 }, 4),
      ],
      structure: freshStructure(),
    };
    const r = analyze(g).structural;
    expect(r.center.x).toBeCloseTo(0);
    expect(r.center.z).toBeCloseTo(0);
    expect(r.torque.x).toBeCloseTo(0);
    expect(r.torque.z).toBeCloseTo(0);
  });
  it('counts a multi-cell facility once and includes foundation mass and height', () => {
    const g = add(newGame('lab', 1), 'largeHome', -3, 0, 'O'),
      m = calculateMass(g);
    expect(m.mass).toBe(301 + 35);
    expect(Number.isFinite(m.center.y)).toBe(true);
    expect(calculateMass({ ...g, buildings: [...g.buildings, g.buildings.at(-1)!] }).mass).toBe(
      m.mass,
    );
  });
  it('equal mass farther from the core creates greater torque', () => {
    let g = newGame('lab', 1);
    for (let x = 3; x <= 5; x++) g = add(g, 'platform', x, 1);
    const near = add(g, 'factory', 1, 1),
      far = add(g, 'factory', 5, 1);
    expect(analyze(far).structural.torque.z).toBeGreaterThan(analyze(near).structural.torque.z);
  });
  it('local lift improves balance; lift on the wrong side worsens it', () => {
    let g = cantilever();
    g = add(g, 'metalPlatform', 5, 1);
    g = add(g, 'factory', 5, 0);
    const charged = (city: Game, x: number, z: number) => {
      let out = add(city, 'liftSmall', x, z);
      out = {
        ...out,
        structure: {
          ...out.structure,
          lifts: { [out.buildings.at(-1)!.id]: { factor: 1, outage: 0 } },
        },
      };
      return analyze(out).structural;
    };
    const before = analyze(g).structural,
      near = charged(g, 5, 1),
      wrong = charged(g, -3, 0);
    expect(Math.abs(near.torque.z)).toBeLessThan(Math.abs(before.torque.z));
    expect(Math.abs(wrong.torque.z)).toBeGreaterThan(Math.abs(before.torque.z));
  });
  it('power loss grants eight seconds, then fades output and can recover', () => {
    let g = add(newGame('lab', 1), 'liftSmall', 1, -1);
    g = live(g);
    g = structureStep(g);
    const id = g.buildings.at(-1)!.id;
    expect(analyze(g).lift).toBe(580);
    g = demolish(g, { type: 'building', id: '2' });
    g = run(g, 7);
    expect(g.structure.lifts[id].factor).toBe(1);
    g = run(g, 3);
    expect(g.structure.lifts[id].factor).toBeLessThan(1);
    g = add(g, 'power', 1, -2);
    g = run(g, 5);
    expect(g.structure.lifts[id].factor).toBe(1);
  });
});
describe('load paths, damage and recovery', () => {
  it('cantilevers concentrate load and degrade under fixed simulation time', () => {
    const g = cantilever(),
      r = analyze(g).structural;
    expect(r.worst!.ratio).toBeGreaterThan(1);
    const next = run(g, 2);
    expect([...analyze(next).structural.edges.values()].some((e) => e.hp < e.maxHP)).toBe(true);
  });
  it('adding a parallel path reduces peak connection load', () => {
    const g = cantilever(),
      before = analyze(g).structural;
    let supported = g;
    for (let x = 3; x <= 6; x++) supported = add(supported, 'platform', x, 1);
    const after = analyze(supported).structural;
    expect(after.edges.get(edgeKey('2,0', '3,0'))!.load).toBeLessThan(
      before.edges.get(edgeKey('2,0', '3,0'))!.load,
    );
  });
  it('reinforcement raises capacity with additional mass and stops further damage', () => {
    let g = cantilever(),
      r = analyze(g).structural;
    const target = {
      type: 'edge' as const,
      id: r.worst!.type === 'edge' ? r.worst!.id : edgeKey('2,0', '3,0'),
    };
    const old = r.edges.get(target.id)!;
    g = reinforce(g, target);
    r = analyze(g).structural;
    expect(r.edges.get(target.id)!.capacity).toBeGreaterThan(old.capacity);
    expect(r.mass).toBe(301 + 20 + 60 + 8);
    const hp = r.edges.get(target.id)!.hp;
    g = run(g, 1);
    expect(analyze(g).structural.edges.get(target.id)!.hp).toBe(hp);
  });
  it('damage is independent of render frame subdivision', () => {
    const g = cantilever();
    let a = g,
      b = g;
    for (let i = 0; i < 8; i++) a = simulateStructure(a, 0.25);
    for (let i = 0; i < 40; i++) b = simulateStructure(b, 0.05);
    expect(a.platforms).toEqual(b.platforms);
    expect(a.structure.edges).toEqual(b.structure.edges);
  });
  it('repair costs resources, takes time, and does not erase overload', () => {
    let g = newGame();
    g = {
      ...g,
      platforms: g.platforms.map((p) => (p.x === 1 && p.z === 1 ? { ...p, durability: 30 } : p)),
    };
    g = repair(g, { type: 'platform', id: '1,1' });
    expect(g.resources).toBe(85);
    expect(g.structure.repairs).toHaveLength(1);
    g = run(g, 2);
    expect(g.platforms.find((p) => key(p) === '1,1')!.durability).toBe(30);
    g = run(g, 1);
    expect(g.platforms.find((p) => key(p) === '1,1')!.durability).toBe(95);
    expect(g.structure.repairsDone).toBe(1);
  });
  it('emergency lift has finite duration, cost and cooldown', () => {
    let g = emergencyLift(newGame(), { x: 1, z: 1 });
    expect(g.resources).toBe(65);
    expect(analyze(g).lift).toBe(640);
    expect(emergencyLift(g, { x: 1, z: 1 })).toBe(g);
    g = run(g, 21);
    expect(g.structure.emergency.remaining).toBe(0);
    expect(g.structure.emergency.cooldown).toBeGreaterThan(0);
  });
  it('unsafe placements remain legal and safety blueprints do not consume the random queue', () => {
    let g = cantilever();
    const nextQueue = g.next;
    g = selectBlueprint({ ...g, mode: 'mission', resources: 100 }, 'liftSmall');
    const selected = { ...g, cursor: { x: 1, z: -1 } };
    expect(validatePlacement(selected).valid).toBe(true);
    const out = place(selected);
    expect(out.next).toEqual(nextQueue);
    expect(out.reservedActive).toBeNull();
    expect(out.resources).toBe(55);
  });
});
describe('collapse and saves', () => {
  it('retains the original failure while bounding later event history', () => {
    let g = recordEvent(newGame('lab', 1), 'edgeFailed', 'first-link', { x: 1, z: 1 });
    for (let i = 0; i < 80; i++) g = recordEvent(g, 'crack', String(i), { x: 1, z: 1 });
    expect(g.structure.events).toHaveLength(48);
    expect(g.structure.events[0].target).toBe('first-link');
    expect(decodeSave(JSON.stringify(g))).toEqual({ ok: true, game: g });
  });
  it('preserves a held-block lock when buying or cancelling emergency blueprints', () => {
    let g = { ...newGame(), holdUsed: true };
    const piece = g.active;
    g = selectBlueprint(g, 'liftSmall');
    g = add(g, 'liftSmall', 1, -1);
    expect(g.holdUsed).toBe(true);
    expect(g.active).toEqual(piece);
  });
  it('normalizes event and emergency coordinates before save round trips', () => {
    let g = newGame('lab', 11);
    const platform = g.platforms.find((p) => key(p) === '1,1')!;
    g = emergencyLift(g, platform);
    g = reinforce(g, { type: 'platform', id: '1,1' });
    expect(decodeSave(JSON.stringify(g))).toEqual({ ok: true, game: g });
  });
  it('loses temporary lift with its collapsed support but retains its cooldown', () => {
    let g = newGame('lab', 1);
    g = emergencyLift(g, { x: 1, z: 1 });
    g = {
      ...g,
      platforms: g.platforms.map((p) => (key(p) === '1,1' ? { ...p, durability: 0 } : p)),
    };
    expect(analyze(g).lift).toBe(500);
    g = processCollapse(g);
    expect(g.structure.emergency.remaining).toBe(0);
    expect(g.structure.emergency.cooldown).toBe(45);
  });
  it('broken bottleneck drops a district, removes mass once and frees logical occupancy', () => {
    let g = cantilever();
    const before = analyze(g).mass;
    g = {
      ...g,
      structure: {
        ...g.structure,
        edges: { [edgeKey('2,0', '3,0')]: { durability: 0, reinforcement: 0 } },
      },
    };
    g = processCollapse(g);
    expect(g.platforms).toHaveLength(36);
    expect(g.buildings).toHaveLength(5);
    expect(analyze(g).mass).toBe(before - 80);
    expect(processCollapse(g)).toBe(g);
    expect(g.structure.events.some((e) => e.kind === 'collapse')).toBe(true);
    expect(
      validatePlacement({
        ...g,
        active: { kind: 'platform', shape: 'single', rotation: 0 },
        cursor: { x: 3, z: 0 },
      }).reason,
    ).toBe('settling');
  });
  it('an independently supported detached platform does not instantly fall', () => {
    let g = add(newGame('lab', 1), 'platform', 3, 0);
    g = add(g, 'liftSmall', 3, 0);
    const id = g.buildings.at(-1)!.id;
    g = {
      ...g,
      structure: {
        ...g.structure,
        edges: { [edgeKey('2,0', '3,0')]: { durability: 0, reinforcement: 0 } },
        lifts: { [id]: { factor: 1, outage: 0 } },
      },
    };
    expect(processCollapse(g).platforms).toHaveLength(37);
  });
  it('losing one support removes a multi-cell building exactly once', () => {
    let g = add(newGame('lab', 1), 'largeHome', -3, 0, 'O');
    g = {
      ...g,
      platforms: g.platforms.map((p) => (key(p) === '-3,0' ? { ...p, durability: 0 } : p)),
    };
    g = processCollapse(g);
    expect(g.buildings.filter((b) => b.kind === 'largeHome')).toHaveLength(0);
    expect(analyze(g).capacity).toBe(5);
    expect(processCollapse(g).buildings).toEqual(g.buildings);
  });
  it('a collapsed generator changes grid output and subsequent lift output', () => {
    let g = newGame('lab', 7, DEFAULT_SETTINGS, 1, 'D');
    g = live(g);
    const weak = edgeKey('2,0', '3,0');
    g = {
      ...g,
      structure: {
        ...g.structure,
        edges: { ...g.structure.edges, [weak]: { durability: 0, reinforcement: 0 } },
      },
    };
    const out = processCollapse(g);
    expect(out.structure.events.some((e) => e.kind === 'powerLost')).toBe(true);
    expect(out.buildings.some((b) => b.kind === 'liftSmall')).toBe(false);
    expect(analyze(out).lift).toBe(500);
  });
  it('collapse queue is bounded per step and completes deterministically', () => {
    let g = newGame('lab', 1);
    const outer = [];
    for (let x = 3; x <= 7; x++)
      for (let z = 3; z <= 7; z++) outer.push(makePlatform({ x, z }, 'platform', 99));
    g = { ...g, platforms: [...g.platforms, ...outer] };
    g = processCollapse(g);
    expect(g.platforms).toHaveLength(53);
    expect(g.structure.pending.length).toBe(17);
    for (let i = 0; i < 3; i++) g = processCollapse(g);
    expect(g.platforms).toHaveLength(36);
    expect(g.structure.pending).toHaveLength(0);
  });
  it('generator loss propagates through the surviving power circuit after lift grace', () => {
    let g = newGame('lab', 55);
    for (const [x, z] of [
      [1, -1],
      [2, -1],
      [2, 0],
    ])
      g = add(g, 'road', x, z);
    g = add(g, 'platform', 3, 0);
    g = add(g, 'power', 3, 0);
    g = add(g, 'liftSmall', 1, 0);
    const id = g.buildings.at(-1)!.id;
    g = demolish(g, { type: 'building', id: '2' });
    g = structureStep(live(g));
    expect(g.structure.lifts[id].factor).toBe(1);
    g = {
      ...g,
      structure: {
        ...g.structure,
        edges: { [edgeKey('2,0', '3,0')]: { durability: 0, reinforcement: 0 } },
      },
    };
    g = processCollapse(g);
    expect(analyze(g).power).toBe(0);
    expect(g.buildings.some((b) => b.id === id)).toBe(true);
    g = run(g, 7);
    expect(g.structure.lifts[id].factor).toBe(1);
    g = run(g, 4);
    expect(g.structure.lifts[id].factor).toBeLessThan(1);
    expect(g.structure.events.some((e) => e.kind === 'liftFading')).toBe(true);
  });
  it('critical lift failure requires a response window and ends in game over', () => {
    let g = newGame('lab', 1);
    g = live({ ...g, structure: { ...g.structure, coreDurability: 120 } });
    g = run(g, 19);
    expect(g.structure.loss).toBeNull();
    g = run(g, 2);
    expect(g.structure.loss?.reason).toBe('lift');
  });
  it('damaged structures, active repairs and collapse history survive save/load', () => {
    let g = cantilever();
    g = run(g, 2);
    g = repair(g, { type: 'edge', id: edgeKey('2,0', '3,0') });
    const result = decodeSave(JSON.stringify(g));
    expect(result).toEqual({ ok: true, game: g });
    g = {
      ...g,
      structure: {
        ...g.structure,
        edges: { [edgeKey('2,0', '3,0')]: { durability: 0, reinforcement: 0 } },
      },
    };
    g = processCollapse(g);
    const restored = decodeSave(JSON.stringify(g));
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.game.buildings).toEqual(g.buildings);
  });
  it('migrates Phase 1 without changing supply, rotation or placement', () => {
    const g = newGame();
    const legacy = {
      ...g,
      version: 1,
      platforms: g.platforms.map(({ id, material, reinforcement, anchor, ...p }) => {
        void id;
        void material;
        void reinforcement;
        void anchor;
        return p;
      }),
      buildings: g.buildings.map(({ durability, enabled, ...b }) => {
        void durability;
        void enabled;
        return b;
      }),
    };
    const result = decodeSave(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.game.version).toBe(3);
      expect(result.game.supply).toEqual(g.supply);
      expect(result.game.buildings[0].durability).toBe(PHYSICAL.home.hp);
      expect(result.game.structure.coreDurability).toBe(500);
    }
  });
});
describe('campaign recovery paths', () => {
  it('Mission 02 can sustain 50 people and all conditions for twenty seconds', () => {
    let g = newGame('mission', 22, DEFAULT_SETTINGS, 2);
    g = add(g, 'largeHome', -3, 0, 'O');
    g = add(g, 'largeHome', 1, 0, 'O');
    g = add(g, 'largeHome', -3, -3, 'O');
    for (const [x, z] of [
      [-1, 0],
      [-1, -1],
      [1, -1],
      [-1, -3],
    ])
      g = add(g, 'road', x, z);
    g = add(g, 'power', 1, -3);
    g = add(g, 'liftSmall', -1, 1);
    g = { ...g, cursor: { x: 0, z: 0 } };
    g = run(g, 120);
    expect(objectives(g)).toEqual(Array(5).fill(true));
    expect(g.missionHold).toBeGreaterThanOrEqual(20);
    expect(g.won).toBe(true);
  });
  it('Mission 03 recovers through local lift and an actual reinforced link', () => {
    let g = newGame('mission', 3, DEFAULT_SETTINGS, 3);
    for (const [x, z] of [
      [3, 0],
      [4, 0],
      [2, 0],
      [2, -2],
    ])
      g = add(selectBlueprint(g, 'liftSmall'), 'liftSmall', x, z);
    g = add(selectBlueprint(g, 'power'), 'power', 1, 0);
    g = reinforce(g, { type: 'edge', id: edgeKey('2,0', '3,0') });
    g = { ...g, cursor: { x: 0, z: 0 } };
    g = run(g, 12);
    expect(objectives(g)).toEqual(Array(5).fill(true));
    expect(g.won).toBe(true);
  });
  it('Mission 04 can be saved with repairs, two reinforcements, power and extra lift', () => {
    let g = newGame('mission', 4, DEFAULT_SETTINGS, 4);
    g = repair(g, { type: 'platform', id: '3,0' });
    g = reinforce(g, { type: 'edge', id: edgeKey('2,0', '3,0') });
    g = reinforce(g, { type: 'edge', id: edgeKey('3,0', '4,0') });
    g = add(g, 'power', -1, -1);
    g = add(g, 'liftSmall', 2, -1);
    g = add(g, 'platform', 4, 1);
    g = add(g, 'liftSmall', 4, 1);
    g = { ...g, cursor: { x: 0, z: 0 } };
    g = run(g, 70);
    expect(g.structure.loss).toBeNull();
    expect(objectives(g)).toEqual(Array(5).fill(true));
    expect(g.won).toBe(true);
  });
});
