import { describe, it, expect, vi, afterEach } from 'vitest';
import { newGame, place } from '../game/engine';
import { makePlatform, edgeKey } from '../game/stability/state';
import { key, atFloor, cellsOf, transform } from '../game/grid';
import { validatePlacement } from '../game/placement';
import { freshVertical } from '../types/vertical';
import { analyze } from '../game/analysis';
import { BLOCKS, RULES } from '../data/rules';
import { decodeSave, loadGame, saveGame } from '../game/storage';
import { loadCampaign, CAMPAIGN_KEY, freshCampaign, saveCampaign } from '../game/campaign/storage';
import { structureStep } from '../game/stability/simulation';
import { demolish, reinforce } from '../game/repair/maintenance';
import { operatingNetwork } from '../game/city/operations';
import type { Game, Kind, Shape } from '../types/game';
export function emptyVertical(): Game {
  const g = newGame('lab', 2478);
  return {
    ...g,
    vertical: freshVertical(),
    buildings: [],
    platforms: Array.from({ length: 25 }, (_, i) =>
      makePlatform(atFloor((i % 5) - 2, Math.floor(i / 5) - 2), 'platform', 0, 1, true),
    ),
    population: 0,
    nextId: 1,
    resources: 10000,
    labPaused: false,
  };
}
function build(
  g: Game,
  kind: Kind,
  x: number,
  z: number,
  y = 0,
  shape: Shape = BLOCKS[kind].shapes[0],
  rotation = 0,
) {
  const next = { ...g, active: { kind, shape, rotation }, cursor: atFloor(x, z, y) };
  expect(
    validatePlacement(next).valid,
    kind + ' ' + key(next.cursor) + ' ' + validatePlacement(next).reason,
  ).toBe(true);
  return place(next);
}
function upper() {
  let g = build(emptyVertical(), 'column', -2, -2);
  return build(g, 'deck', -2, -2, 1, 'O');
}
afterEach(() => vi.unstubAllGlobals());
describe('vertical grid, structure and migration', () => {
  it('uses distinct 3D IDs and preserves zero-floor IDs and four-axis rotations', () => {
    expect(key({ x: 1, z: 2, y: 0 })).toBe('1,2');
    expect(key({ x: 1, z: 2, y: 1 })).toBe('1,1,2');
    expect(transform({ x: 1, y: 2, z: 3 }, { rotation: 4, pitch: 4, roll: 4 })).toEqual({
      x: 1,
      y: 2,
      z: 3,
    });
    expect(
      new Set(cellsOf({ kind: 'industrialColumn', shape: 'verticalI', rotation: 0 }).map(key)).size,
    ).toBe(2);
  });
  it('rejects unsupported decks and collision through a two-floor facility without mutation', () => {
    const g = emptyVertical();
    const q = {
      ...g,
      active: { kind: 'deck' as const, shape: 'single' as const, rotation: 0 },
      cursor: atFloor(-2, -2, 1),
    };
    expect(validatePlacement(q).reason).toBe('noSupport');
    expect(place(q)).toBe(q);
    let tower = build(g, 'towerHome', -2, -2);
    expect(validatePlacement({ ...tower, active: q.active, cursor: q.cursor }).reason).toBe(
      'volumeOverlap',
    );
    expect(
      validatePlacement({
        ...tower,
        active: { kind: 'column', shape: 'single', rotation: 0 },
        cursor: atFloor(-2, -2),
      }).reason,
    ).toBe('volumeOverlap');
  });
  it('transfers upper mass once, shares load with a second column, and changes 3D center', () => {
    const g = upper(),
      heavy = build(g, 'towerHome', -2, -2, 1);
    expect(analyze(heavy).mass - analyze(g).mass).toBeCloseTo(100);
    expect(analyze(heavy).center.y).toBeGreaterThan(analyze(g).center.y ?? 0);
    const e = edgeKey('-2,-2', '-2,1,-2'),
      before = analyze(heavy).structural.edges.get(e)!;
    expect(before.load).toBeGreaterThan(80);
    const safer = build(heavy, 'column', -1, -2);
    expect(analyze(safer).structural.edges.get(e)!.load).toBeLessThan(before.load);
    expect(analyze(safer).stability).toBeGreaterThan(analyze(heavy).stability);
  });
  it('preserves upper decks on alternate support and collapses only after the last support is lost', () => {
    let g = build(upper(), 'column', -1, -2);
    g = build(g, 'home', -1, -1, 1);
    const columns = g.buildings.filter((b) => b.kind === 'column');
    g = demolish(g, { type: 'building', id: String(columns[0].id) });
    g = structureStep(g);
    expect(g.platforms.filter((p) => p.y === 1)).toHaveLength(4);
    g = demolish(g, { type: 'building', id: String(columns[1].id) });
    g = structureStep(g);
    expect(g.platforms.filter((p) => p.y === 1)).toHaveLength(0);
    expect(g.platforms.filter((p) => p.y === 0)).toHaveLength(25);
    expect(g.buildings.some((b) => b.y > 0)).toBe(false);
    expect(g.structure.collapsedCount).toBe(5);
    expect(structureStep(g).structure.collapsedCount).toBe(5);
  });
  it('reinforces actual columns with finite cost and greater capacity', () => {
    let g = build(upper(), 'towerHome', -2, -2, 1);
    g = { ...g, mode: 'mission' };
    const c = g.buildings.find((b) => b.kind === 'column')!,
      eid = edgeKey('-2,-2', '-2,1,-2'),
      before = analyze(g).structural.edges.get(eid)!.capacity;
    const next = reinforce(g, { type: 'building', id: String(c.id) });
    expect(next.resources).toBeLessThan(g.resources);
    expect(analyze(next).structural.edges.get(eid)!.capacity).toBeGreaterThan(before);
    expect(decodeSave(JSON.stringify(next)).ok).toBe(true);
  });
  it('keeps v3 and campaign-v1 originals when migrated saves are written to new keys', () => {
    const g = newGame('mission', 17),
      legacy = { ...g, version: 3 },
      raw = JSON.stringify(legacy),
      old = freshCampaign();
    old.current = null;
    const original = JSON.stringify({ ...old, version: 1 });
    const data = new Map([
      [RULES.phase3SaveKey, raw],
      ['skytopia.campaign.v1', original],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
    });
    const loaded = loadGame();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.game.version).toBe(5);
    expect(loaded.game.buildings).toEqual(g.buildings);
    expect(loaded.game.population).toBe(g.population);
    expect(saveGame(loaded.game)).toBe(true);
    expect(data.get(RULES.phase3SaveKey)).toBe(raw);
    const campaign = loadCampaign();
    expect(saveCampaign(campaign.save)).toBe(true);
    expect(data.get('skytopia.campaign.v1')).toBe(original);
    expect(JSON.parse(data.get(CAMPAIGN_KEY)!).version).toBe(3);
  });
  it('round trips upper deck identity and rejects mismatched floors', () => {
    const g = upper(),
      raw = JSON.stringify(g),
      decoded = decodeSave(raw);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.game).toEqual(g);
    const bad = structuredClone(g);
    bad.buildings[0].origin.y = 1;
    expect(decodeSave(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe('vertical infrastructure', () => {
  it('cuts elevator access on actual power loss, recovers power, and accepts an alternate unpowered stair', () => {
    let g = emptyVertical();
    g = build(g, 'road', 0, -1);
    g = build(g, 'road', 1, -1);
    g = build(g, 'home', 2, -1);
    g = build(g, 'power', 1, 0);
    g = build(g, 'column', -1, -2);
    g = build(g, 'deck', -1, -2, 1, 'O');
    g = build(g, 'elevator', -1, -1);
    g = build(g, 'verticalRelay', 0, -2);
    g = build(g, 'home', -1, -2, 1);
    const homes = g.buildings.filter((b) => b.kind === 'home'),
      upper = homes.find((b) => b.y === 1)!,
      power = g.buildings.find((b) => b.kind === 'power')!,
      elevator = g.buildings.find((b) => b.kind === 'elevator')!;
    g = {
      ...g,
      population: 10,
      city: {
        ...g.city,
        enabled: true,
        residents: Object.fromEntries(homes.map((b) => [b.id, 5])),
        displaced: 0,
      },
    };
    expect(operatingNetwork(g).network.powerRatios.get(elevator.id)).toBe(1);
    expect(operatingNetwork(g).network.connectedIds.has(upper.id)).toBe(true);
    const off = {
      ...g,
      buildings: g.buildings.map((b) => (b.id === power.id ? { ...b, enabled: false } : b)),
    };
    expect(operatingNetwork(off).network.powerRatios.get(elevator.id)).toBe(0);
    expect(operatingNetwork(off).network.connectedIds.has(upper.id)).toBe(false);
    expect(
      operatingNetwork({ ...off, buildings: g.buildings }).network.connectedIds.has(upper.id),
    ).toBe(true);
    const relay = off.buildings.find((b) => b.kind === 'verticalRelay')!;
    const stairs = build(
      demolish(off, { type: 'building', id: String(relay.id) }),
      'stairs',
      0,
      -2,
    );
    expect(operatingNetwork(stairs).network.connectedIds.has(upper.id)).toBe(true);
    expect(decodeSave(JSON.stringify(stairs)).ok).toBe(true);
  });
  it('a real bridge adds structural, pedestrian and electrical edges and removes them when broken', () => {
    let g = emptyVertical();
    for (const x of [-2, 1]) {
      g = build(g, 'column', x, -2);
      g = build(g, 'deck', x, -2, 1, 'D', 1);
      g = build(g, 'road', x, -1, 1);
    }
    const left = g.buildings.find((b) => b.kind === 'road' && b.origin.x === -2)!,
      right = g.buildings.find((b) => b.kind === 'road' && b.origin.x === 1)!;
    const before = operatingNetwork(g);
    expect(before.road.attachments.get(left.id)).not.toBe(before.road.attachments.get(right.id));
    const mass = analyze(g).mass;
    g = build(g, 'bridge', -2, -2, 1);
    expect(analyze(g).mass - mass).toBeCloseTo(12);
    const linked = operatingNetwork(g);
    expect(linked.road.attachments.get(left.id)).toBe(linked.road.attachments.get(right.id));
    expect(linked.grid.attachments.get(left.id)).toBe(linked.grid.attachments.get(right.id));
    const bridge = g.buildings.find((b) => b.kind === 'bridge')!;
    g = {
      ...g,
      buildings: g.buildings.map((b) => (b.id === bridge.id ? { ...b, durability: 0 } : b)),
    };
    expect(operatingNetwork(g).road.attachments.get(left.id)).not.toBe(
      operatingNetwork(g).road.attachments.get(right.id),
    );
  });
  it('suspension carries lower-deck mass in tension and lowers mass center without inventing lift', () => {
    let g = emptyVertical();
    g = build(g, 'platform', 3, -2);
    g = build(g, 'hanger', 3, -2);
    g = build(g, 'suspendedDeck', 3, -2, -1);
    const before = analyze(g);
    g = build(g, 'factory', 3, -2, -1);
    const after = analyze(g);
    expect(after.mass - before.mass).toBeCloseTo(BLOCKS.factory.mass);
    expect(after.center.y).toBeLessThan(before.center.y ?? 0);
    expect(after.lift).toBe(before.lift);
    expect(after.structural.edges.get(edgeKey('3,-2', '3,-1,-2'))!.load).toBeGreaterThan(0);
    expect(decodeSave(JSON.stringify(g)).ok).toBe(true);
  });
});
