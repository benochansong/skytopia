import { z } from 'zod';
import type { Game } from '../../types/game';
const record = z.object({
  score: z.number().finite().nonnegative(),
  wave: z.number().int().nonnegative(),
  population: z.number().finite().nonnegative(),
  time: z.number().finite().nonnegative(),
  seed: z.number().int().min(0).max(4294967295),
  difficulty: z.enum(['easy', 'normal', 'hard']),
});
export const SURVIVAL_BEST_KEY = 'skytopia.survival.best.v1';
export function loadSurvivalBest() {
  try {
    const result = record.safeParse(JSON.parse(localStorage.getItem(SURVIVAL_BEST_KEY) ?? 'null'));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function saveSurvivalBest(g: Game) {
  const d = g.disaster;
  if (d?.mode !== 'survival') return true;
  const next = {
    score: d.score,
    wave: d.stats.completedWaves,
    population: d.stats.peakPopulation,
    time: g.elapsed,
    seed: d.initialSeed,
    difficulty: g.difficulty,
  };
  try {
    const old = loadSurvivalBest();
    if (!old || next.score > old.score)
      localStorage.setItem(SURVIVAL_BEST_KEY, JSON.stringify(record.parse(next)));
    return true;
  } catch {
    return false;
  }
}
export function growthTarget(g: Game) {
  return g.disaster?.mode === 'survival'
    ? Math.min(240, 130 + Math.max(0, g.disaster.wave - 1) * 10)
    : 0;
}
