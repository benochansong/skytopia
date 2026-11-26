import { metrics, goalMet } from '../game/campaign/objectives';
import { stage } from '../game/campaign/definitions';
import { analyze } from '../game/analysis';
import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, BLOCKS } from '../data/rules';
import { loadStage } from '../game/campaign/loader';
import { advanceDialogue } from '../game/campaign/runtime';
import { place } from '../game/engine';
import { validatePlacement } from '../game/placement';
import { reinforce } from '../game/repair/maintenance';
import { runCampaign } from './campaign-solutions';
import { bestBuild } from './city-helpers';
import type { Game, Kind, Shape } from '../types/game';
function build(
  g: Game,
  kind: Kind,
  x: number,
  z: number,
  y = 0,
  shape: Shape = BLOCKS[kind].shapes[0],
) {
  const next = { ...g, active: { kind, shape, rotation: 0 }, cursor: { x, z, y } };
  const v = validatePlacement(next);
  expect(v.valid, kind + ' ' + [x, y, z] + ' ' + v.reason).toBe(true);
  return place(next);
}
export function solveVertical(id: number) {
  let g = advanceDialogue(loadStage(id, DEFAULT_SETTINGS), true);
  if (id === 16) {
    g = build(g, 'column', -2, 1);
    g = build(g, 'deck', -2, 1, 1, 'O');
    g = build(g, 'stairs', -1, 1);
    g = build(g, 'verticalRelay', -2, 2);
    g = build(g, 'home', -1, 2, 1);
  }
  if (id === 17) {
    g = build(g, 'reinforcedColumn', -3, 1);
    g = build(g, 'reinforcedColumn', -3, 2);
    g = build(g, 'power', -2, 0);
    g = bestBuild(g, 'liftSmall');
    for (const e of analyze(g).structural.edges.values())
      if (e.ratio > 1) g = reinforce(g, { type: 'edge', id: e.key });
  }
  if (id === 18) {
    g = build(g, 'bridge', -2, 1, 1);
    g = build(g, 'roadBridge', -2, 2, 1);
  }
  if (id === 19) {
    g = build(g, 'cargoElevator', 4, 1, -1);
    g = build(g, 'power', 2, -2);
    g = bestBuild(g, 'power');
    g = build(g, 'hanger', 4, 2);
    g = bestBuild(g, 'liftSmall');
    for (const e of analyze(g).structural.edges.values())
      if (e.ratio > 1) g = reinforce(g, { type: 'edge', id: e.key });
  }
  if (id === 20) {
    g = build(g, 'skyGarden', -3, 1, 1);
    g = build(g, 'skyGarden', 2, 1, 1);
    g = reinforce(g, { type: 'edge', id: '-3,2|-4,2' });
    g = bestBuild(g, 'power');
    g = bestBuild(g, 'liftSmall');
    for (const n of analyze(g).structural.nodes.values())
      if (n.ratio > 1) g = reinforce(g, { type: 'platform', id: n.key });
  }
  g = runCampaign(g, id === 20 ? 220 : 70);
  return g;
}
describe('vertical campaign solutions', () => {
  it('requires the final city to be free of critical structural risk', () => {
    const g = loadStage(20, DEFAULT_SETTINGS);
    const values = metrics({ ...g, structure: { ...g.structure, coreDurability: 0 } });
    const safety = stage(20).goals.find((goal) => goal.metric === 'critical')!;
    expect(values.critical).toBe(1);
    expect(goalMet(safety, values)).toBe(false);
  });
  for (const id of [16, 17, 18, 19, 20])
    it(
      'wins stage ' + id + ' using paid placement and real simulation',
      () => {
        const g = solveVertical(id);
        expect(g.campaign?.failed).toBeNull();
        expect(g.campaign?.result).not.toBeNull();
      },
      120000,
    );
});
