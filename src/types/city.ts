import type { Cell, Kind, Piece } from './game';
export type Resource = 'food' | 'materials' | 'aether';
export type Stock = Record<Resource, number>;
export type CityState = {
  enabled: boolean;
  unlimited: boolean;
  example: 'A' | 'B' | 'C' | 'D' | 'E';
  speed: 0 | 1 | 2 | 3;
  accumulator: number;
  economyClock: number;
  migrationClock: number;
  dayTime: number;
  credits: number;
  stocks: Record<string, Stock>;
  batteries: Record<string, number>;
  residents: Record<string, number>;
  displaced: number;
  shelterTime: number;
  happiness: number;
  hungerTime: number;
  blackoutTime: number;
  distressTime: number;
  grace: number;
  tier: number;
  rewardedTier: number;
  missionRewarded: boolean;
  arrivals: number;
  departures: number;
  activity: Record<string, number>;
  orders: { piece: Piece; remaining: number }[];
  orderCooldown: number;
  aidUses: number;
  foodCooldown: number;
  powerBoost: number;
  powerCooldown: number;
  events: {
    id: number;
    time: number;
    kind:
      | 'shortage'
      | 'recovery'
      | 'tier'
      | 'migration'
      | 'upgrade'
      | 'delivery'
      | 'storageLoss'
      | 'aid';
    value: number;
  }[];
  nextEventId: number;
  dismissed: Record<string, number>;
  lastCollapsed: number;
};
export type OperationStatus =
  | 'running'
  | 'paused'
  | 'road'
  | 'power'
  | 'workers'
  | 'input'
  | 'damage'
  | 'storage'
  | 'empty';
export type Operation = {
  id: number;
  kind: Kind;
  road: string | null;
  powerGrid: string | null;
  workers: number;
  jobs: number;
  power: number;
  demand: number;
  efficiency: number;
  status: OperationStatus;
  food: number;
  materials: number;
  aether: number;
  income: number;
  upkeep: number;
  condition: number;
  environment: number;
};
export type GridNetwork = {
  groups: Map<string, Set<string>>;
  of: Map<string, string>;
  attachments: Map<number, string>;
  edges: [Cell, Cell][];
  root: string | null;
};
export type CityReport = {
  roads: GridNetwork;
  powerGrid: GridNetwork;
  operations: Map<number, Operation>;
  stocks: Stock;
  capacity: Stock;
  poolStocks: Map<string, Stock>;
  poolCapacity: Map<string, Stock>;
  storageGroups: Map<string, string>;
  workforce: number;
  employed: number;
  unemployed: number;
  availableHousing: number;
  housing: number;
  generation: number;
  connectedGeneration: number;
  demand: number;
  supplied: number;
  deficit: number;
  battery: number;
  foodProduction: number;
  foodConsumption: number;
  materialsProduction: number;
  aetherProduction: number;
  income: number;
  expense: number;
  net: number;
  foodETA: number;
  creditETA: number;
  happinessTarget: number;
  factors: { code: string; value: number }[];
  environment: Map<number, number>;
  tierEligible: number;
  advice: { id: string; priority: number; value: number; cell?: Cell }[];
};
