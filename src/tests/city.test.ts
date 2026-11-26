import { repair } from '../game/repair/maintenance';
import { describe, it, expect } from 'vitest';
import { newGame, tick } from '../game/engine';
import { analyze } from '../game/analysis';
import { decodeSave } from '../game/storage';
import { setOperation } from '../game/city/actions';
import { DEFAULT_SETTINGS } from '../data/rules';
describe('Living City', () => {
  it('initializes every city scenario with valid geometry and save data', () => {
    for (const id of [5, 6, 7, 8, 9] as const) {
      const g = newGame('mission', 123, DEFAULT_SETTINGS, id),
        s = analyze(g);

      expect(decodeSave(JSON.stringify(g)).ok).toBe(true);
      expect(s.mass).toBeGreaterThan(0);
    }
  });
  it('runs restored scenarios without spontaneous collapse', () => {
    for (const id of [5, 6, 7, 8, 9] as const) {
      let g = newGame('mission', 123, DEFAULT_SETTINGS, id);
      for (const b of g.buildings) if (!b.enabled) g = setOperation(g, b.id, { enabled: true });
      for (const [edge, state] of Object.entries(g.structure.edges))
        if (state.durability < 100) g = repair(g, { type: 'edge', id: edge });
      g = { ...g, mode: 'citylab', labPaused: false };
      for (let i = 0; i < 160; i++) g = tick(g, 0.25);

      expect(g.structure.loss).toBeNull();
      expect(g.structure.collapsedCount).toBe(0);
    }
  }, 30000);
});
