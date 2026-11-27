import type { Game } from '../types/game';
import { analyze } from './analysis';
export type BuildFeedback = 'connection' | 'power' | 'balance' | 'expansion' | 'built';
/** Acknowledges actual improvements; never grants currency or changes scores. */
export function buildFeedback(before: Game, after: Game): BuildFeedback {
  const a = analyze(before),
    b = analyze(after);
  if (a.power < a.demand && b.power >= b.demand) return 'power';
  if (b.disconnected < a.disconnected) return 'connection';
  if (b.stability > a.stability + 5) return 'balance';
  if (after.platforms.length > before.platforms.length) return 'expansion';
  return 'built';
}

/** Undo is legal only before any simulation or other mutation. Cursor/view changes are harmless. */
export function canUndo(current: Game, placed: Game): boolean {
  const { cursor: _c, active: _a, settings: _s, vertical: v, ...rest } = current;
  const { cursor: _pc, active: _pa, settings: _ps, vertical: pv, ...prev } = placed;
  return (
    JSON.stringify(rest) === JSON.stringify(prev) &&
    JSON.stringify(v && { ...v, floor: 0, view: 'all' }) ===
      JSON.stringify(pv && { ...pv, floor: 0, view: 'all' }) &&
    current.active.kind === placed.active.kind &&
    current.active.shape === placed.active.shape
  );
}
