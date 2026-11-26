import type { Game, Kind } from '../types/game';
import { loadStage } from '../game/campaign/loader';
import { DEFAULT_SETTINGS, BLOCKS } from '../data/rules';
import { advanceDialogue } from '../game/campaign/runtime';
import { place, tick } from '../game/engine';
import { validatePlacement } from '../game/placement';
import { bestBuild } from './city-helpers';
import { repair, reinforce } from '../game/repair/maintenance';
import { setOperation } from '../game/city/actions';
import { analyze } from '../game/analysis';
import { cityReport } from '../game/city/report';
export function buildAt(
  g: Game,
  kind: Kind,
  x: number,
  z: number,
  shape = BLOCKS[kind].shapes[0],
): Game {
  const candidate = { ...g, active: { kind, shape, rotation: 0 }, cursor: { x, z } };
  const v = validatePlacement(candidate);
  if (!v.valid) throw Error(kind + ' ' + x + ',' + z + ' ' + v.reason);
  return place(candidate);
}
export function runCampaign(g: Game, seconds: number) {
  g = { ...g, cursor: { x: 0, z: 0 } };
  for (let i = 0; i < seconds * 4 && !g.campaign?.result && !g.campaign?.failed; i++) {
    if (g.campaign?.dialogue) g = advanceDialogue(g, true);
    g = tick(g, 0.25);
  }
  return g;
}
export function solveCampaign(id: number) {
  let g = advanceDialogue(loadStage(id, DEFAULT_SETTINGS), true);
  if (id === 1 || id === 101) {
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [2, -1],
      [1, 0],
      [1, -3],
    ]) {
      const kind = g.active.kind;
      g = buildAt(g, kind, x, z);
    }
  }
  if (id === 2) {
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ])
      g = buildAt(g, 'road', x, z);
    for (let i = 0; i < 5; i++) g = bestBuild(g, 'home');
    g = bestBuild(g, 'power');
  }
  if (id === 3) {
    for (const [x, z] of [
      [-6, -3],
      [-6, -2],
      [3, -3],
      [3, -2],
    ])
      g = buildAt(g, 'platform', x, z, 'I');
    for (const [x, z] of [
      [-1, -1],
      [-2, -1],
      [-3, -1],
      [-3, -2],
      [-4, -2],
    ])
      g = buildAt(g, 'road', x, z);
    g = buildAt(g, 'home', -4, -3);
  }
  if (id === 4) g = bestBuild(g, 'farm');
  if (id === 5) {
    g = bestBuild(g, 'farm');
    g = bestBuild(g, 'farm');
    g = bestBuild(g, 'power');
    g = bestBuild(g, 'liftSmall');
    g = bestBuild(g, 'largeHome');
    g = bestBuild(g, 'largeHome');
  }
  if (id === 6) {
    for (const [x, z] of [
      [-1, 0],
      [-1, -1],
      [1, -1],
      [0, 1],
      [-1, -3],
      [2, -1],
    ])
      g = buildAt(g, 'road', x, z);
    for (const [x, z] of [
      [-3, 0],
      [1, 0],
      [-3, -3],
      [2, -3],
    ])
      g = buildAt(g, 'largeHome', x, z);
    for (const [x, z] of [
      [-4, 3],
      [-1, 3],
    ])
      g = buildAt(g, 'platform', x, z, 'I');
    for (const [x, z] of [
      [-1, 1],
      [0, 2],
      [-1, 2],
    ])
      g = buildAt(g, 'road', x, z);
    g = bestBuild(g, 'power');
    g = bestBuild(g, 'power');
    for (let i = 0; i < 3; i++) g = bestBuild(g, 'liftSmall');
  }
  if (id === 7) {
    for (const [x, z] of [
      [3, 0],
      [4, 0],
      [2, 0],
      [2, -2],
    ])
      g = buildAt(g, 'liftSmall', x, z);
    g = buildAt(g, 'power', 1, 0);
    g = reinforce(g, { type: 'edge', id: '2,0|3,0' });
  }
  if ([8, 9, 102].includes(id)) {
    g = repair(g, { type: 'platform', id: '3,0' });
    for (const id of Object.keys(g.structure.edges)) g = reinforce(g, { type: 'edge', id });
    for (const b of g.buildings)
      if (b.durability < 100) g = repair(g, { type: 'building', id: String(b.id) });
    g = buildAt(g, 'power', -1, -1);
    g = buildAt(g, 'liftSmall', 2, -1);
    g = buildAt(g, 'platform', 3, -1);
    g = buildAt(g, 'platform', 4, -1);
    g = buildAt(g, 'liftSmall', 4, -1);
    g = bestBuild(g, 'liftSmall');
  }
  if ((id >= 10 && id <= 15) || id === 103) {
    for (const b of g.buildings) if (!b.enabled) g = setOperation(g, b.id, { enabled: true });
    for (const [edge, state] of Object.entries(g.structure.edges))
      if (state.durability < 100) g = repair(g, { type: 'edge', id: edge });
  }
  if (id === 10) {
    g = bestBuild(g, 'liftSmall');
    g = bestBuild(g, 'liftSmall');
  }
  if (id === 11) g = bestBuild(g, 'power');
  if (id === 12 || id === 103) g = bestBuild(g, 'workshop');
  if (id === 13) {
    g = bestBuild(g, 'apartment');
    g = bestBuild(g, 'liftSmall');
    for (let i = 0; i < 8; i++)
      g = bestBuild(g, 'park', (g) => cityReport(g).happinessTarget + analyze(g).stability * 0.2);
  }
  if (id === 14) {
    g = repair(g, { type: 'platform', id: '-2,0' });
    g = bestBuild(g, 'liftSmall');
  }
  if (id === 15) {
    g = bestBuild(g, 'liftLarge');
    for (let i = 0; i < 8; i++)
      g = bestBuild(g, 'park', (g) => cityReport(g).happinessTarget + analyze(g).stability * 0.3);
  }
  if (id === 15)
    for (let i = 0; i < 20; i++) {
      const w = analyze(g).structural.worst;
      if (!w || w.ratio < 0.9) break;
      const next = reinforce(g, { type: w.type, id: w.id });
      if (next === g) break;
      g = next;
    }
  if (id === 15)
    for (let i = 0; i < 4 && analyze(g).stability < 87; i++) g = bestBuild(g, 'liftSmall');
  return runCampaign(g, 360);
}
