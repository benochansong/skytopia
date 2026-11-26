import { it, expect } from 'vitest';
import { newGame } from '../game/engine';
import { DEFAULT_SETTINGS } from '../data/rules';
import { setOperation } from '../game/city/actions';
import { repair } from '../game/repair/maintenance';
import { analyze, objectives } from '../game/analysis';
import { cityReport } from '../game/city/report';
import { bestBuild, runCity } from './city-helpers';
for (const id of [5, 6, 7, 8, 9] as const)
  it(`Mission ${id} has a playable recovery and victory path`, () => {
    let g = newGame('mission', 123, DEFAULT_SETTINGS, id);
    for (const b of g.buildings) if (!b.enabled) g = setOperation(g, b.id, { enabled: true });
    for (const [edge, state] of Object.entries(g.structure.edges))
      if (state.durability < 100) g = repair(g, { type: 'edge', id: edge });
    if (id === 6) g = bestBuild(g, 'power');
    if (id === 5) {
      g = bestBuild(g, 'farm');
      g = bestBuild(g, 'apartment');
    }
    if (id === 8 || id === 9) {
      if (id === 9) g = repair(g, { type: 'platform', id: '-2,0' });
      g = bestBuild(g, 'liftSmall');
      if (id === 8)
        for (let i = 0; i < 5; i++)
          g = bestBuild(
            g,
            'park',
            (g) => cityReport(g).happinessTarget + analyze(g).stability * 0.2,
          );
    }
    g = { ...g, cursor: { x: 0, z: 0 } };
    g = runCity(g, 140);
    console.log('solution', id, {
      goals: objectives(g),
      population: g.population,
      happiness: g.city.happiness,
      target: cityReport(g).happinessTarget,
      stability: analyze(g).stability,
      loss: g.structure.loss,
      credits: g.city.credits,
    });
    expect(g.structure.loss).toBeNull();
    expect(objectives(g)).toEqual([true, true, true, true, true]);
    expect(g.won).toBe(true);
    expect(g.city.missionRewarded).toBe(true);
  }, 60000);
