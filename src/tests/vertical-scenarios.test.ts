import { describe, it, expect } from 'vitest';
import { verticalExample } from '../game/vertical/scenarios';
import { DEFAULT_SETTINGS } from '../data/rules';
import { decodeSave } from '../game/storage';
import { loadStage } from '../game/campaign/loader';
describe('vertical scenario integrity', () => {
  for (const example of ['A', 'B', 'C', 'D', 'E'] as const)
    it('round trips lab ' + example, () => {
      const g = verticalExample(DEFAULT_SETTINGS, example);
      expect(decodeSave(JSON.stringify(g)).ok).toBe(true);
    });
  for (const id of [16, 17, 18, 19, 20])
    it('loads stage ' + id, () => {
      const g = loadStage(id, DEFAULT_SETTINGS);
      expect(decodeSave(JSON.stringify(g)).ok).toBe(true);
    });
});
