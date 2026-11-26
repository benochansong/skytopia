import type { Game, Kind } from '../types/game';
import { BLOCKS } from '../data/rules';
import { analyze } from '../game/analysis';
import { cityReport } from '../game/city/report';
import { validatePlacement } from '../game/placement';
import { projectPlacement } from '../game/building';
import { place, tick } from '../game/engine';
export function runCity(g: Game, seconds: number) {
  for (let i = 0; i < seconds * 4; i++) g = tick(g, 0.25);
  return g;
}
// Feed a known random block, but use the production placement/cost/queue path.
export function bestBuild(
  g: Game,
  kind: Kind,
  metric: (g: Game) => number = (g) => analyze(g).stability,
): Game {
  const piece = { kind, shape: BLOCKS[kind].shapes[0], rotation: 0 };
  let best: Game | null = null,
    score = -Infinity;
  for (const p of g.platforms) {
    const candidate = { ...g, active: piece, cursor: { x: p.x, z: p.z } };
    if (!validatePlacement(candidate, piece, candidate.cursor, false).valid) continue;
    const projected = projectPlacement(candidate),
      report = cityReport(projected);
    if (
      g.city.enabled
        ? !report.operations.get(g.nextId)?.road
        : !analyze(projected).connectedIds.has(g.nextId)
    )
      continue;
    const value = metric(projected);
    if (value > score) {
      score = value;
      best = candidate;
    }
  }
  if (!best) throw Error('No legal plot for ' + kind);
  return place(best);
}
