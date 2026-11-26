import { z } from 'zod';
import { BLOCKS, DEFAULT_SETTINGS, RULES } from '../data/rules';
import type { Game, Settings } from '../types/game';
import { cellsOf, key, neighbors } from './grid';
import { analyze } from './analysis';
const finite = z.number().finite();
const coord = finite.int().min(RULES.min).max(RULES.max);
const cell = z.object({ x: coord, z: coord });
const kind = z.enum(['platform', 'home', 'power', 'road', 'farm', 'park']);
const piece = z
  .object({
    kind,
    shape: z.enum(['single', 'I', 'L', 'T', 'O', 'S']),
    rotation: z.number().int().min(0).max(3),
  })
  .refine((p) => BLOCKS[p.kind].shapes.includes(p.shape));
export const settingsSchema = z.object({
  language: z.enum(['ko', 'en']),
  sound: z.boolean(),
  shadows: z.boolean(),
  reducedMotion: z.boolean(),
});
const schema = z.object({
  version: z.literal(1),
  mode: z.enum(['mission', 'training']),
  platforms: z
    .array(
      cell.extend({
        y: z.literal(0),
        variant: z.enum(['grass', 'rock', 'metal']),
        mass: finite.positive().max(5),
        durability: finite.min(0).max(100),
      }),
    )
    .min(36)
    .max(256),
  buildings: z
    .array(
      z.object({
        id: finite.int().positive(),
        kind: kind.exclude(['platform']),
        shape: z.enum(['single', 'I', 'L', 'T', 'O', 'S']),
        rotation: finite.int().min(0).max(3),
        origin: cell,
        y: z.literal(0),
        initial: z.boolean(),
      }),
    )
    .min(5)
    .max(255),
  active: piece,
  next: z.array(piece).length(3),
  hold: piece.nullable(),
  holdUsed: z.boolean(),
  cursor: cell,
  supply: z.object({
    seed: finite.int().min(0).max(4294967295),
    bag: z.array(kind).max(9),
    draws: finite.int().min(4),
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
export type SaveResult =
  | { ok: true; game: Game }
  | { ok: false; reason: 'empty' | 'corrupt' | 'unavailable' };
export function decodeSave(raw: string | null): SaveResult {
  if (!raw) return { ok: false, reason: 'empty' };
  try {
    const g = schema.parse(JSON.parse(raw)) as Game;
    const platforms = new Set(g.platforms.map(key));
    if (platforms.size !== g.platforms.length) throw Error('Duplicate platform');
    for (let x = -3; x <= 2; x++)
      for (let z = -3; z <= 2; z++)
        if (!platforms.has(key({ x, z }))) throw Error('Missing foundation');
    const reached = new Set<string>(),
      queue = [{ x: 0, z: 0 }];
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i],
        k = key(c);
      if (reached.has(k) || !platforms.has(k)) continue;
      reached.add(k);
      queue.push(...neighbors(c));
    }
    if (reached.size !== platforms.size) throw Error('Detached platform');
    const occupied = new Set<string>(),
      ids = new Set<number>();
    for (const b of g.buildings) {
      if (ids.has(b.id) || b.id >= g.nextId || !BLOCKS[b.kind].shapes.includes(b.shape))
        throw Error('Invalid building');
      ids.add(b.id);
      for (const c of cellsOf(b, b.origin)) {
        const k = key(c);
        if (occupied.has(k) || !platforms.has(k) || k === '0,0') throw Error('Invalid occupancy');
        occupied.add(k);
      }
    }
    const initial = g.buildings.filter((b) => b.initial);
    if (
      initial.length !== 5 ||
      !initial.some((b) => b.kind === 'home') ||
      !initial.some((b) => b.kind === 'power') ||
      initial.filter((b) => b.kind === 'road').length !== 3
    )
      throw Error('Invalid initial city');
    // A historical win remains valid after free building; capacity must still be sane.
    if (g.population > analyze(g).capacity) throw Error('Invalid population');
    return { ok: true, game: g };
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}
export function loadGame(): SaveResult {
  try {
    return decodeSave(localStorage.getItem(RULES.saveKey));
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
export function saveGame(game: Game): boolean {
  try {
    localStorage.setItem(RULES.saveKey, JSON.stringify(game));
    return true;
  } catch {
    return false;
  }
}
export function loadSettings(): Settings {
  try {
    const parsed = settingsSchema.safeParse(
      JSON.parse(localStorage.getItem(RULES.settingsKey) || 'null'),
    );
    return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS };
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
