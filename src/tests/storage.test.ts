import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGame, loadSettings, saveGame, saveSettings } from '../game/storage';
import { newGame } from '../game/engine';
import { DEFAULT_SETTINGS } from '../data/rules';
afterEach(() => vi.unstubAllGlobals());
describe('storage environment failures', () => {
  it('reports quota/access failures without throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw Error('blocked');
      },
      setItem: () => {
        throw Error('quota');
      },
    });
    expect(loadGame()).toEqual({ ok: false, reason: 'unavailable' });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(saveGame(newGame())).toBe(false);
    expect(saveSettings(DEFAULT_SETTINGS)).toBe(false);
  });
  it('validates settings separately and falls back on damaged settings', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{"language":"invalid"}' });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ ...DEFAULT_SETTINGS, language: 'en', sound: false }),
    });
    expect(loadSettings().language).toBe('en');
    expect(loadSettings().sound).toBe(false);
  });
});
