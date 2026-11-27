import { WORLD_KINDS } from '../data/rules';
import { disasterSchema, validateDisaster } from './disasters/schema';
import { evacuatedTotal } from './disasters/effects';
import { DISASTER_KINDS, isBattery } from '../data/rules';
import { VERTICAL, VERTICAL_KINDS, SHAPES, isLift } from '../data/rules';
import { volume, isLink, segments } from './vertical/geometry';
import { parseKey, floorOf, inBounds } from './grid';
import { facility, OPERATION, CITY_RULES } from '../data/cityRules';
import { inventory } from './city/inventory';
import { freshCity } from './city/state';
import { citySchema } from './city/schema';
import { reconcileResidents } from './city/population';
import { KINDS } from '../data/rules';
import { z } from 'zod';
import { BLOCKS, DEFAULT_SETTINGS, PHYSICAL, RULES, STRUCTURE, isPlatform } from '../data/rules';
import type { Game, Settings } from '../types/game';
import { key, neighbors } from './grid';
import { analyze } from './analysis';
import { edgeKey, freshStructure, platformMaxHP } from './stability/state';
const finite = z.number().finite(),
  coord = finite.int().min(RULES.min).max(RULES.max),
  height = finite.int().min(VERTICAL.min).max(VERTICAL.max),
  cell = z.object({ x: coord, z: coord, y: height.optional() });
const kind = z.enum([...KINDS, ...VERTICAL_KINDS, ...DISASTER_KINDS, ...WORLD_KINDS] as [
  (typeof KINDS)[number],
  ...(typeof KINDS)[number][],
]);
const shape = z.enum(Object.keys(SHAPES) as [keyof typeof SHAPES, ...(keyof typeof SHAPES)[]]);
const piece = z
  .object({
    kind,
    shape,
    rotation: finite.int().min(0).max(3),
    pitch: finite.int().min(0).max(3).optional(),
    roll: finite.int().min(0).max(3).optional(),
  })
  .refine(
    (p) =>
      BLOCKS[p.kind].shapes.includes(p.shape) &&
      (!(p.pitch || p.roll) || ['beam', 'truss'].includes(p.kind)),
  );
export const settingsSchema = z.object({
  controlsVersion: z.literal(1).default(1),
  repeatDelay: finite.int().min(120).max(600).default(260),
  repeatInterval: finite.int().min(50).max(250).default(90),
  smartSnap: z.boolean().default(false),
  rotationAssist: z.boolean().default(true),
  assistance: z.enum(['guided', 'normal', 'expert']).default('normal'),
  cameraSensitivity: finite.min(0.3).max(2).default(1),
  zoomSensitivity: finite.min(0.3).max(2).default(1),
  stormParticles: finite.int().min(0).max(200).default(96),
  reducedFlashes: z.boolean().default(true),
  cameraShake: finite.min(0).max(1).default(0),
  disasterCamera: z.boolean().default(false),
  warningScale: finite.min(1).max(2).default(1),
  dayNight: z.boolean().default(true),
  citizens: finite.int().min(0).max(48).default(32),
  vehicles: finite.int().min(0).max(16).default(12),
  environment: z.boolean().default(true),
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
  y: height,
  variant: z.enum(['grass', 'rock', 'metal']),
  material: z.enum(['basic', 'metal']),
  kind: kind.optional(),
  mass: finite.positive().max(35),
  durability: finite.min(0).max(550),
  reinforcement: finite.int().min(0).max(3),
  anchor: z.boolean(),
});
const building = z.object({
  reinforcement: finite.int().min(0).max(3).optional(),
  temporary: finite.nonnegative().max(30).optional(),
  pitch: finite.int().min(0).max(3).optional(),
  roll: finite.int().min(0).max(3).optional(),
  level: finite.int().min(0).max(2).optional(),
  priority: finite.int().min(0).max(5).optional(),
  id: finite.int().positive(),
  kind,
  shape,
  rotation: finite.int().min(0).max(3),
  origin: cell,
  y: height,
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
  pending: z.array(z.string()).max(VERTICAL.maxPlatforms),
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
        buildings: z.array(building).max(VERTICAL.maxBuildings),
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
  maxCitySize: finite.int().min(0).max(3000),
  loss: z
    .object({
      reason: z.enum(['lift', 'balance', 'core']),
      time: finite.nonnegative(),
      firstFailure: z.string().max(60),
    })
    .nullable(),
});
const schema = z.object({
  version: z.literal(5),
  disaster: disasterSchema(building, platform, piece, cell, target).optional(),
  vertical: z
    .object({
      version: z.literal(1),
      floor: height,
      view: z.enum(['all', 'active', 'cutaway', 'structure', 'lower', 'blueprint']),
      example: z.enum(['A', 'B', 'C', 'D', 'E']),
      builtColumns: finite.int().nonnegative(),
      builtBridges: finite.int().nonnegative(),
      emergencyCooldown: finite.nonnegative(),
    })
    .optional(),
  polish: z
    .object({
      version: z.literal(1),
      recycleAt: finite.nonnegative(),
      freeStyle: z.enum(['relaxed', 'classic', 'engineering', 'survival']).optional(),
    })
    .optional(),
  city: citySchema,
  mode: z.enum(['mission', 'training', 'lab', 'citylab']),
  missionId: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
  ]),
  missionHold: finite.nonnegative(),
  baselineSeparation: finite.nonnegative(),
  labExample: z.enum(['A', 'B', 'C', 'D']),
  labPaused: z.boolean(),
  difficulty: z.enum(['easy', 'normal', 'hard']),
  structure,
  reservedActive: piece.nullable(),
  platforms: z.array(platform).max(VERTICAL.maxPlatforms),
  buildings: z.array(building).max(VERTICAL.maxBuildings),
  active: piece,
  next: z.array(piece).length(3),
  hold: piece.nullable(),
  holdUsed: z.boolean(),
  cursor: cell,
  supply: z.object({
    seed: finite.int().min(0).max(4294967295),
    bag: z.array(kind).max(64),
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
    const v2 = object(legacy ? migrateV1(parsed) : parsed);
    const upgraded = object(
      v2.version === 2
        ? {
            ...v2,
            version: 3,
            city: freshCity(false, Number(v2.resources), v2.difficulty as Game['difficulty']),
          }
        : v2,
    );
    const migrate = [3, 4].includes(Number(upgraded.version))
      ? { ...upgraded, version: 5, disaster: undefined }
      : upgraded;
    let g = schema.parse(migrate) as Game;
    validateDisaster(g);
    if (v2.version === 2) g = reconcileResidents(g);
    if (
      !g.vertical &&
      (g.platforms.some((p) => p.y !== 0 || p.kind !== undefined) ||
        g.buildings.some((b) => b.y !== 0 || VERTICAL_KINDS.includes(b.kind)))
    )
      throw Error('Missing vertical state');
    const platforms = new Set(g.platforms.map(key)),
      ids = new Set(g.platforms.map((p) => p.id));
    if (platforms.size !== g.platforms.length || ids.size !== g.platforms.length)
      throw Error('Duplicate platform');
    for (const p of g.platforms)
      if (
        p.durability > platformMaxHP(p) ||
        (p.anchor && (p.y !== 0 || p.x < -3 || p.x > 2 || p.z < -3 || p.z > 2)) ||
        (p.kind !== undefined && !isPlatform(p.kind))
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
      if (isLink(b) && !platforms.has(key(b.origin))) throw Error('Missing member foundation');
      if (
        g.vertical &&
        volume(b, b.origin).some((c) => floorOf(c) < 0 && Math.abs(c.x) <= 2 && Math.abs(c.z) <= 2)
      )
        throw Error('Rock volume');
      if (b.y !== floorOf(b.origin)) throw Error('Mismatched floor');
      if ((b.pitch || b.roll) && !['beam', 'truss'].includes(b.kind))
        throw Error('Invalid rotation');
      if (
        isLink(b) &&
        segments(b, b.origin)
          .flat()
          .some((c) => !inBounds(c))
      )
        throw Error('Invalid member');
      for (const c of volume(b, b.origin)) {
        const k = key(c);
        if (
          occupied.has(k) ||
          (!isLink(b) &&
            ((floorOf(c) === b.y && !platforms.has(k)) ||
              (floorOf(c) !== b.y && platforms.has(k)))) ||
          !inBounds(c) ||
          (c.x === 0 && c.z === 0)
        )
          throw Error('Invalid occupancy ' + b.kind + ' ' + k);
        occupied.add(k);
      }
    }
    if (
      Object.keys(g.structure.edges).length > 6000 ||
      Object.keys(g.structure.lifts).length > VERTICAL.maxBuildings
    )
      throw Error('Too many records');
    for (const [id, e] of Object.entries(g.structure.edges)) {
      const [a, b, ...rest] = id.split('|');
      if (rest.length || !platforms.has(a) || !platforms.has(b) || id !== edgeKey(a, b))
        throw Error('Invalid edge');
      const ac = parseKey(a),
        bc = parseKey(b);
      if (
        floorOf(ac) !== floorOf(bc) ||
        Math.abs(ac.x - bc.x) + Math.abs(ac.z - bc.z) !== 1 ||
        e.durability > 100 + e.reinforcement * 100
      )
        throw Error('Invalid connection');
    }
    for (const id of Object.keys(g.structure.lifts))
      if (!g.buildings.some((b) => String(b.id) === id && isLift(b.kind)))
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
    if (!g.city.enabled && g.population > analyze(g).capacity) throw Error('Invalid population');
    if (g.city.enabled) {
      const inv = inventory(g),
        total =
          Object.values(g.city.residents).reduce((a, b) => a + b, 0) +
          g.city.displaced +
          evacuatedTotal(g);
      if (Math.abs(total - g.population) > 1e-5) throw Error('Population accounting');
      for (const [id, count] of Object.entries(g.city.residents)) {
        const b = g.buildings.find((b) => String(b.id) === id);
        if (!b || count > facility(b).capacity + 1e-6 || !facility(b).capacity)
          throw Error('Invalid residents');
      }
      for (const [id, stock] of Object.entries(g.city.stocks)) {
        const cap = inv.capacities.get(id);
        if (
          !cap ||
          stock.food > cap.food + 1e-6 ||
          stock.materials > cap.materials + 1e-6 ||
          stock.aether > cap.aether + 1e-6
        )
          throw Error('Invalid stocks');
      }
      for (const [id, amount] of Object.entries(g.city.batteries)) {
        const b = g.buildings.find((b) => String(b.id) === id && isBattery(b.kind));
        if (!b || amount > CITY_RULES.batteryCapacity * (1 + 0.5 * (b.level ?? 0)))
          throw Error('Invalid battery');
      }
      for (const b of g.buildings)
        if ((b.level ?? 0) > OPERATION[b.kind].maxLevel) throw Error('Invalid level');
      if (
        g.city.events.some((e) => e.id >= g.city.nextEventId || e.time > g.elapsed) ||
        new Set(g.city.events.map((e) => e.id)).size !== g.city.events.length
      )
        throw Error('Invalid city event');
    }
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
export function loadGame(slot: 'campaign' | 'lab' | 'city' = 'campaign'): SaveResult {
  try {
    const raw = localStorage.getItem(
      slot === 'city' ? RULES.citySaveKey : slot === 'lab' ? RULES.labSaveKey : RULES.saveKey,
    );
    const result = decodeSave(
      raw ??
        localStorage.getItem(
          slot === 'city'
            ? RULES.phase5CitySaveKey
            : slot === 'lab'
              ? RULES.phase5LabSaveKey
              : RULES.phase5SaveKey,
        ) ??
        localStorage.getItem(
          slot === 'city'
            ? RULES.phase3CitySaveKey
            : slot === 'lab'
              ? RULES.phase3LabSaveKey
              : RULES.phase3SaveKey,
        ) ??
        (slot === 'campaign'
          ? (localStorage.getItem(RULES.phase2SaveKey) ?? localStorage.getItem(RULES.legacySaveKey))
          : slot === 'lab'
            ? localStorage.getItem(RULES.phase2LabSaveKey)
            : null),
    );
    if (
      result.ok &&
      (slot === 'lab'
        ? result.game.mode !== 'lab'
        : slot === 'city'
          ? result.game.mode !== 'citylab'
          : ['lab', 'citylab'].includes(result.game.mode))
    )
      return { ok: false, reason: 'corrupt' };
    return result;
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
export function saveGame(g: Game): boolean {
  if (g.world) return false;
  try {
    if (!decodeSave(JSON.stringify(g)).ok) return false;
    localStorage.setItem(
      g.disaster?.mode === 'lab'
        ? RULES.disasterSaveKey
        : g.disaster?.mode === 'survival'
          ? RULES.survivalSaveKey
          : g.vertical && g.mode === 'citylab'
            ? RULES.verticalSaveKey
            : g.mode === 'citylab'
              ? RULES.citySaveKey
              : g.mode === 'lab'
                ? RULES.labSaveKey
                : RULES.saveKey,
      JSON.stringify(g),
    );
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

export function loadVertical(): SaveResult {
  try {
    const r = decodeSave(
      localStorage.getItem(RULES.verticalSaveKey) ??
        localStorage.getItem(RULES.phase5VerticalSaveKey),
    );
    return r.ok &&
      (!r.game.vertical || !!r.game.disaster || r.game.mode !== 'citylab' || r.game.campaign)
      ? { ok: false, reason: 'corrupt' }
      : r;
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export function loadDisaster(mode: 'lab' | 'survival'): SaveResult {
  try {
    const r = decodeSave(
      localStorage.getItem(mode === 'lab' ? RULES.disasterSaveKey : RULES.survivalSaveKey),
    );
    return r.ok && (r.game.disaster?.mode !== mode || r.game.mode !== 'citylab' || r.game.campaign)
      ? { ok: false, reason: 'corrupt' }
      : r;
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
