import type { Game } from '../../types/game';
import { facility, CITY_RULES } from '../../data/cityRules';
import { cityReport } from './report';
import { networks } from './networks';
import { analyze } from '../analysis';
// Residents remain people after housing collapses. Shelter and departure have their own clocks.
export function reconcileResidents(g: Game): Game {
  const homes = g.buildings.filter((b) => facility(b).capacity > 0),
    residents: Record<string, number> = {};
  let assigned = 0;
  for (const b of homes) {
    residents[b.id] = Math.min(facility(b).capacity, g.city.residents[b.id] ?? 0);
    assigned += residents[b.id];
  }
  let displaced = Math.max(0, g.population - assigned);
  const road = networks(g).road;
  for (const b of homes) {
    if (!road.attachments.has(b.id)) continue;
    const add = Math.min(displaced, facility(b).capacity - residents[b.id]);
    residents[b.id] += add;
    displaced -= add;
  }
  return { ...g, city: { ...g.city, residents, displaced } };
}
export function populationStep(g: Game): Game {
  let next = reconcileResidents(g);
  const r = cityReport(next),
    s = analyze(next),
    bad =
      next.city.grace <= 0 &&
      (next.city.hungerTime > CITY_RULES.starvationGrace ||
        next.city.blackoutTime > CITY_RULES.departureGrace ||
        next.city.distressTime > CITY_RULES.departureGrace ||
        next.city.shelterTime > CITY_RULES.shelterGrace);
  const target = r.happinessTarget,
    happiness = Math.max(
      0,
      Math.min(
        100,
        next.city.happiness + Math.max(-3, Math.min(3, (target - next.city.happiness) * 0.18)),
      ),
    );
  let delta = 0;
  if (bad)
    delta = -Math.min(
      next.population,
      Math.max(1, next.population * 0.025) *
        (r.operations.size &&
        [...r.operations.values()].some((o) => o.kind === 'clinic' && o.efficiency > 0.5)
          ? 0.65
          : 1),
    );
  else if (
    next.population < 2 &&
    r.stocks.food >= 10 &&
    r.housing > next.population &&
    s.stability >= 65
  )
    delta = Math.min(2 - next.population, r.housing - next.population);
  else if (
    happiness >= 55 &&
    next.city.hungerTime === 0 &&
    r.deficit < 0.1 &&
    s.stability >= 65 &&
    next.city.displaced < 0.1
  )
    delta = Math.min(
      (CITY_RULES.growthPerStep * (0.5 + happiness / 100) * s.stability) / 100,
      Math.max(0, r.availableHousing - next.population),
    );
  const residents = { ...next.city.residents };
  let displaced = next.city.displaced,
    left = Math.abs(delta);
  if (delta < 0) {
    const sheltered = Math.min(displaced, left);
    displaced -= sheltered;
    left -= sheltered;
    for (const id of Object.keys(residents).sort()) {
      const remove = Math.min(left, residents[id]);
      residents[id] -= remove;
      left -= remove;
    }
  } else
    for (const b of next.buildings) {
      const o = r.operations.get(b.id);
      if (
        !o?.road ||
        (o.demand > 0 && o.powerGrid === null) ||
        (o.status === 'power' && next.population >= 2) ||
        !b.enabled
      )
        continue;
      const free = Math.max(0, facility(b).capacity - (residents[b.id] ?? 0)),
        add = Math.min(free, left);
      if (add > 0) residents[b.id] = (residents[b.id] ?? 0) + add;
      left -= add;
    }
  const actual = delta < 0 ? delta : delta - left;
  next = {
    ...next,
    population: Math.max(0, next.population + actual),
    city: {
      ...next.city,
      residents,
      displaced,
      happiness,
      arrivals: next.city.arrivals + Math.max(0, actual),
      departures: next.city.departures + Math.max(0, -actual),
    },
  };
  return next;
}
