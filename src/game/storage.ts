import { z } from 'zod';
import { BLOCKS, DEFAULT_SETTINGS, PHYSICAL, RULES, STRUCTURE, isPlatform } from '../data/rules';
import type { Game, Settings } from '../types/game';
import { cellsOf, key, neighbors } from './grid';
import { analyze } from './analysis';
import { edgeKey, freshStructure, platformMaxHP } from './stability/state';
const finite = z.number().finite(),
  coord = finite.int().min(RULES.min).max(RULES.max),
  cell = z.object({ x: coord, z: coord });
const kind = z.enum([
  'platform',
  'home',
  'power',
  'road',
  'farm',
  'park',
  'metalPlatform',
  'largeHome',
  'factory',
  'liftSmall',
  'liftLarge',
  'brace',
  'ballast',
]);
const shape = z.enum(['single', 'I', 'L', 'T', 'O', 'S']);
const piece = z
  .object({ kind, shape, rotation: finite.int().min(0).max(3) })
  .refine((p) => BLOCKS[p.kind].shapes.includes(p.shape));
export const settingsSchema = z.object({
  language: z.enum(['ko', 'en']),
  sound: z.boolean(),
  shadows: z.boolean(),
  reducedMotion: z.boolean(),
  difficulty: z.enum(['easy', 'normal', 'hard']).default('normal'),
  musicVolume: finite.min(0).max(1).default(0),
  effectsVolume: finite.min(0).max(1).default(0.65),
  warningVolume: finite.min(0).max(1).default(0.5),
});
const platform = cell.extend({
  id: z.string().min(1).max(60),
  y: z.literal(0),
  variant: z.enum(['grass', 'rock', 'metal']),
  material: z.enum(['basic', 'metal']),
  mass: finite.positive().max(12),
  durability: finite.min(0).max(550),
  reinforcement: finite.int().min(0).max(3),
  anchor: z.boolean(),
});
const building = z.object({
  id: finite.int().positive(),
  kind,
  shape,
  rotation: finite.int().min(0).max(3),
  origin: cell,
  y: z.literal(0),
  initial: z.boolean(),
  durability: finite.min(0).max(250),
  enabled: z.boolean(),
});
const target = z.object({
  type: z.enum(['platform', 'edge', 'building']),
  id: z.string().min(1).max(60),
});
const structure = z.object({
  edges: z.record(
    z.object({ durability: finite.min(0).max(400), reinforcement: finite.int().min(0).max(3) }),
  ),
  lifts: z.record(z.object({ factor: finite.min(0).max(1), outage: finite.nonnegative() })),
  coreDurability: finite.min(0).max(500),
  accumulator: finite.min(0).max(2),
  grace: finite.min(0).max(60),
  criticalTime: finite.nonnegative(),
  pending: z.array(z.string()).max(256),
  events: z
    .array(
      z.object({
        id: finite.int().positive(),
        time: finite.nonnegative(),
        kind: z.enum([
          'crack',
          'edgeFailed',
          'collapse',
          'powerLost',
          'liftFading',
          'repair',
          'reinforce',
          'emergency',
          'recovered',
          'critical',
          'demolish',
        ]),
        target: z.string().max(60),
        cell,
        platforms: z.array(platform).max(8),
        buildings: z.array(building).max(255),
      }),
    )
    .max(STRUCTURE.maxEvents),
  nextEventId: finite.int().positive(),
  emergency: z.object({
    cell,
    remaining: finite.min(0).max(STRUCTURE.emergencySeconds),
    cooldown: finite.min(0).max(STRUCTURE.emergencyCooldown),
  }),
  repairs: z
    .array(z.object({ target, remaining: finite.positive().max(STRUCTURE.repairSeconds) }))
    .max(1024),
  repairsDone: finite.int().nonnegative(),
  reinforcementsDone: finite.int().nonnegative(),
  collapsedCount: finite.int().nonnegative(),
  maxCitySize: finite.int().min(0).max(512),
  loss: z
    .object({
      reason: z.enum(['lift', 'balance', 'core']),
      time: finite.nonnegative(),
      firstFailure: z.string().max(60),
    })
    .nullable(),
});
const schema = z.object({
  version: z.literal(2),
  mode: z.enum(['mission', 'training', 'lab']),
  missionId: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  missionHold: finite.nonnegative(),
  baselineSeparation: finite.nonnegative(),
  labExample: z.enum(['A', 'B', 'C', 'D']),
  labPaused: z.boolean(),
  difficulty: z.enum(['easy', 'normal', 'hard']),
  structure,
  reservedActive: piece.nullable(),
  platforms: z.array(platform).max(256),
  buildings: z.array(building).max(255),
  active: piece,
  next: z.array(piece).length(3),
  hold: piece.nullable(),
  holdUsed: z.boolean(),
  cursor: cell,
  supply: z.object({
    seed: finite.int().min(0).max(4294967295),
    bag: z.array(kind).max(32),
    draws: finite.int().min(4),
    policy: z.enum(['classic', 'adaptive']).optional(),
  }),
  population: finite.nonnegative(),
  resources: finite.nonnegative(),
  score: finite.nonnegative(),
  elapsed: finite.nonnegative(),
  remaining: finite.min(0).max(20),
  nextId: finite.int().positive(),
  won: z.boolean(),
  tutorial: finite.int().min(0).max(9),
  settings: settingsSchema,
});
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Expected object');
  return v as Record<string, unknown>;
};
function migrateV1(raw: Record<string, unknown>): unknown {
  if (!Array.isArray(raw.platforms) || !Array.isArray(raw.buildings))
    throw Error('Invalid legacy city');
  return {
    ...raw,
    version: 2,
    missionId: 1,
    missionHold: 0,
    baselineSeparation: 0,
    labExample: 'A',
    labPaused: false,
    difficulty: 'normal',
    structure: freshStructure(),
    reservedActive: null,
    platforms: raw.platforms.map((value) => {
      const p = object(value);
      return {
        ...p,
        id: `legacy:${p.x},${p.z}`,
        material: 'basic',
        reinforcement: 0,
        anchor:
          typeof p.x === 'number' &&
          typeof p.z === 'number' &&
          p.x >= -3 &&
          p.x <= 2 &&
          p.z >= -3 &&
          p.z <= 2,
      };
    }),
    buildings: raw.buildings.map((value) => {
      const b = object(value);
      if (typeof b.kind !== 'string' || !(b.kind in PHYSICAL)) throw Error('Invalid kind');
      return { ...b, durability: PHYSICAL[b.kind as keyof typeof PHYSICAL].hp, enabled: true };
    }),
  };
}
export type SaveResult =
  | { ok: true; game: Game }
  | { ok: false; reason: 'empty' | 'corrupt' | 'unavailable' };
export function decodeSave(raw: string | null): SaveResult {
  if (!raw) return { ok: false, reason: 'empty' };
  try {
    const parsed = object(JSON.parse(raw)),
      legacy = parsed.version === 1;
    const g = schema.parse(legacy ? migrateV1(parsed) : parsed) as Game;
    const platforms = new Set(g.platforms.map(key)),
      ids = new Set(g.platforms.map((p) => p.id));
    if (platforms.size !== g.platforms.length || ids.size !== g.platforms.length)
      throw Error('Duplicate platform');
    for (const p of g.platforms)
      if (
        p.durability > platformMaxHP(p) ||
        (p.anchor && (p.x < -3 || p.x > 2 || p.z < -3 || p.z > 2))
      )
        throw Error('Invalid support');
    const occupied = new Set<string>(),
      buildingIds = new Set<number>();
    for (const b of g.buildings) {
      if (
        buildingIds.has(b.id) ||
        b.id >= g.nextId ||
        !BLOCKS[b.kind].shapes.includes(b.shape) ||
        isPlatform(b.kind) ||
        b.kind === 'brace' ||
        b.durability > PHYSICAL[b.kind].hp
      )
        throw Error('Invalid building');
      buildingIds.add(b.id);
      for (const c of cellsOf(b, b.origin)) {
        const k = key(c);
        if (occupied.has(k) || !platforms.has(k) || k === '0,0') throw Error('Invalid occupancy');
        occupied.add(k);
      }
    }
    if (Object.keys(g.structure.edges).length > 480 || Object.keys(g.structure.lifts).length > 255)
      throw Error('Too many records');
    for (const [id, e] of Object.entries(g.structure.edges)) {
      const [a, b, ...rest] = id.split('|');
      if (rest.length || !platforms.has(a) || !platforms.has(b) || id !== edgeKey(a, b))
        throw Error('Invalid edge');
      const [ax, az] = a.split(',').map(Number),
        [bx, bz] = b.split(',').map(Number);
      if (Math.abs(ax - bx) + Math.abs(az - bz) !== 1 || e.durability > 100 + e.reinforcement * 100)
        throw Error('Invalid connection');
    }
    for (const id of Object.keys(g.structure.lifts))
      if (
        !g.buildings.some(
          (b) => String(b.id) === id && (b.kind === 'liftSmall' || b.kind === 'liftLarge'),
        )
      )
        throw Error('Invalid lift');
    if (
      new Set(g.structure.pending).size !== g.structure.pending.length ||
      g.structure.pending.some((k) => !platforms.has(k))
    )
      throw Error('Invalid collapse queue');
    const eventIds = new Set<number>();
    for (const e of g.structure.events) {
      if (e.id >= g.structure.nextEventId || eventIds.has(e.id) || e.time > g.elapsed)
        throw Error('Invalid event');
      eventIds.add(e.id);
    }
    if (g.population > analyze(g).capacity) throw Error('Invalid population');
    if (legacy) {
      for (let x = -3; x <= 2; x++)
        for (let z = -3; z <= 2; z++)
          if (!platforms.has(key({ x, z }))) throw Error('Missing legacy foundation');
      const reached = new Set<string>(),
        q = [{ x: 0, z: 0 }];
      for (let i = 0; i < q.length; i++) {
        const c = q[i],
          k = key(c);
        if (reached.has(k) || !platforms.has(k)) continue;
        reached.add(k);
        q.push(...neighbors(c));
      }
      if (reached.size !== platforms.size) throw Error('Detached legacy platform');
      if (g.buildings.filter((b) => b.initial).length !== 5)
        throw Error('Invalid legacy initial city');
    }
    return { ok: true, game: g };
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}
export function loadGame(slot: 'campaign' | 'lab' = 'campaign'): SaveResult {
  try {
    const raw = localStorage.getItem(slot === 'lab' ? RULES.labSaveKey : RULES.saveKey);
    const result = decodeSave(
      raw ?? (slot === 'campaign' ? localStorage.getItem(RULES.legacySaveKey) : null),
    );
    if (result.ok && (slot === 'lab') !== (result.game.mode === 'lab'))
      return { ok: false, reason: 'corrupt' };
    return result;
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
export function saveGame(g: Game): boolean {
  try {
    localStorage.setItem(g.mode === 'lab' ? RULES.labSaveKey : RULES.saveKey, JSON.stringify(g));
    return true;
  } catch {
    return false;
  }
}
export function loadSettings(): Settings {
  try {
    const p = settingsSchema.safeParse(
      JSON.parse(localStorage.getItem(RULES.settingsKey) || 'null'),
    );
    return p.success ? p.data : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(settings: Settings): boolean {
  try {
    localStorage.setItem(RULES.settingsKey, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
