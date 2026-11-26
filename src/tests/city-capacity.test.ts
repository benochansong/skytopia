import { it, expect } from 'vitest';
import { metropolisFixture } from './city-fixture';
import { cityReport } from '../game/city/report';
import { analyze } from '../game/analysis';
import { economyStep } from '../game/city/simulation';
import { decodeSave } from '../game/storage';
import { runCity } from './city-helpers';
it('the 16×16 board sustains 600 inhabitants and tier six', () => {
  let g = metropolisFixture();
  const r = cityReport(g),
    s = analyze(g);
  expect(r.housing).toBeGreaterThanOrEqual(600);
  expect(r.deficit).toBe(0);
  expect(r.foodProduction).toBeGreaterThan(r.foodConsumption);
  expect(s.stability).toBeGreaterThanOrEqual(70);
  expect(s.structural.critical).toBeNull();
  expect(r.tierEligible).toBe(6);
  expect(decodeSave(JSON.stringify(g)).ok).toBe(true);
  g = economyStep(g);
  expect(g.city.tier).toBe(6);
  const credits = g.city.credits;
  g = economyStep(g);
  expect(g.city.credits - credits).toBeLessThan(20);
  g = runCity({ ...g, labPaused: false }, 70);
  expect(g.structure.collapsedCount).toBe(0);
  expect(g.structure.loss).toBeNull();
  expect(g.population).toBeGreaterThanOrEqual(600);
}, 30000);
