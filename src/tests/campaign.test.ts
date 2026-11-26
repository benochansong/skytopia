import { describe, it, expect } from 'vitest';
import { allStages, stage } from '../game/campaign/definitions';
import { loadStage } from '../game/campaign/loader';
import { DEFAULT_SETTINGS } from '../data/rules';
import { decodeCampaignGame } from '../game/campaign/storage';
import { key } from '../game/grid';
import { volume } from '../game/vertical/geometry';
import { tick } from '../game/engine';
import { advanceDialogue } from '../game/campaign/runtime';
describe('Sky Campaign data and safety', () => {
  it('loads 20 stages and three fixed challenges with valid cities, supply and bilingual content', () => {
    expect(new Set(allStages.map((s) => s.id)).size).toBe(23);
    for (const d of allStages) {
      const g = loadStage(d.id, DEFAULT_SETTINGS);
      const occupied = g.buildings.flatMap((b) => volume(b, b.origin).map(key));
      expect(new Set(occupied).size, d.id + ' overlap').toBe(occupied.length);
      expect(() => decodeCampaignGame(g), d.id + ' save').not.toThrow();
      expect(d.title.ko).toBeTruthy();
      expect(d.title.en).toBeTruthy();
      expect(
        d.script.every((k) => d.allowed.includes(k)),
        d.id + ' unlock',
      ).toBe(true);
      expect(g.campaign?.result).toBeNull();
      if (d.next) expect(stage(d.next)).toBeTruthy();
    }
  }, 30000);
  it('all difficulty presets start with valid physical stock and mission state', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const)
      for (const id of [1, 4, 5, 8, 11, 14, 15, 16, 17, 18, 19, 20])
        expect(() =>
          decodeCampaignGame(loadStage(id, { ...DEFAULT_SETTINGS, difficulty })),
        ).not.toThrow();
  }, 30000);
  it('pauses simulation in dialogue and starts after skip', () => {
    const g = loadStage(1, DEFAULT_SETTINGS);
    expect(tick(g, 1)).toBe(g);
    expect(tick(advanceDialogue(g, true), 1).elapsed).toBe(1);
  });
});
