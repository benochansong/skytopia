import { expect, it } from 'vitest';
import { loadStage } from '../game/campaign/loader';
import { advanceDialogue } from '../game/campaign/runtime';
import { DEFAULT_SETTINGS, BLOCKS } from '../data/rules';
import { tick, place } from '../game/engine';
import { validatePlacement } from '../game/placement';
import { analyze } from '../game/analysis';
import type { Game, Kind } from '../types/game';
import { availablePorts, buildShip, dispatch, createRoute } from '../game/world/logistics';
import { attachWorld, syncWorld, switchCity } from '../game/world/state';
import { specialize } from '../game/world/management';
import { startResearch } from '../game/world/research';
import { campaignGoals, metrics } from '../game/campaign/objectives';
import { decodeCampaignGame } from '../game/campaign/storage';
function run(g: Game, seconds: number) {
  for (let i = 0; i < seconds && !g.campaign?.result && !g.campaign?.failed; i++) g = tick(g, 1);
  return g;
}
function build(g: Game, kind: Kind) {
  let best: Game | null = null,
    score = -Infinity;
  for (const p of g.platforms.filter((p) => p.y === 0))
    for (let rotation = 0; rotation < (kind === 'explorationPort' ? 4 : 1); rotation++) {
      const draft = {
        ...g,
        active: { kind, shape: BLOCKS[kind].shapes[0], rotation },
        cursor: { x: p.x, y: 0, z: p.z },
        reservedActive: g.active,
      };
      if (!validatePlacement(draft).valid) continue;
      const next = place(draft),
        a = analyze(next);
      if (!a.connectedIds.has(next.nextId - 1) || (a.powerRatios.get(next.nextId - 1) ?? 0) < 0.99)
        continue;
      if (kind === 'explorationPort' && !availablePorts(next).some((b) => b.id === next.nextId - 1))
        continue;
      if (a.stability > score) {
        best = next;
        score = a.stability;
      }
    }
  expect(best, `No legal paid ${kind} plot`).not.toBeNull();
  return best!;
}
export function solveWorldStage(id: number) {
  let g = advanceDialogue(loadStage(id, DEFAULT_SETTINGS), true);
  if (id === 26) {
    g = build(g, 'explorationPort');
    g = buildShip(g, 'explorer');
    g = run(g, 26);
    const ship = g.world!.ships[0].id;
    for (const to of ['island-2', 'island-3', 'island-4']) {
      g = dispatch(g, { ship, to, task: 'explore' });
      expect(g.world!.ships[0].trip).not.toBeNull();
      g = run(g, 100);
    }
    g = { ...g, world: { ...g.world!, inspected: ['island-2'], colonyTarget: 'island-2' } };
  }
  if (id === 27) {
    const island = g.world!.islands.find((i) => i.ruins)!;
    g = dispatch(g, {
      ship: g.world!.ships[0].id,
      to: island.id,
      task: 'explore',
      artifact: 'recover',
    });
    g = startResearch(g, 'efficientFuel');
    g = run(g, 100);
    g = startResearch(g, 'advancedAether');
    expect(g.world!.research.active?.id).toBe('advancedAether');
    g = run(g, 60);
  }
  if (id === 28) {
    const ships = g.world!.ships;
    g = dispatch(g, { ship: ships[0].id, to: 'island-2', task: 'colonize' });
    g = dispatch(g, { ship: ships[1].id, to: 'island-3', task: 'colonize' });
    g = run(g, 55);
    expect(g.world!.cities).toHaveLength(3);
    const [a, b, c] = g.world!.cities;
    // Initial colony budgets are intentionally small; first paid deliveries finance specialization.
    for (const [ship, to, resource] of [
      [ships[2].id, b.id, 'food'],
      [ships[3].id, c.id, 'materials'],
    ] as const)
      g = createRoute(g, {
        ship,
        from: a.id,
        to,
        resource,
        amount: 80,
        reserve: 50,
        target: 250,
        interval: 15,
        priority: 1,
        enabled: true,
        allowRisk: false,
      });
    g = run(g, 55);
    // Capital already has a real economy; colonies specialize after earning their own credits.
    g = specialize(g, a.id, 'industry');
    g = specialize(g, c.id, 'agriculture');
    g = run(g, 60);
  }
  if (id === 29) {
    const rescue = g.world!.ships.filter((s) => s.type === 'rescue'),
      target = g.world!.cities[2].id;
    g = dispatch(g, { ship: rescue[0].id, to: target, task: 'rescue', cargo: { food: 50 } });
    g = dispatch(g, { ship: rescue[1].id, to: target, task: 'rescue', cargo: { materials: 50 } });
    g = attachWorld(g, {
      ...syncWorld(g),
      routes: g.world!.routes.map((r) => ({ ...r, enabled: true })),
    });
    g = run(g, 100);
  }
  if (id === 30) {
    g = startResearch(g, 'federation');
    g = run(g, 55);
    expect(g.world!.research.completed).toContain('federation');
    g = switchCity(g, g.world!.capital);
    g = build(g, 'nexus');
    g = { ...g, world: { ...g.world!, view: 'map' } };
    g = run(g, 35);
  }
  g = run(g, 20);
  return g;
}
for (const id of [26, 27, 28, 29, 30])
  it(`world mission ${id} wins through real construction, flights and research`, () => {
    const g = solveWorldStage(id);
    console.log('world mission', id, {
      clock: g.world!.clock,
      goals: campaignGoals(g),
      metrics: metrics(g),
      failure: g.campaign!.failed,
    });
    expect(g.campaign!.failed).toBeNull();
    expect(campaignGoals(g).every(Boolean)).toBe(true);
    expect(g.won).toBe(true);
    expect(g.campaign!.result).not.toBeNull();
    expect(() => decodeCampaignGame(g)).not.toThrow();
  }, 240000);
