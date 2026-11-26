import { describe, it, expect } from 'vitest';
import { newGame, place } from '../game/engine';
import { makePlatform, edgeKey } from '../game/stability/state';
import { freshVertical } from '../types/vertical';
import { validatePlacement } from '../game/placement';
import { decodeSave } from '../game/storage';
import { analyze } from '../game/analysis';
import { temporarySupport } from '../game/vertical/emergency';
import { structureStep } from '../game/stability/simulation';
import { memberCapacity } from '../game/vertical/support';
import { reinforce } from '../game/repair/maintenance';
import { volume } from '../game/vertical/geometry';
import { key } from '../game/grid';
import type { Game, Kind, Shape } from '../types/game';
const base = (): Game => ({
  ...newGame('lab', 12),
  vertical: freshVertical(),
  buildings: [],
  platforms: Array.from({ length: 25 }, (_, i) =>
    makePlatform({ x: (i % 5) - 2, z: Math.floor(i / 5) - 2 }, 'platform', 0, 1, true),
  ),
  population: 0,
  nextId: 1,
  resources: 1000,
});
function build(g: Game, kind: Kind, x: number, z: number, y = 0, shape: Shape = 'single') {
  const q = { ...g, active: { kind, shape, rotation: 0 }, cursor: { x, z, y } };
  expect(validatePlacement(q).valid, validatePlacement(q).reason).toBe(true);
  return place(q);
}
describe('vertical recovery and occupied volume', () => {
  it('temporary supports cost resources, add mass, expire and retain cooldown', () => {
    let g = build(base(), 'column', -2, -2);
    g = build(g, 'deck', -2, -2, 1);
    g = { ...g, mode: 'mission', structure: { ...g.structure, grace: 60 } };
    const b = g.buildings[0],
      target = { type: 'building' as const, id: String(b.id) },
      before = memberCapacity(b, g);
    let next = temporarySupport(g, target);
    expect(next.resources).toBeLessThan(g.resources);
    expect(analyze(next).mass - analyze(g).mass).toBe(4);
    expect(memberCapacity(next.buildings[0], next)).toBeCloseTo(before * 1.5);
    expect(temporarySupport(next, target)).toBe(next);
    for (let i = 0; i < 80; i++) next = structureStep(next, 0.25);
    expect(next.buildings[0].temporary).toBe(0);
    expect(next.vertical!.emergencyCooldown).toBe(25);
    expect(memberCapacity(next.buildings[0], next)).toBe(before);
    expect(decodeSave(JSON.stringify(next)).ok).toBe(true);
  });
  it('reinforcing a member edge updates the member instead of writing an invalid vertical tile edge', () => {
    let g = build(base(), 'column', -2, -2);
    g = build(g, 'deck', -2, -2, 1);
    const id = edgeKey('-2,-2', '-2,1,-2');
    const next = reinforce(g, { type: 'edge', id });
    expect(next.buildings[0].reinforcement).toBe(1);
    expect(next.structure.edges[id]).toBeUndefined();
    expect(decodeSave(JSON.stringify(next)).ok).toBe(true);
  });
  it('paired columns carry two support paths with one total mass', () => {
    let g = build(base(), 'column', -2, -2, 0, 'columnPair');
    const before = analyze(g).mass;
    g = build(g, 'deck', -2, -2, 1, 'D');
    const r = analyze(g);
    expect(
      [...r.structural.edges.values()].filter(
        (e) => e.a.split(',').length !== e.b.split(',').length,
      ),
    ).toHaveLength(2);
    expect(r.mass - before).toBe(8);
    expect(decodeSave(JSON.stringify(g)).ok).toBe(true);
  });
  it('taller unsupported column chains buckle more than single-story columns', () => {
    let g = build(base(), 'industrialColumn', -2, -2);
    const capacity = memberCapacity(g.buildings[0], g);
    g = build(g, 'deck', -2, -2, 1);
    g = build(g, 'industrialColumn', -2, -2, 1);
    expect(memberCapacity(g.buildings[0], g)).toBeLessThan(capacity);
  });
  it('arch volume includes its upper span and rejects a colliding upper facility', () => {
    let g = build(base(), 'truss', -2, -2, 0, 'arch');
    expect(volume(g.buildings[0], g.buildings[0].origin).map(key)).toContain('-1,1,-2');
    expect(
      validatePlacement({
        ...g,
        active: { kind: 'deck', shape: 'single', rotation: 0 },
        cursor: { x: -1, z: -2, y: 1 },
      }).reason,
    ).toBe('volumeOverlap');
    expect(decodeSave(JSON.stringify(g)).ok).toBe(true);
  });
  it('a ceiling blocks descending ground delivery while a floor change leaves the piece untouched', () => {
    let g = build(base(), 'column', -2, -2);
    g = build(g, 'deck', -2, -2, 1, 'O');
    const piece = { kind: 'home' as const, shape: 'single' as const, rotation: 0 };
    expect(validatePlacement(g, piece, { x: -1, z: -2 }).reason).toBe('descentBlocked');
    expect(validatePlacement(g, piece, { x: -1, z: -2, y: 1 }).valid).toBe(true);
  });
  it('rejects unsupported vertical saves, illegal rotations and lower rock intersection', () => {
    const g = build(base(), 'column', -2, -2);
    expect(decodeSave(JSON.stringify({ ...g, vertical: undefined })).ok).toBe(false);
    expect(
      decodeSave(
        JSON.stringify({ ...g, active: { kind: 'home', shape: 'single', rotation: 0, pitch: 1 } }),
      ).ok,
    ).toBe(false);
    expect(
      validatePlacement({
        ...g,
        active: { kind: 'deck', shape: 'single', rotation: 0 },
        cursor: { x: 1, z: 1, y: -1 },
      }).reason,
    ).toBe('rockVolume');
  });
});
