import { rebuild } from '../game/disasters/recovery';
import { setPolicy } from '../game/disasters/manager';
import { describe, expect, it } from 'vitest';
import { BLOCKS, DEFAULT_SETTINGS } from '../data/rules';
import { loadStage } from '../game/campaign/loader';
import { advanceDialogue } from '../game/campaign/runtime';
import { place, tick } from '../game/engine';
import { validatePlacement } from '../game/placement';
import { analyze } from '../game/analysis';
import { reinforce } from '../game/repair/maintenance';
import { distance3 } from '../game/disasters/effects';
import { decodeCampaignGame } from '../game/campaign/storage';
import { metrics, campaignGoals } from '../game/campaign/objectives';
import type { Game, Kind } from '../types/game';
function build(g: Game, kind: Kind, target = g.disaster!.threat?.target): Game {
  let best: Game | null = null,
    value = -Infinity;
  for (const p of g.platforms.filter((p) => p.y === 0)) {
    const candidate = {
      ...g,
      active: { kind, shape: BLOCKS[kind].shapes[0], rotation: 0 },
      reservedActive: g.active,
      cursor: { x: p.x, y: p.y, z: p.z },
    };
    if (!validatePlacement(candidate).valid) continue;
    const next = place(candidate),
      a = analyze(next);
    if (!a.connectedIds.has(next.nextId - 1) || (a.powerRatios.get(next.nextId - 1) ?? 0) < 0.99)
      continue;
    const score =
      a.stability -
      (a.structural.critical ? 100 : 0) -
      (target && ['shieldSmall', 'shieldLarge', 'repairCenter', 'stabilizer'].includes(kind)
        ? distance3(p, target) * 6
        : 0);
    if (score > value) {
      best = next;
      value = score;
    }
  }
  expect(best, 'No paid plot for ' + kind).not.toBeNull();
  return best!;
}
export function solveDisasterStage(id: number) {
  let g = advanceDialogue(loadStage(id, DEFAULT_SETTINGS), true);
  const kinds: Record<number, Kind[]> = {
    21: ['weatherStation', 'windbreak', 'reinforcedWindbreak'],
    22: ['shieldLarge'],
    23: ['stabilizer'],
    24: ['repairCenter'],
    25: ['shelter', 'shelter', 'shieldLarge', 'emergencyBattery', 'stabilizer'],
  };
  if (id === 24) {
    g = setPolicy(g, 'recovery');
    for (const b of g.disaster!.blueprints) g = rebuild(g, b.id);
  }
  for (const kind of kinds[id]) g = build(g, kind);
  if (id === 21 || id === 25) {
    const n = [...analyze(g).structural.nodes.values()]
      .filter((n) => n.platform.reinforcement < 3)
      .sort((a, b) => b.ratio - a.ratio)[0];
    g = reinforce(g, { type: 'platform', id: n.key });
  }
  for (let i = 0; i < 240 * 4 && !g.won && !g.structure.loss && !g.campaign?.failed; i++)
    g = tick(g, 0.25);
  return g;
}
describe('Chapter 5 paid construction and survival', () => {
  for (const id of [21, 22, 23, 24, 25])
    it(
      'wins stage ' + id,
      () => {
        const g = solveDisasterStage(id);
        const diagnostic = {
          stage: id,
          elapsed: g.elapsed,
          loss: g.structure.loss,
          failed: g.campaign?.failed,
          goals: campaignGoals(g),
          metrics: metrics(g),
          report: g.disaster?.reports.at(-1),
        };
        expect(g.won, JSON.stringify(diagnostic)).toBe(true);
        expect(() => decodeCampaignGame(g)).not.toThrow();
      },
      180000,
    );
});
