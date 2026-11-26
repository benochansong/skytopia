import type { Building, Cell, Platform, Target } from './game';

export const HAZARDS = [
  'wind',
  'storm',
  'thunder',
  'meteor',
  'aether',
  'cold',
  'heat',
  'gravity',
  'compound',
] as const;
export type Hazard = (typeof HAZARDS)[number];
export const POLICIES = ['normal', 'power', 'conserve', 'defense', 'evacuate', 'recovery'] as const;
export type Policy = (typeof POLICIES)[number];
export type WeatherKind =
  | 'clear'
  | 'cloudy'
  | 'breeze'
  | 'rain'
  | 'fog'
  | 'wind'
  | 'thunder'
  | 'cold'
  | 'heat'
  | 'aether';
export type DisasterView =
  | 'off'
  | 'wind'
  | 'risk'
  | 'impact'
  | 'shield'
  | 'aether'
  | 'evacuation'
  | 'damage'
  | 'recovery';
export type Weather = {
  kind: WeatherKind;
  direction: number;
  wind: number;
  temperature: number;
  clouds: number;
  rain: number;
  lightning: number;
  instability: number;
};
export type Impact = {
  id: string;
  at: number;
  cell: Cell;
  kind: 'meteor' | 'lightning';
  power: number;
  radius: number;
};
export type Threat = {
  id: number;
  kind: Hazard;
  level: number;
  direction: number;
  wind: number;
  duration: number;
  warning: number;
  recovery: number;
  target: Cell;
  impacts: Impact[];
};
export type DisasterSnapshot = {
  population: number;
  stability: number;
  buildings: number;
  platforms: number;
  mass: number;
  lift: number;
  generation: number;
  food: number;
  materials: number;
  credits: number;
  resilience: number;
};
export type DisasterReport = {
  id: number;
  kind: Hazard;
  level: number;
  duration: number;
  before: DisasterSnapshot;
  after: DisasterSnapshot;
  damaged: number;
  collapsed: number;
  members: number;
  protected: number;
  absorbed: number;
  evacuated: number;
  repairs: number;
  repairCost: number;
};
export type Evacuees = { home: number; shelter: number; count: number };
export type RecoveryBlueprint = {
  id: string;
  cell: Cell;
  piece: Pick<Building, 'kind' | 'shape' | 'rotation' | 'pitch' | 'roll'>;
};
export type DisasterState = {
  version: 1;
  mode: 'lab' | 'survival' | 'campaign' | 'free';
  setting: 'off' | 'weather' | 'low' | 'normal' | 'high' | 'custom';
  seed: number;
  initialSeed: number;
  nextId: number;
  phase: 'calm' | 'forecast' | 'active' | 'recovery';
  clock: number;
  weatherClock: number;
  weather: Weather;
  threat: Threat | null;
  policy: Policy;
  view: DisasterView;
  ready: number[];
  shields: Record<string, number>;
  outages: Record<string, number>;
  evacuated: Evacuees[];
  applied: string[];
  effects: { id: string; kind: 'meteor' | 'lightning' | 'shield'; cell: Cell; age: number }[];
  baseline: {
    tallies: { absorbed: number; protected: number; repairs: number };
    snapshot: DisasterSnapshot;
    buildings: Building[];
    platforms: Platform[];
  } | null;
  blueprints: RecoveryBlueprint[];
  reports: DisasterReport[];
  stats: {
    completed: number;
    storms: number;
    aether: number;
    absorbed: number;
    intercepted: number;
    lightningProtected: number;
    evacuated: number;
    repaired: number;
    peakPopulation: number;
    completedWaves: number;
  };
  wave: number;
  reward: number | null;
  claimed: number[];
  score: number;
  emergencyCooldown: number;
  repairClock: number;
  repairTarget: Target | null;
  autoRepair: boolean;
  defenses: boolean;
  example: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  config: {
    kind: Hazard;
    level: number;
    direction: number;
    wind: number;
    duration: number;
    target: Cell;
  };
};
