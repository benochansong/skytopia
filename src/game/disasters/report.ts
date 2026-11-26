import { DISASTER, PROTECTION, isBattery, isLift } from '../../data/rules';
import { analyze } from '../analysis';
import { cityReport } from '../city/report';
import { defenseReady, distance3 } from './effects';
import type { Game } from '../../types/game';
export function resilience(g: Game) {
  const a = analyze(g),
    r = cityReport(g),
    ready = g.buildings.filter((b) => defenseReady(g, b));
  const shelters = ready.filter((b) => b.kind === 'shelter'),
    shields = ready.filter((b) => ['shieldSmall', 'shieldLarge'].includes(b.kind));
  const covered =
    g.buildings.filter((b) =>
      shields.some((s) => distance3(b.origin, s.origin) <= PROTECTION[s.kind]!.radius),
    ).length / Math.max(1, g.buildings.length);
  const parts = {
    support: Math.min(
      15,
      g.buildings.filter((b) => ['column', 'reinforcedColumn', 'diagonal'].includes(b.kind))
        .length * 1.5,
    ),
    lift: Math.min(15, (Math.max(0, a.lift - a.mass) / Math.max(1, a.mass)) * 40),
    power: Math.min(
      10,
      g.buildings.filter(
        (b) => r.operations.get(b.id)?.power && !isBattery(b.kind) && !isLift(b.kind),
      ).length * 2.5,
    ),
    energy: Math.min(10, r.battery / 40),
    food: Math.min(10, (r.stocks.food / Math.max(1, r.foodConsumption * 90)) * 10),
    shield: covered * 15,
    shelter: Math.min(
      15,
      ((shelters.length * DISASTER.shelterCapacity) / Math.max(1, g.population)) * 15,
    ),
    repair: ready.some((b) => b.kind === 'repairCenter') ? 10 : 0,
  };
  return {
    score: Math.round(
      Math.max(
        0,
        Math.min(
          100,
          Object.values(parts).reduce((a, b) => a + b, 0),
        ),
      ),
    ),
    parts,
    covered,
    shelterCapacity: shelters.length * DISASTER.shelterCapacity,
    foodSeconds: r.foodConsumption > 0 ? r.stocks.food / r.foodConsumption : Infinity,
    batterySeconds: r.demand > 0 ? r.battery / r.demand : Infinity,
  };
}
