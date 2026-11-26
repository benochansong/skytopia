import { DISASTER, PROTECTION, PHYSICAL, BLOCKS, OPERATION } from '../../data/rules';
import type { Building, Cell, Kind } from '../../types/game';
import type { City } from '../stability/types';
import { cellsOf, key } from '../grid';
import { volume } from '../vertical/geometry';

export const distance3 = (a: Cell, b: Cell) =>
  Math.hypot(a.x - b.x, a.z - b.z, ((a.y ?? 0) - (b.y ?? 0)) * 2);
export function defenseReady(city: City, b: Building) {
  return (
    !!city.disaster?.defenses &&
    b.enabled &&
    b.durability > 0 &&
    (!BLOCKS[b.kind].demand || city.disaster.ready.includes(b.id))
  );
}
export function protection(city: City, cell: Cell, kinds: Kind[]) {
  let best = 0;
  for (const b of city.buildings) {
    const d = PROTECTION[b.kind];
    if (
      d &&
      kinds.includes(b.kind) &&
      defenseReady(city, b) &&
      distance3(b.origin, cell) <= d.radius
    )
      best = Math.max(best, d.strength * Math.min(1, b.durability / PHYSICAL[b.kind].hp));
  }
  return best;
}
export function severity(city: City) {
  const d = city.disaster;
  if (!d || d.phase !== 'active' || !d.threat || ['off', 'weather'].includes(d.setting)) return 0;
  return (
    (Math.max(0, Math.sin(Math.PI * Math.min(1, d.clock / d.threat.duration))) * d.threat.level) / 5
  );
}
export function aetherFactor(city: City, b: Building) {
  const d = city.disaster,
    s = severity(city);
  if (!d || !s || !['aether', 'compound'].includes(d.threat!.kind)) return 1;
  const near = Math.max(0.2, 1 - distance3(b.origin, d.threat!.target) / 14);
  const pulse = 0.8 + 0.2 * Math.sin(d.clock * 0.45 + b.origin.x * 0.7);
  return 1 - 0.65 * s * near * pulse * (1 - protection(city, b.origin, ['stabilizer']));
}
export function operationalFactor(city: City, b: Building) {
  const d = city.disaster;
  if (!d) return 1;
  if ((d.outages[b.id] ?? 0) > 0) return 0.05;
  const industry = OPERATION[b.kind].materials > 0 || OPERATION[b.kind].income > 0;
  return industry && ['power', 'conserve', 'evacuate'].includes(d.policy) ? 0.35 : 1;
}
export function temperatureDemand(city: City, b: Building) {
  if (!city.disaster) return 1;
  const t = city.disaster.weather.temperature,
    control = 1 - protection(city, b.origin, ['climateControl']);
  return (
    1 +
    (BLOCKS[b.kind].capacity > 0
      ? Math.max(0, 10 - t) * 0.018
      : OPERATION[b.kind].materials > 0
        ? Math.max(0, t - 28) * 0.018
        : 0) *
      control *
      (1 - 0.2 * (b.level ?? 0))
  );
}
export function harvestFactor(city: City, b: Building) {
  if (!city.disaster) return 1;
  const t = city.disaster.weather.temperature,
    extreme = Math.max(0, 10 - t, t - 28);
  return Math.max(
    0.25,
    1 -
      extreme *
        0.018 *
        (1 - protection(city, b.origin, ['climateControl'])) *
        (['greenhouse', 'hydroponics'].includes(b.kind) ? 0.25 : 1),
  );
}
/** Equivalent lateral stress in game tonnes; real mass is never modified. */
export function weatherLoads(city: City) {
  const d = city.disaster,
    local = new Map<string, number>(),
    forces = new Map<number, number>();
  let torqueX = 0,
    torqueZ = 0,
    gravity = 1;
  if (!d || !severity(city)) return { local, forces, torqueX, torqueZ, gravity };
  if (d.threat?.kind === 'gravity') gravity = 1 + 0.35 * severity(city);
  const speed = d.weather.wind,
    rad = (d.weather.direction * Math.PI) / 180,
    dx = Math.sin(rad),
    dz = Math.cos(rad);
  const platformKeys = new Set(city.platforms.map(key));
  for (const b of city.buildings) {
    if (b.durability <= 0) continue;
    const cells = cellsOf(b, b.origin),
      height = PHYSICAL[b.kind].height,
      altitude = Math.max(0, b.y * 3 + height / 2);
    const area = Math.sqrt(cells.length) * Math.max(0.2, height);
    let shielding = 1;
    for (const other of city.buildings) {
      if (other.id === b.id || other.durability <= 0) continue;
      const ox = b.origin.x - other.origin.x,
        oz = b.origin.z - other.origin.z,
        along = ox * dx + oz * dz,
        cross = Math.abs(ox * dz - oz * dx);
      if (
        along > 0 &&
        along < 4 &&
        cross < 0.8 &&
        other.y * 3 + PHYSICAL[other.kind].height >= b.y * 3 + height * 0.6
      )
        shielding = Math.min(shielding, 0.7);
      if (['windbreak', 'reinforcedWindbreak'].includes(other.kind) && defenseReady(city, other)) {
        const p = PROTECTION[other.kind]!;
        const orientation = 0.35 + 0.65 * Math.abs(Math.cos(rad - (other.rotation * Math.PI) / 2));
        if (along >= 0 && along <= p.radius && cross <= 1.6 && Math.abs(other.y - b.y) <= 1)
          shielding = Math.min(shielding, 1 - p.strength * orientation);
      }
    }
    const force =
      ((0.5 * 1.2 * 1.1 * area * speed * speed * DISASTER.windScale) / 100) *
      (1 + altitude * 0.09) *
      shielding;
    forces.set(b.id, force);
    const supported = volume(b, b.origin).filter((c) => platformKeys.has(key(c)));
    const targets = supported.length ? supported : [b.origin];
    for (const c of targets) local.set(key(c), (local.get(key(c)) ?? 0) + force / targets.length);
    torqueX += force * altitude * dz;
    torqueZ += force * altitude * dx;
  }
  return { local, forces, torqueX, torqueZ, gravity };
}
export function evacuatedTotal(city: City) {
  return city.disaster?.evacuated.reduce((n, e) => n + e.count, 0) ?? 0;
}

export function gravityFactor(city: City, cell: Cell) {
  const d = city.disaster;
  return d?.threat?.kind === 'gravity'
    ? 1 + 0.35 * severity(city) * Math.max(0, 1 - distance3(cell, d.threat.target) / 6)
    : 1;
}
