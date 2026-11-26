import { z } from 'zod';
import type { Game } from '../../types/game';
import type { WorldState } from '../../types/world';
import { CARGO_TYPES, REGIONS, SHIP_TYPES, SPECIALTIES } from '../../types/world';
import { decodeSave } from '../storage';
import { attachWorld, context, syncWorld } from './state';
import { cargoWeight } from './logistics';
import { shipDefs, technologies } from './definitions';
export const WORLD_KEY = 'skytopia.world.v1',
  WORLD_LAB_KEY = 'skytopia.worldlab.v1';
const n = z.number().finite().min(0).max(1e9),
  count = n.int(),
  id = z.string().min(1).max(80),
  name = z.string().min(1).max(60),
  coordinate = z.number().finite().min(-10000).max(10000);
const cargo = z
  .object(
    Object.fromEntries(CARGO_TYPES.map((k) => [k, n.optional()])) as Record<
      (typeof CARGO_TYPES)[number],
      z.ZodOptional<typeof n>
    >,
  )
  .strict();
const schema = z.object({
  version: z.literal(1),
  name,
  seed: z.number().finite().int().min(0).max(4294967295),
  mode: z.enum(['civilization', 'lab', 'campaign']),
  example: z.enum(['A', 'B', 'C', 'D', 'E']),
  active: id,
  capital: id,
  view: z.enum(['city', 'map']),
  inspected: z.array(id).max(20),
  colonyTarget: id.nullable(),
  clock: n,
  accumulator: n.max(3),
  nextId: count.positive(),
  config: z.object({
    maxCities: count.min(1).max(6),
    size: count.min(12).max(20),
    resources: n.min(0.5).max(2),
    researchSpeed: n.min(0.25).max(4),
    disasters: n.max(3),
    tradeDifficulty: n.min(0.5).max(2),
    blockTime: n.max(120),
  }),
  islands: z
    .array(
      z.object({
        id,
        name,
        region: z.enum(REGIONS),
        x: coordinate,
        y: coordinate,
        radius: n.min(1).max(100),
        rockMass: n.max(1000),
        lift: n.max(2000),
        fertility: n.max(3),
        mineral: n.max(3),
        aether: n.max(3),
        temperature: coordinate,
        wind: n.max(5),
        risk: n.max(1),
        ruins: z.boolean(),
        discovered: z.boolean(),
        visited: z.boolean(),
        artifact: z.enum(['unseen', 'recorded', 'recovered']),
        colonyCost: n.min(1).max(1000),
      }),
    )
    .min(12)
    .max(20),
  cities: z
    .array(
      z.object({
        id,
        island: id,
        name,
        specialty: z.enum(SPECIALTIES),
        pending: n.max(1),
        game: z.unknown(),
        rare: z.object({
          metal: n.max(1000),
          pureAether: n.max(1000),
          ancientAlloy: n.max(1000),
          data: n.max(1000),
        }),
        camera: z
          .object({
            position: z.tuple([coordinate, coordinate, coordinate]),
            target: z.tuple([coordinate, coordinate, coordinate]),
          })
          .nullable(),
      }),
    )
    .min(1)
    .max(6),
  ships: z
    .array(
      z.object({
        id,
        type: z.enum(SHIP_TYPES),
        home: id,
        location: id,
        hp: n.max(100),
        fuel: n.max(1000),
        state: z.enum([
          'building',
          'docked',
          'loading',
          'departing',
          'sailing',
          'avoiding',
          'approach',
          'unloading',
          'repairing',
          'returning',
        ]),
        remaining: n.max(1000),
        cargo,
        trip: z
          .object({
            id,
            from: id,
            to: id,
            distance: n.max(3000),
            progress: n.max(3000),
            task: z.enum(['trade', 'explore', 'colonize', 'rescue', 'passengers']),
            route: id.nullable(),
            charterCredits: n.max(150),
            risk: z.boolean(),
            artifact: z.enum(['recover', 'record']),
            returning: z.boolean(),
          })
          .nullable(),
      }),
    )
    .max(24),
  routes: z
    .array(
      z.object({
        id,
        from: id,
        to: id,
        resource: z.enum(CARGO_TYPES),
        amount: n.positive().max(250),
        reserve: n,
        target: n,
        ship: id,
        interval: n.min(1),
        next: n,
        priority: count.max(10),
        allowRisk: z.boolean(),
        enabled: z.boolean(),
        delivered: n,
      }),
    )
    .max(24),
  bridges: z
    .array(
      z.object({
        id,
        from: id,
        to: id,
        hp: n.max(100),
        resource: z.enum(CARGO_TYPES),
        cargo: n.max(5),
        remaining: n.max(1000),
        delivered: n,
      }),
    )
    .max(12),
  research: z.object({
    points: n.max(1e6),
    completed: z.array(id).max(18),
    active: z.object({ id, remaining: n.max(1000), city: id }).nullable(),
  }),
  ledger: z
    .array(z.object({ id, from: id, to: id, resource: z.enum(CARGO_TYPES), amount: n, time: n }))
    .max(128),
  stats: z.object({
    explored: count,
    colonies: count,
    deliveries: count,
    food: n,
    materials: n,
    rescued: n,
    recovered: count,
  }),
  ending: z.object({ scene: count.max(5), seen: z.boolean(), continued: z.boolean() }),
  notice: z.string().max(100),
});
const unique = (values: string[]) => new Set(values).size === values.length;
export type WorldLoad = { ok: true; game: Game } | { ok: false; reason: 'missing' | 'corrupt' };
export function decodeWorld(raw: string | null): WorldLoad {
  if (!raw) return { ok: false, reason: 'missing' };
  try {
    if (raw.length > 3_000_000) throw Error('size');
    const parsed = schema.parse(JSON.parse(raw));
    const cities = parsed.cities.map((c) => {
      const rawGame = c.game as Record<string, unknown>;
      if (!rawGame || rawGame.world || rawGame.campaign) throw Error('nested');
      // World timers have a wider range; keep every other legacy city validation.
      const remaining = z.number().finite().min(0).max(120).parse(rawGame.remaining);
      const decoded = decodeSave(
        JSON.stringify({ ...rawGame, remaining: Math.min(20, remaining) }),
      );
      if (!decoded.ok) throw Error('city');
      if (!decoded.game.city.enabled || decoded.game.mode !== 'citylab') throw Error('mode');
      return { ...c, game: { ...decoded.game, remaining } };
    });
    const w = { ...parsed, cities } as WorldState;
    const cityIDs = cities.map((c) => c.id),
      islandIDs = w.islands.map((i) => i.id),
      shipIDs = w.ships.map((s) => s.id),
      routeIDs = w.routes.map((r) => r.id);
    if (
      !unique(cityIDs) ||
      !unique(islandIDs) ||
      !unique(shipIDs) ||
      !unique(routeIDs) ||
      !unique(w.bridges.map((b) => b.id)) ||
      !unique(cities.map((c) => c.island)) ||
      !unique(w.ledger.map((l) => l.id)) ||
      !unique(w.ships.flatMap((s) => (s.trip ? [s.trip.id] : []))) ||
      !unique(w.research.completed) ||
      !unique(w.routes.map((r) => r.ship))
    )
      throw Error('duplicate');
    if (
      !unique(w.inspected) ||
      w.inspected.some((id) => !w.islands.some((i) => i.id === id && i.discovered)) ||
      (w.colonyTarget && !w.islands.some((i) => i.id === w.colonyTarget && i.discovered))
    )
      throw Error('discovery');
    if (
      cities.length > w.config.maxCities ||
      !cityIDs.includes(w.active) ||
      !cityIDs.includes(w.capital) ||
      cities.some((c) => !w.islands.some((i) => i.id === c.island && i.discovered))
    )
      throw Error('cities');
    if (
      w.research.completed.some((id) => !technologies.some((t) => t.id === id)) ||
      w.research.completed.some((id) => {
        const t = technologies.find((t) => t.id === id)!;
        return t.prerequisite && !w.research.completed.includes(t.prerequisite);
      })
    )
      throw Error('tech');
    if (
      w.research.active &&
      (!cityIDs.includes(w.research.active.city) ||
        !technologies.some(
          (t) =>
            t.id === w.research.active!.id &&
            (!t.prerequisite || w.research.completed.includes(t.prerequisite)),
        ) ||
        w.research.completed.includes(w.research.active.id))
    )
      throw Error('active tech');
    for (const s of w.ships) {
      if (
        !cityIDs.includes(s.home) ||
        !cityIDs.includes(s.location) ||
        cargoWeight(s.cargo) > shipDefs[s.type].capacity + 1e-7
      )
        throw Error('ship');
      if (s.trip) {
        const t = s.trip;
        if (
          !cityIDs.includes(t.from) ||
          t.from !== s.location ||
          ![...cityIDs, ...islandIDs].includes(t.to) ||
          (['trade', 'rescue', 'passengers'].includes(t.task) && !cityIDs.includes(t.to)) ||
          (t.task !== 'colonize' && t.charterCredits !== 0) ||
          t.progress > t.distance + 1e-7 ||
          (t.route &&
            !w.routes.some(
              (r) => r.id === t.route && r.ship === s.id && r.from === t.from && r.to === t.to,
            )) ||
          ['docked', 'building', 'repairing'].includes(s.state)
        )
          throw Error('trip');
      } else if (!['docked', 'building', 'repairing'].includes(s.state) || cargoWeight(s.cargo) > 0)
        throw Error('cargo');
    }
    if (
      w.routes.some(
        (r) =>
          !cityIDs.includes(r.from) ||
          !cityIDs.includes(r.to) ||
          r.from === r.to ||
          !shipIDs.includes(r.ship),
      ) ||
      w.bridges.some((b) => !cityIDs.includes(b.from) || !cityIDs.includes(b.to) || b.from === b.to)
    )
      throw Error('route');
    // ID counter must advance beyond every generated ID, including bounded receipt history.
    const ids = [
      ...cityIDs,
      ...shipIDs,
      ...routeIDs,
      ...w.bridges.map((b) => b.id),
      ...w.ledger.map((l) => l.id),
      ...w.ships.flatMap((s) => (s.trip ? [s.trip.id] : [])),
    ];
    if (
      ids.some((id) => {
        const suffix = Number(id.split('-').at(-1));
        return Number.isFinite(suffix) && suffix >= w.nextId;
      })
    )
      throw Error('counter');
    for (const c of cities) c.game = { ...c.game, worldContext: context(w, c) };
    return { ok: true, game: attachWorld(cities.find((c) => c.id === w.active)!.game, w) };
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}
export function saveWorld(g: Game): boolean {
  if (!g.world) return false;
  try {
    const raw = JSON.stringify(syncWorld(g));
    if (!decodeWorld(raw).ok) return false;
    localStorage.setItem(g.world.mode === 'lab' ? WORLD_LAB_KEY : WORLD_KEY, raw);
    return true;
  } catch {
    return false;
  }
}
export function loadWorld(lab = false): WorldLoad {
  try {
    return decodeWorld(localStorage.getItem(lab ? WORLD_LAB_KEY : WORLD_KEY));
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}
