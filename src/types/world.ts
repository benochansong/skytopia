import type { Game } from './game';
export const REGIONS = ['firstSky', 'emerald', 'iron', 'frozen', 'aether', 'lostHeavens'] as const;
export type Region = (typeof REGIONS)[number];
export const SPECIALTIES = [
  'mixed',
  'agriculture',
  'industry',
  'energy',
  'research',
  'residential',
  'trade',
] as const;
export type Specialty = (typeof SPECIALTIES)[number];
export const SHIP_TYPES = [
  'scout',
  'explorer',
  'lightCargo',
  'heavyCargo',
  'colony',
  'rescue',
  'research',
] as const;
export type ShipType = (typeof SHIP_TYPES)[number];
export const CARGO_TYPES = [
  'food',
  'materials',
  'aether',
  'metal',
  'pureAether',
  'ancientAlloy',
  'data',
  'passengers',
] as const;
export type CargoType = (typeof CARGO_TYPES)[number];
export type RareStock = Record<'metal' | 'pureAether' | 'ancientAlloy' | 'data', number>;
export type Island = {
  id: string;
  name: string;
  region: Region;
  x: number;
  y: number;
  radius: number;
  rockMass: number;
  lift: number;
  fertility: number;
  mineral: number;
  aether: number;
  temperature: number;
  wind: number;
  risk: number;
  ruins: boolean;
  discovered: boolean;
  visited: boolean;
  artifact: 'unseen' | 'recorded' | 'recovered';
  colonyCost: number;
};
export type WorldContext = {
  region: Region;
  specialty: Specialty;
  techs: string[];
  bridgeMass: number;
  massOffset?: number;
  liftOffset?: number;
  blockTime?: number;
  disasterFrequency?: number;
};
export type CityRecord = {
  id: string;
  island: string;
  name: string;
  specialty: Specialty;
  pending: number;
  game: Game;
  rare: RareStock;
  camera: { position: [number, number, number]; target: [number, number, number] } | null;
};
export type Cargo = Partial<Record<CargoType, number>>;
export type Ship = {
  id: string;
  type: ShipType;
  home: string;
  location: string;
  hp: number;
  fuel: number;
  state:
    | 'building'
    | 'docked'
    | 'loading'
    | 'departing'
    | 'sailing'
    | 'avoiding'
    | 'approach'
    | 'unloading'
    | 'repairing'
    | 'returning';
  remaining: number;
  cargo: Cargo;
  trip: null | {
    id: string;
    from: string;
    to: string;
    distance: number;
    progress: number;
    task: 'trade' | 'explore' | 'colonize' | 'rescue' | 'passengers';
    route: string | null;
    charterCredits: number;
    risk: boolean;
    artifact: 'recover' | 'record';
    returning: boolean;
  };
};
export type TradeRoute = {
  id: string;
  from: string;
  to: string;
  resource: CargoType;
  amount: number;
  reserve: number;
  target: number;
  ship: string;
  interval: number;
  next: number;
  priority: number;
  allowRisk: boolean;
  enabled: boolean;
  delivered: number;
};
export type SkyBridge = {
  id: string;
  from: string;
  to: string;
  hp: number;
  resource: CargoType;
  cargo: number;
  remaining: number;
  delivered: number;
};
export type WorldState = {
  version: 1;
  name: string;
  seed: number;
  mode: 'civilization' | 'lab' | 'campaign';
  example: 'A' | 'B' | 'C' | 'D' | 'E';
  active: string;
  capital: string;
  view: 'city' | 'map';
  inspected: string[];
  colonyTarget: string | null;
  clock: number;
  accumulator: number;
  nextId: number;
  config: {
    maxCities: number;
    size: number;
    resources: number;
    researchSpeed: number;
    disasters: number;
    tradeDifficulty: number;
    blockTime: number;
  };
  islands: Island[];
  cities: CityRecord[];
  ships: Ship[];
  routes: TradeRoute[];
  bridges: SkyBridge[];
  research: {
    points: number;
    completed: string[];
    active: null | { id: string; remaining: number; city: string };
  };
  ledger: {
    id: string;
    from: string;
    to: string;
    resource: CargoType;
    amount: number;
    time: number;
  }[];
  stats: {
    explored: number;
    colonies: number;
    deliveries: number;
    food: number;
    materials: number;
    rescued: number;
    recovered: number;
  };
  ending: { scene: number; seen: boolean; continued: boolean };
  notice: string;
};
