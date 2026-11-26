import { describe, it, expect, vi, afterEach } from 'vitest';
import { DEFAULT_SETTINGS } from '../data/rules';
import { verticalBase } from '../game/vertical/scenarios';
import { freshDisaster, WAVE_TYPES } from '../game/disasters/state';
import { forecast } from '../game/disasters/scheduler';
import { disasterBefore, disasterAfter, claimWave } from '../game/disasters/manager';
import { decodeSave } from '../game/storage';
import { growthTarget, saveSurvivalBest, loadSurvivalBest } from '../game/disasters/survival';
import { recycle } from '../game/engine';
import type { Game } from '../types/game';
describe('survival progression boundaries', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('runs ten scheduled waves with saved impact IDs, growth gates, and single rewards', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    });
    // Scheduler integration deliberately isolates wave bookkeeping from city balance.
    let g: Game = {
      ...verticalBase(DEFAULT_SETTINGS),
      disaster: freshDisaster('survival'),
      population: 240,
      city: {
        ...verticalBase(DEFAULT_SETTINGS).city,
        residents: {},
        displaced: 240,
        unlimited: false,
      },
    };
    for (let wave = 1; wave <= 10; wave++) {
      g = forecast(g);
      expect(g.disaster!.threat!.kind).toBe(WAVE_TYPES[wave - 1]);
      const halfway = g.disaster!.threat!.warning + g.disaster!.threat!.duration / 2;
      for (let elapsed = 0; elapsed < halfway; elapsed += 0.25)
        g = disasterAfter(disasterBefore(g, 0.25));
      const decoded = decodeSave(JSON.stringify(g));
      expect(decoded.ok).toBe(true);
      if (decoded.ok) g = decoded.game;
      while (g.disaster!.phase !== 'recovery') g = disasterAfter(disasterBefore(g, 0.25));
      expect(g.disaster!.stats.completedWaves).toBe(wave);
      expect(g.disaster!.reward).toBe(wave);
      const blocked = { ...g, population: growthTarget(g) - 1 };
      expect(claimWave(blocked, 'growth')).toBe(blocked);
      g = claimWave(g, 'growth');
      expect(g.disaster!.wave).toBe(wave + 1);
      expect(claimWave(g, 'growth')).toBe(g);
      expect(saveSurvivalBest(g)).toBe(true);
    }
    expect(g.disaster!.reports).toHaveLength(10);
    expect(g.disaster!.claimed).toHaveLength(10);
    expect(loadSurvivalBest()!.wave).toBe(10);
  }, 60000);
  it('survival retains normal block supply when recycling', () => {
    const initial = verticalBase(DEFAULT_SETTINGS),
      g = {
        ...initial,
        disaster: freshDisaster('survival'),
        city: { ...initial.city, unlimited: false },
      };
    const next = recycle(g);
    expect(next.supply.draws).toBe(g.supply.draws + 1);
    expect(next.active).toEqual(g.next[0]);
  });
});
