import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../data/rules';
import { settingsSchema, decodeSave } from '../game/storage';
import { newGame } from '../game/engine';
import { qualityPatch } from '../scene/art';

describe('graphics settings compatibility and boundaries', () => {
  it('migrates previous preferences without turning motion or shadows back on', () => {
    const { graphicsVersion, quality, cloudDensity, ...old } = DEFAULT_SETTINGS;
    const parsed = settingsSchema.parse({
      ...old,
      shadows: false,
      reducedMotion: true,
      citizens: 0,
    });
    expect(parsed).toMatchObject({
      graphicsVersion: 1,
      quality: 'medium',
      cloudDensity: 0.7,
      shadows: false,
      reducedMotion: true,
      citizens: 0,
    });
    const game = newGame();
    const encoded = JSON.parse(JSON.stringify(game));
    encoded.settings = old;
    expect(decodeSave(JSON.stringify(encoded)).ok).toBe(true);
  });
  it('rejects unknown graphics version and nonfinite density', () => {
    for (const patch of [
      { graphicsVersion: 2 },
      { quality: 'extreme' },
      { cloudDensity: Infinity },
      { cloudDensity: -0.1 },
    ])
      expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...patch }).success).toBe(false);
  });
  it('quality changes leave accessibility and simulation preferences intact', () => {
    const original = {
      ...DEFAULT_SETTINGS,
      reducedMotion: true,
      reducedFlashes: true,
      cameraShake: 0,
      difficulty: 'hard' as const,
    };
    for (const quality of ['low', 'medium', 'high', 'ultra'] as const) {
      const next = settingsSchema.parse({ ...original, ...qualityPatch(quality) });
      expect(next).toMatchObject({
        quality,
        reducedMotion: true,
        reducedFlashes: true,
        cameraShake: 0,
        difficulty: 'hard',
      });
    }
  });
});
