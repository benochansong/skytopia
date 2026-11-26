import { DISASTER, facility } from '../../data/rules';
import type { Game } from '../../types/game';
import { operatingNetwork } from '../city/operations';
import { defenseReady, distance3 } from './effects';
import { analyze } from '../analysis';
import { key } from '../grid';
export function evacuate(g: Game): Game {
  const d = g.disaster;
  if (!d) return g;
  const net = operatingNetwork(g),
    risk = analyze(g).structural;
  const shelters = g.buildings.filter((b) => b.kind === 'shelter' && defenseReady(g, b));
  const evacuated = d.evacuated.map((e) => ({ ...e })),
    residents = { ...g.city.residents };
  let moved = 0;
  for (const home of g.buildings.filter((b) => facility(b).capacity > 0)) {
    const threatened =
      !!d.threat &&
      (distance3(home.origin, d.threat.target) <= 3 ||
        home.y > 0 ||
        ['cold', 'compound', 'aether'].includes(d.threat.kind));
    if (!threatened && (risk.nodes.get(key(home.origin))?.ratio ?? 0) <= 1) continue;
    const group = net.road.attachments.get(home.id);
    if (!group) continue;
    for (const shelter of shelters) {
      if (net.road.attachments.get(shelter.id) !== group) continue;
      const available =
        DISASTER.shelterCapacity -
        evacuated.filter((e) => e.shelter === shelter.id).reduce((n, e) => n + e.count, 0);
      const count = Math.max(0, Math.min(available, residents[home.id] ?? 0));
      if (!count) continue;
      const existing = evacuated.find((e) => e.home === home.id && e.shelter === shelter.id);
      if (existing) existing.count += count;
      else evacuated.push({ home: home.id, shelter: shelter.id, count });
      residents[home.id] -= count;
      moved += count;
    }
  }
  return {
    ...g,
    city: { ...g.city, residents },
    disaster: { ...d, evacuated, stats: { ...d.stats, evacuated: d.stats.evacuated + moved } },
  };
}
export function returnResidents(g: Game): Game {
  const d = g.disaster;
  if (!d || !d.evacuated.length || d.phase === 'active') return g;
  const net = operatingNetwork(g),
    residents = { ...g.city.residents };
  let displaced = g.city.displaced;
  const evacuated = d.evacuated.flatMap((e) => {
    const home = g.buildings.find((b) => b.id === e.home),
      shelter = g.buildings.find((b) => b.id === e.shelter);
    if (!home || !shelter) {
      displaced += e.count;
      return [];
    }
    if (
      !net.road.attachments.get(home.id) ||
      net.road.attachments.get(home.id) !== net.road.attachments.get(shelter.id)
    )
      return [e];
    const count = Math.min(
      e.count,
      Math.max(0, facility(home).capacity - (residents[home.id] ?? 0)),
    );
    residents[home.id] = (residents[home.id] ?? 0) + count;
    return e.count - count > 0.001 ? [{ ...e, count: e.count - count }] : [];
  });
  return { ...g, city: { ...g.city, residents, displaced }, disaster: { ...d, evacuated } };
}
