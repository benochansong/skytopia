import { BASE_STORAGE, cityDifficulty } from '../../data/cityRules';
import type { CityState, Stock } from '../../types/city';
import type { Game } from '../../types/game';
export const emptyStock = (): Stock => ({ food: 0, materials: 0, aether: 0 });
export function freshCity(
  enabled = false,
  materials = 100,
  difficulty: Game['difficulty'] = 'normal',
): CityState {
  return {
    enabled,
    unlimited: false,
    example: 'A',
    speed: 1,
    accumulator: 0,
    economyClock: 0,
    migrationClock: 0,
    dayTime: 90,
    credits: difficulty === 'easy' ? 650 : difficulty === 'hard' ? 300 : 500,
    stocks: {
      core: { food: Math.min(BASE_STORAGE.food, enabled ? 180 : 100), materials, aether: 30 },
    },
    batteries: {},
    residents: { '1': 2 },
    displaced: 0,
    shelterTime: 0,
    happiness: 72,
    hungerTime: 0,
    blackoutTime: 0,
    distressTime: 0,
    grace: cityDifficulty[difficulty].grace,
    tier: 1,
    rewardedTier: 1,
    missionRewarded: false,
    arrivals: 0,
    departures: 0,
    activity: {},
    orders: [],
    orderCooldown: 0,
    aidUses: 0,
    foodCooldown: 0,
    powerBoost: 0,
    powerCooldown: 0,
    events: [],
    nextEventId: 1,
    dismissed: {},
    lastCollapsed: 0,
  };
}
export function cityEvent(g: Game, kind: CityState['events'][number]['kind'], value = 0): Game {
  return {
    ...g,
    city: {
      ...g.city,
      nextEventId: g.city.nextEventId + 1,
      events: [...g.city.events, { id: g.city.nextEventId, time: g.elapsed, kind, value }].slice(
        -32,
      ),
    },
  };
}
