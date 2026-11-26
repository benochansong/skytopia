import { z } from 'zod';
import { BLOCKS, KINDS, VERTICAL_KINDS, DISASTER_KINDS, SHAPES } from '../../data/rules';
const n = z.number().finite().nonnegative(),
  record = z.record(n).refine((r) => Object.keys(r).length <= 1200),
  stock = z.object({ food: n, materials: n, aether: n });
export const citySchema = z.object({
  enabled: z.boolean(),
  unlimited: z.boolean(),
  example: z.enum(['A', 'B', 'C', 'D', 'E']),
  speed: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  accumulator: n.max(0.25),
  economyClock: n.max(1),
  migrationClock: n.max(5),
  dayTime: n.max(360),
  credits: n,
  stocks: z.record(stock).refine((r) => Object.keys(r).length <= 1200 && !!r.core),
  batteries: record,
  residents: record,
  displaced: n,
  shelterTime: n,
  happiness: n.max(100),
  hungerTime: n,
  blackoutTime: n,
  distressTime: n,
  grace: n.max(80),
  tier: n.int().min(1).max(6),
  rewardedTier: n.int().min(1).max(6),
  missionRewarded: z.boolean(),
  arrivals: n,
  departures: n,
  activity: z.record(n.max(1)).refine((r) => Object.keys(r).length <= 1200),
  orders: z
    .array(
      z.object({
        piece: z
          .object({
            kind: z.enum([...KINDS, ...VERTICAL_KINDS, ...DISASTER_KINDS] as [
              (typeof KINDS)[number],
              ...(typeof KINDS)[number][],
            ]),
            shape: z.enum(Object.keys(SHAPES) as [keyof typeof SHAPES, ...(keyof typeof SHAPES)[]]),
            rotation: n.int().max(3),
          })
          .refine((p) => BLOCKS[p.kind].shapes.includes(p.shape)),
        remaining: n.max(18),
      }),
    )
    .max(2),
  orderCooldown: n.max(25),
  aidUses: n.int().max(3),
  foodCooldown: n.max(60),
  powerBoost: n.max(20),
  powerCooldown: n.max(90),
  events: z
    .array(
      z.object({
        id: n.int().positive(),
        time: n,
        kind: z.enum([
          'shortage',
          'recovery',
          'tier',
          'migration',
          'upgrade',
          'delivery',
          'storageLoss',
          'aid',
        ]),
        value: z.number().finite(),
      }),
    )
    .max(32),
  nextEventId: n.int().positive(),
  dismissed: z.record(n).refine((r) => Object.keys(r).length <= 16),
  lastCollapsed: n.int(),
});
