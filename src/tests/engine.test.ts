import { describe, expect, it } from 'vitest';
import { SHAPES, BLOCKS, LEGACY_KINDS } from '../data/rules';
import { cellsOf, cameraMove, rotate, key } from '../game/grid';
import { newGame, place, hold, recycle, turn, tick, move } from '../game/engine';
import { validatePlacement } from '../game/placement';
import { analyze, objectives } from '../game/analysis';
import { draw } from '../game/supply';
import { decodeSave } from '../game/storage';
import type { Game, Kind, Shape } from '../types/game';
const candidate = (g: Game, kind: Kind, x: number, z: number, shape: Shape = 'single'): Game => ({
  ...g,
  active: { kind, shape, rotation: 0 },
  cursor: { x, z },
});
describe('grid geometry and camera', () => {
  it('snaps fractional cursor input and canonicalizes negative zero', () => {
    const g = newGame();
    expect(move(g, { x: -0.1, z: -0 }).cursor).toEqual({ x: 0, z: 0 });
    expect(move(g, { x: Number.NaN, z: 1 })).toBe(g);
  });
  for (const shape of Object.keys(SHAPES) as Shape[])
    it(`${shape}: four rotations preserve every occupied cell`, () => {
      const original = cellsOf({ kind: 'platform', shape, rotation: 0 });
      expect(original.map((c) => rotate(c, 4))).toEqual(original);
      expect(new Set(cellsOf({ kind: 'platform', shape, rotation: 1 }).map(key)).size).toBe(
        original.length,
      );
      let g = candidate(newGame(), 'platform', 0, 0, shape);
      for (let i = 0; i < 4; i++) g = turn(g, 1);
      expect(g.active.rotation).toBe(0);
    });
  it('rotates an asymmetric L clockwise and counterclockwise', () => {
    expect(rotate({ x: 1, z: 2 }, 1)).toEqual({ x: -2, z: 1 });
    expect(rotate({ x: 1, z: 2 }, -1)).toEqual({ x: 2, z: -1 });
  });
  it.each([
    [0, 0, -1],
    [Math.PI / 2, -1, 0],
    [Math.PI, 0, 1],
    [-Math.PI / 2, 1, 0],
  ])('movement follows camera at %s', (angle, x, z) =>
    expect(cameraMove(0, -1, angle)).toEqual({ x, z }),
  );
  it('clamps the cursor to the build area', () =>
    expect(move(newGame(), { x: 99, z: -99 }).cursor).toEqual({ x: 7, z: -8 }));
});
describe('placement and expansion', () => {
  it('starts with independent platform and facility grids', () => {
    const g = newGame();
    expect(g.platforms).toHaveLength(36);
    expect(g.buildings).toHaveLength(5);
  });
  it.each([
    ['home', -1, -2, 'overlap'],
    ['home', 4, 4, 'missingPlatform'],
    ['home', 0, 0, 'core'],
    ['platform', 6, 6, 'disconnectedPlatform'],
    ['platform', -2, -2, 'overlap'],
    ['home', 8, 0, 'bounds'],
  ] as const)('rejects %s at %s,%s without mutations', (kind, x, z, reason) => {
    const g = candidate(newGame(), kind, x, z),
      before = JSON.stringify(g);
    expect(validatePlacement(g).reason).toBe(reason);
    expect(place(g)).toBe(g);
    expect(JSON.stringify(g)).toBe(before);
  });
  it('adds a connected platform and then builds on it', () => {
    let g = place(candidate(newGame(), 'platform', -4, -2));
    expect(g.platforms).toHaveLength(37);
    g = place(candidate(g, 'home', -4, -2));
    expect(g.buildings).toHaveLength(6);
  });
  it('checks all cells of rotated multi-cell blocks', () => {
    const g = candidate(newGame(), 'home', -2, -1, 'O');
    expect(validatePlacement(g).valid).toBe(true);
    const changed = place(g);
    expect(changed.buildings).toHaveLength(6);
    expect(place(candidate(changed, 'park', -1, 0))).toEqual(candidate(changed, 'park', -1, 0));
  });
  it('platform mass is distributed across its footprint', () => {
    const g = place(candidate(newGame(), 'platform', -4, -2, 'I'));
    expect(g.platforms).toHaveLength(36);
    const rotated = candidate(newGame(), 'platform', -4, -2, 'I');
    rotated.active.rotation = 1;
    const out = place(rotated);
    expect(out.platforms.slice(36).reduce((s, c) => s + c.mass, 0)).toBeCloseTo(5);
  });
});
describe('supply, time and hold', () => {
  it('same seed yields the same city and supply', () =>
    expect(newGame('mission', 2478)).toEqual(newGame('mission', 2478)));
  it('each nine-draw bag includes all facility types and two roads and platforms', () => {
    let s: Game['supply'] = { seed: 1, bag: [], draws: 0 };
    for (let cycle = 0; cycle < 4; cycle++) {
      const kinds: Kind[] = [];
      for (let i = 0; i < 9; i++) {
        const [p, next] = draw(s);
        kinds.push(p.kind);
        s = next;
        expect(BLOCKS[p.kind].shapes).toContain(p.shape);
      }
      expect(new Set(kinds).size).toBe(LEGACY_KINDS.length);
      expect(kinds.filter((k) => k === 'road')).toHaveLength(2);
      expect(kinds.filter((k) => k === 'platform')).toHaveLength(2);
    }
  });
  it('hold advances once, is locked until placement, then exchanges without drawing', () => {
    const g = { ...newGame(), remaining: 7 };
    const held = hold(g);
    expect(held.hold).toEqual(g.active);
    expect(held.active).toEqual(g.next[0]);
    expect(held.remaining).toBe(7);
    expect(hold(held)).toBe(held);
    const recycled = recycle(held);
    const swapped = hold(recycled);
    expect(swapped.active).toEqual(g.active);
    expect(swapped.next).toEqual(recycled.next);
  });
  it('recycles with material gain and bounded score deduction', () => {
    const g = newGame();
    const next = recycle(g);
    expect(next.resources).toBe(102);
    expect(next.score).toBe(0);
    expect(next.active).toEqual(g.next[0]);
  });
  it('valid timed-out blocks land, invalid blocks recycle safely', () => {
    const valid = { ...candidate(newGame(), 'home', -1, -1), remaining: 0.1 };
    const out = tick(valid, 0.2);
    expect(out.buildings).toHaveLength(6);
    expect(out.remaining).toBe(20);
    const invalid = { ...candidate(newGame(), 'home', 0, 0), remaining: 0.1 };
    const out2 = tick(invalid, 0.2);
    expect(out2.buildings).toEqual(invalid.buildings);
    expect(out2.resources).toBe(102);
  });
  it('training has no deadline and deterministic first four pieces', () => {
    const g = newGame('training', 9);
    expect([g.active, ...g.next].map((p) => p.kind)).toEqual(['home', 'platform', 'road', 'power']);
    expect(tick(g, 1).remaining).toBe(20);
  });
  it('training blocks cannot be consumed before their lesson', () => {
    const g = candidate(newGame('training'), 'home', -1, -1);
    expect(place(g)).toBe(g);
    const ready = { ...g, tutorial: 4 };
    expect(place(ready).tutorial).toBe(5);
  });
});
describe('connections, power, mass and mission', () => {
  it('initial city has 20 power, 2 demand and 5 capacity', () => {
    const s = analyze(newGame());
    expect(s.power).toBe(20);
    expect(s.demand).toBe(2);
    expect(s.poweredCapacity).toBe(5);
    expect(s.disconnected).toBe(0);
    expect(s.mass).toBe(301);
  });
  it('BFS enables disconnected homes when a road joins the central network', () => {
    let g = place(candidate(newGame(), 'home', -2, -1));
    expect(analyze(g).poweredCapacity).toBe(5);
    g = place(candidate(g, 'road', -1, -1));
    expect(analyze(g).poweredCapacity).toBe(10);
  });
  it('connected power is required for population growth', () => {
    const g = newGame();
    const off = { ...g, buildings: g.buildings.filter((b) => b.kind !== 'power') };
    expect(tick(off, 1).population).toBe(g.population);
    expect(tick(g, 1).population).toBe(2.5);
  });
  it('mass-weighted center and stability respond to asymmetric expansion', () => {
    const g = newGame(),
      s = analyze(g);
    const expanded = place(candidate(g, 'platform', -4, -2));
    const next = analyze(expanded);
    expect(next.center.x).toBeCloseTo((s.center.x * s.mass - 4 * 5) / (s.mass + 5));
    expect(next.center.x).toBeLessThan(s.center.x);
    expect(next.stability).toBeLessThan(s.stability);
  });
  it('multi-cell building capacity and weight count once per facility', () => {
    const g = place(candidate(newGame(), 'home', -2, 0, 'O'));
    expect(analyze(g).capacity).toBe(10);
    expect(analyze(g).mass).toBe(311);
  });
  it('completes First Light through legal construction and population growth', () => {
    let g = newGame('mission', 2478);
    for (const x of [-3, -2, -1, 0, 1]) g = place(candidate(g, 'platform', x, -4));
    for (const [x, z] of [
      [1, -3],
      [-1, -3],
      [1, -1],
      [-1, -1],
    ])
      g = place(candidate(g, 'home', x, z));
    g = place(candidate(g, 'power', 0, -4));
    g.cursor = { x: 0, z: 0 };
    for (let i = 0; i < 46; i++) g = tick(g, 1);
    expect(g.population).toBe(25);
    expect(objectives(g)).toEqual(Array(7).fill(true));
    expect(g.won).toBe(true);
    expect(analyze(g).stability).toBeGreaterThanOrEqual(70);
    const continued = place(candidate(g, 'park', 2, 2));
    expect(continued.won).toBe(true);
    expect(continued.buildings.length).toBeGreaterThan(g.buildings.length);
  });
});
describe('save integrity', () => {
  it('round-trips all state including RNG, hold, rotation and countdown', () => {
    const g = turn(hold(tick(newGame(), 0.5)), 1);
    const result = decodeSave(JSON.stringify(g));
    expect(result).toEqual({ ok: true, game: g });
    if (result.ok) expect(recycle(result.game)).toEqual(recycle(g));
  });
  it.each(['{', '{}', 'null', '{"version":99}', '{"population":-1}'])(
    'rejects damaged saves %s',
    (raw) => expect(decodeSave(raw)).toEqual({ ok: false, reason: 'corrupt' }),
  );
  it('handles a missing save', () =>
    expect(decodeSave(null)).toEqual({ ok: false, reason: 'empty' }));
  it('rejects overlapping structures, missing platforms, bad IDs, impossible population and broken queues', () => {
    const mutations = [
      (g: Game) => {
        g.buildings[1].origin = g.buildings[0].origin;
      },
      (g: Game) => {
        g.platforms = g.platforms.filter((p) => !(p.x === -1 && p.z === -2));
      },
      (g: Game) => {
        g.buildings[1].id = 1;
      },
      (g: Game) => {
        g.population = 1000;
      },
      (g: Game) => {
        g.next.pop();
      },
      (g: Game) => {
        g.active.rotation = 17;
      },
    ];
    for (const mutate of mutations) {
      const g = newGame();
      mutate(g);
      expect(decodeSave(JSON.stringify(g)).ok).toBe(false);
    }
  });
});
