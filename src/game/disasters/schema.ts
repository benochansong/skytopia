import { z } from 'zod';
import { HAZARDS, POLICIES } from '../../types/disaster';
import { DISASTER, DISASTER_KINDS, PROTECTION, BLOCKS } from '../../data/rules';
import type { Game } from '../../types/game';
const n = z.number().finite().nonnegative().max(1e9),
  count = n.int(),
  id = count.positive(),
  record = z.record(n).refine((v) => Object.keys(v).length <= 1200);
export function disasterSchema(
  building: z.ZodTypeAny,
  platform: z.ZodTypeAny,
  piece: z.ZodTypeAny,
  cell: z.ZodTypeAny,
  target: z.ZodTypeAny,
) {
  const snapshot = z.object({
    population: n,
    stability: n.max(100),
    buildings: count.max(1200),
    platforms: count.max(1792),
    mass: n,
    lift: n,
    generation: n,
    food: n,
    materials: n,
    credits: n,
    resilience: n.max(100),
  });
  const hazard = z.enum(HAZARDS),
    direction = n.max(359),
    level = count.min(1).max(5),
    duration = n.min(5).max(180);
  return z.object({
    version: z.literal(1),
    mode: z.enum(['lab', 'survival', 'campaign', 'free']),
    setting: z.enum(['off', 'weather', 'low', 'normal', 'high', 'custom']),
    seed: z.number().finite().int().min(0).max(4294967295),
    initialSeed: z.number().finite().int().min(0).max(4294967295),
    nextId: id,
    phase: z.enum(['calm', 'forecast', 'active', 'recovery']),
    clock: n,
    weatherClock: n,
    weather: z.object({
      kind: z.enum([
        'clear',
        'cloudy',
        'breeze',
        'rain',
        'fog',
        'wind',
        'thunder',
        'cold',
        'heat',
        'aether',
      ]),
      direction,
      wind: n.max(100),
      temperature: z.number().finite().min(-40).max(60),
      clouds: n.max(1),
      rain: n.max(1),
      lightning: n.max(1),
      instability: n.max(1),
    }),
    threat: z
      .object({
        id,
        kind: hazard,
        level,
        direction,
        wind: n.max(100),
        duration,
        warning: n.min(1).max(300),
        recovery: n.min(30).max(300),
        target: cell,
        impacts: z
          .array(
            z.object({
              id: z.string().min(1).max(32),
              at: n.max(180),
              cell,
              kind: z.enum(['meteor', 'lightning']),
              power: n.max(DISASTER.impactCap),
              radius: n.max(3),
            }),
          )
          .max(DISASTER.maxImpacts),
      })
      .nullable(),
    policy: z.enum(POLICIES),
    view: z.enum([
      'off',
      'wind',
      'risk',
      'impact',
      'shield',
      'aether',
      'evacuation',
      'damage',
      'recovery',
    ]),
    ready: z.array(id).max(1200),
    shields: record,
    outages: z.record(n.max(30)).refine((v) => Object.keys(v).length <= 1200),
    evacuated: z
      .array(z.object({ home: id, shelter: id, count: n.max(DISASTER.shelterCapacity) }))
      .max(1200),
    applied: z.array(z.string().max(32)).max(128),
    effects: z
      .array(
        z.object({
          id: z.string().max(32),
          kind: z.enum(['meteor', 'lightning', 'shield']),
          cell,
          age: n.max(3),
        }),
      )
      .max(DISASTER.maxEffects),
    baseline: z
      .object({
        tallies: z.object({ absorbed: n, protected: count, repairs: count }),
        snapshot,
        buildings: z.array(building).max(1200),
        platforms: z.array(platform).max(1792),
      })
      .nullable(),
    blueprints: z
      .array(z.object({ id: z.string().max(64), cell, piece }))
      .max(DISASTER.maxBlueprints),
    reports: z
      .array(
        z.object({
          id,
          kind: hazard,
          level,
          duration,
          before: snapshot,
          after: snapshot,
          damaged: count,
          collapsed: count,
          members: count,
          protected: count,
          absorbed: n,
          evacuated: n,
          repairs: count,
          repairCost: n,
        }),
      )
      .max(DISASTER.maxReports),
    stats: z.object({
      completed: count,
      storms: count,
      aether: count,
      absorbed: n,
      intercepted: count,
      lightningProtected: count,
      evacuated: n,
      repaired: count,
      peakPopulation: n,
      completedWaves: count,
    }),
    wave: id,
    reward: id.nullable(),
    claimed: z.array(id).max(10000),
    score: n,
    emergencyCooldown: n.max(90),
    repairClock: n.max(DISASTER.repairInterval),
    repairTarget: target.nullable(),
    autoRepair: z.boolean(),
    defenses: z.boolean(),
    example: z.enum(['A', 'B', 'C', 'D', 'E', 'F']),
    config: z.object({ kind: hazard, level, direction, wind: n.max(100), duration, target: cell }),
  });
}
export function validateDisaster(g: Game) {
  const d = g.disaster;
  if (!d) {
    if (g.buildings.some((b) => DISASTER_KINDS.includes(b.kind)))
      throw Error('Missing disaster state');
    return;
  }
  if (!g.city.enabled) throw Error('Disasters require city operations');
  if (d.phase !== 'calm' && (!d.threat || !d.baseline)) throw Error('Missing threat baseline');
  if (d.threat) {
    const t = d.threat;
    if (
      t.id >= d.nextId ||
      t.impacts.some((e) => e.at > t.duration) ||
      new Set(t.impacts.map((e) => e.id)).size !== t.impacts.length ||
      t.impacts.some((e) => !e.id.startsWith(t.id + ':'))
    )
      throw Error('Invalid threat');
  }
  for (const values of [
    d.ready,
    d.applied,
    d.claimed,
    d.reports.map((r) => r.id),
    d.blueprints.map((b) => b.id),
  ])
    if (new Set<string | number>(values).size !== values.length)
      throw Error('Duplicate disaster record');
  if (
    d.reward !== null &&
    (d.mode !== 'survival' || d.reward !== d.wave || d.claimed.includes(d.reward))
  )
    throw Error('Invalid reward');
  if (d.claimed.some((w) => w >= d.wave) || d.stats.completedWaves > d.wave)
    throw Error('Invalid wave progress');
  for (const [id, energy] of Object.entries(d.shields)) {
    const b = g.buildings.find((b) => String(b.id) === id);
    if (
      !b ||
      !['shieldSmall', 'shieldLarge'].includes(b.kind) ||
      energy > PROTECTION[b.kind]!.capacity + 0.001
    )
      throw Error('Invalid shield');
  }
  const sheltered = new Map<number, number>();
  const pairs = new Set<string>();
  for (const e of d.evacuated) {
    const b = g.buildings.find((b) => b.id === e.shelter);
    const pair = e.home + ':' + e.shelter;
    if (!b || b.kind !== 'shelter' || pairs.has(pair)) throw Error('Invalid evacuee');
    pairs.add(pair);
    sheltered.set(e.shelter, (sheltered.get(e.shelter) ?? 0) + e.count);
  }
  if ([...sheltered.values()].some((n) => n > DISASTER.shelterCapacity + 0.001))
    throw Error('Shelter overflow');
  if (d.mode === 'lab' && g.campaign) throw Error('Laboratory campaign crossover');
  if (d.mode === 'campaign' && !g.campaign) {
    /* Campaign envelope restores run after the city schema. */
  }
  if (
    d.ready.some((id) => !g.buildings.some((b) => b.id === id)) ||
    Object.keys(d.outages).some((id) => !g.buildings.some((b) => String(b.id) === id))
  )
    throw Error('Stale disaster facility');
  void BLOCKS;
}
