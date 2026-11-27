import { describe, it, expect } from 'vitest';
import { KeyRepeater, assistedCursor } from '../game/controls';
import { newGame, place, recycle, tick } from '../game/engine';
import { validatePlacement } from '../game/placement';
import { canUndo, buildFeedback } from '../game/playFeedback';
import { settingsSchema, decodeSave } from '../game/storage';
import { DEFAULT_SETTINGS } from '../data/rules';
import { execute, newHand, onlineCity } from '../game/online/match';
import type { Game } from '../types/game';
import { createWorld } from '../game/world/state';

describe('gameplay polish', () => {
  it('key repeat has deterministic delay, no native duplicate, no catch-up bursts and clears on release', () => {
    const r = new KeyRepeater();
    expect(r.press('KeyD', 0, 260)).toBe(true);
    expect(r.press('KeyD', 60, 260)).toBe(false);
    expect(r.poll(259, 90)).toEqual([]);
    expect(r.poll(260, 90)).toEqual(['KeyD']);
    expect(r.poll(2000, 90)).toEqual(['KeyD']);
    expect(r.poll(2000, 90)).toEqual([]);
    r.release('KeyD');
    expect(r.poll(4000, 90)).toEqual([]);
    r.press('KeyA', 0, 260);
    r.clear();
    expect(r.poll(4000, 90)).toEqual([]);
  });
  it('snap preserves a valid requested cell and only finds legal one-cell neighbors on the same floor', () => {
    const g: Game = { ...newGame(), active: { kind: 'home', shape: 'single', rotation: 0 } };
    const exact = { x: -1, z: -1 };
    expect(assistedCursor(g, exact)).toEqual(exact);
    let corrected = 0;
    for (let x = -4; x < 4; x++)
      for (let z = -4; z < 4; z++) {
        const c = { x, z },
          found = assistedCursor(g, c);
        expect(Math.abs(found.x - x) + Math.abs(found.z - z)).toBeLessThanOrEqual(1);
        expect(found.y).toBeUndefined();
        if (found.x !== x || found.z !== z) {
          expect(validatePlacement({ ...g, cursor: found }).valid).toBe(true);
          corrected++;
        }
      }
    expect(corrected).toBeGreaterThan(0);
    expect(assistedCursor(g, { x: 7, y: 3, z: 7 })).toEqual({ x: 7, y: 3, z: 7 });
  });
  it('manual recycle cannot farm resources or supply in a tight loop, including after reload', () => {
    let g = recycle(newGame());
    const first = g;
    for (let i = 0; i < 100; i++) g = recycle(g);
    expect(g).toBe(first);
    const saved = decodeSave(JSON.stringify(g));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(recycle(saved.game)).toBe(saved.game);
    const later = recycle({ ...g, elapsed: 3 });
    expect(later.supply.draws).toBe(g.supply.draws + 1);
  });
  it('online recycle uses authoritative elapsed time and survives hold without reset', () => {
    const g = onlineCity(42, false),
      h = newHand(42);
    const first = execute(g, h, { type: 'recycle', hand: h.token }, true, false);
    const denied = execute(g, first.hand, { type: 'recycle', hand: first.hand.token }, true, false);
    expect(denied.error).toBe('recycleCooldown');
    expect(denied.game).toBe(g);
    expect(denied.hand).toBe(first.hand);
    const held = execute(g, first.hand, { type: 'hold', hand: first.hand.token }, true, false);
    expect(held.hand.recycleAt).toBe(3);
    expect(
      execute(
        { ...g, elapsed: 3 },
        held.hand,
        { type: 'recycle', hand: held.hand.token },
        true,
        false,
      ).error,
    ).toBeUndefined();
  });
  it('critical legal preview is recycled on timeout instead of auto-building into a known hazard', () => {
    let g = newGame();
    g = {
      ...g,
      structure: { ...g.structure, coreDurability: 1 },
      active: { kind: 'home', shape: 'single', rotation: 0 },
      cursor: { x: -1, z: -1 },
      remaining: 0.01,
    };
    expect(validatePlacement(g).valid).toBe(true);
    expect(validatePlacement(g).risk).toBeGreaterThanOrEqual(2);
    const next = tick(g, 0.25);
    expect(next.nextId).toBe(g.nextId);
    expect(next.active).toEqual(g.next[0]);
  });
  it('world timer expiry also refuses a critical legal placement', () => {
    let g = createWorld(newGame(), 71, { blockTime: 20, disasters: 0 });
    g = {
      ...g,
      world: { ...g.world!, view: 'city' },
      structure: { ...g.structure, coreDurability: 1 },
      remaining: 0.01,
      active: { kind: 'home', shape: 'single', rotation: 0 },
      cursor: { x: -1, z: -1, y: 0 },
    };
    expect(validatePlacement(g).valid).toBe(true);
    expect(validatePlacement(g).risk).toBeGreaterThanOrEqual(2);
    const next = tick(g, 0.25);
    expect(next.nextId).toBe(g.nextId);
    expect(next.remaining).toBe(20);
    expect(next.active).toEqual(g.next[0]);
  });
  it('undo rejects production/time/stock changes but permits moving the next preview', () => {
    const g: Game = {
      ...newGame(),
      active: { kind: 'home', shape: 'single', rotation: 0 },
      cursor: { x: -1, z: -1 },
    };
    const next = place(g);
    expect(canUndo({ ...next, cursor: { x: 2, z: 2 } }, next)).toBe(true);
    expect(canUndo({ ...next, elapsed: next.elapsed + 0.25 }, next)).toBe(false);
    expect(canUndo({ ...next, resources: next.resources + 1 }, next)).toBe(false);
    expect(buildFeedback(g, next)).toBe('built');
  });
  it('old settings and v5 saves get explicit controls defaults; unknown polish versions are rejected', () => {
    const legacy = { language: 'ko', sound: true, shadows: true, reducedMotion: false };
    expect(settingsSchema.parse(legacy).repeatDelay).toBe(260);
    expect(settingsSchema.safeParse({ ...legacy, repeatInterval: 0 }).success).toBe(false);
    const g = newGame();
    const result = decodeSave(JSON.stringify({ ...g, settings: legacy }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.game.settings.controlsVersion).toBe(1);
    expect(decodeSave(JSON.stringify({ ...g, polish: { version: 2, recycleAt: 0 } })).ok).toBe(
      false,
    );
    expect(settingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
  it('free classic supply advances and relaxed supply still respects real placement rules', () => {
    const g: Game = {
      ...newGame('citylab'),
      polish: { version: 1, recycleAt: 0, freeStyle: 'classic' },
    };
    expect(recycle(g).active).toEqual(g.next[0]);
    const relaxed: Game = { ...g, city: { ...g.city, unlimited: true }, cursor: { x: 0, z: 0 } };
    expect(place(relaxed)).toBe(relaxed);
  });
});
