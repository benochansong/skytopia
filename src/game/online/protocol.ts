import { z } from 'zod';
import { RULES, VERTICAL } from '../../data/rules';
import type { Game, Piece } from '../../types/game';
const coord = z.number().int().min(RULES.min).max(RULES.max);
const cell = z
  .object({
    x: coord,
    z: coord,
    y: z.number().int().min(VERTICAL.min).max(VERTICAL.max).default(0),
  })
  .strict();
const target = z
  .object({ type: z.enum(['building', 'platform', 'edge']), id: z.string().min(1).max(70) })
  .strict();
const rotation = z.number().int().min(0).max(3);
export const actionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('place'),
      hand: z.number().int().nonnegative(),
      cell,
      rotation,
      pitch: rotation.default(0),
      roll: rotation.default(0),
    })
    .strict(),
  z.object({ type: z.literal('hold'), hand: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('recycle'), hand: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('repair'), target }).strict(),
  z.object({ type: z.literal('reinforce'), target }).strict(),
  z.object({ type: z.literal('demolish'), target }).strict(),
  z.object({ type: z.literal('upgrade'), id: z.number().int().positive() }).strict(),
  z.object({ type: z.literal('emergency'), cell }).strict(),
  z.object({ type: z.literal('food') }).strict(),
  z.object({ type: z.literal('power') }).strict(),
]);
export type Action = z.infer<typeof actionSchema>;
export const roomOptions = z
  .object({
    name: z.string().trim().min(1).max(32),
    mode: z.enum(['duel', 'coop']),
    public: z.boolean(),
    seconds: z.union([z.literal(600), z.literal(900)]),
    disaster: z.boolean(),
    spectators: z.boolean(),
  })
  .strict();
export type RoomOptions = z.infer<typeof roomOptions>;
export const commandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('auth'),
      token: z.string().max(100).optional(),
      name: z.string().trim().min(1).max(20),
      version: z.literal(1),
    })
    .strict(),
  z.object({ type: z.literal('create'), options: roomOptions }).strict(),
  z
    .object({
      type: z.literal('join'),
      code: z.string().regex(/^[A-Z0-9]{8}$/),
      spectator: z.boolean().default(false),
    })
    .strict(),
  z.object({ type: z.literal('ready'), ready: z.boolean() }).strict(),
  z.object({ type: z.literal('start') }).strict(),
  z.object({ type: z.literal('leave') }).strict(),
  z.object({ type: z.literal('queue'), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('list') }).strict(),
  z.object({ type: z.literal('resync') }).strict(),
  z.object({ type: z.literal('history') }).strict(),
  z.object({ type: z.literal('surrender') }).strict(),
  z
    .object({
      type: z.literal('ping'),
      cell,
      kind: z.enum(['build', 'repair', 'danger', 'thanks']),
    })
    .strict(),
  z
    .object({
      type: z.literal('action'),
      match: z.string().uuid(),
      id: z.string().uuid(),
      seq: z.number().int().positive(),
      action: actionSchema,
    })
    .strict(),
  z.object({ type: z.literal('heartbeat'), sent: z.number().finite() }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type Member = { id: string; name: string; ready: boolean; connected: boolean };
export type Score = {
  total: number;
  parts: number[];
  stability: number;
  efficiency: number;
  objectives: number;
};
export type Result = {
  /** Absent in legacy results: rules v1. */
  rulesVersion?: number;
  id: string;
  version: 1;
  mode: RoomOptions['mode'];
  reason: string;
  winner: string | null;
  at: string;
  players: { id: string; name: string; score: Score }[];
};
export type HandView = {
  recycleAt: number;
  token: number;
  active: Piece;
  next: Piece[];
  hold: Piece | null;
  holdUsed: boolean;
  remaining: number;
};
export type RoomView = {
  rulesVersion?: number;
  match: string;
  code: string;
  options: RoomOptions;
  host: string;
  members: Member[];
  spectators: number;
  phase: 'lobby' | 'countdown' | 'playing' | 'ended';
  remaining: number;
  countdown: number;
  paused: boolean;
  goalHold: number;
  result: Result | null;
  lastSeq: number;
  hand: HandView | null;
  scores: Score[];
  pings: { by: string; kind: string; cell: z.infer<typeof cell>; until: number }[];
};
export type Snapshot = { type: 'state'; revision: number; room: RoomView; games: Game[] };
export type ServerMessage =
  | Snapshot
  | { type: 'patch'; revision: number; base: number; room: RoomView; games: Partial<Game>[] }
  | { type: 'welcome'; id: string; token: string; name: string }
  | { type: 'error'; code: string }
  | { type: 'ack'; id: string; ok: boolean; code: string; seq: number }
  | {
      type: 'rooms';
      rooms: { code: string; name: string; mode: string; players: number; phase: string }[];
      queued: boolean;
    }
  | { type: 'left' }
  | { type: 'history'; results: Result[] }
  | { type: 'heartbeat'; sent: number };
