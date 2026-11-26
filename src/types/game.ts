export type Kind = 'platform' | 'home' | 'power' | 'road' | 'farm' | 'park';
export type Shape = 'single' | 'I' | 'L' | 'T' | 'O' | 'S';
export type Cell = { x: number; z: number };
export type Piece = { kind: Kind; shape: Shape; rotation: number };
export type Platform = Cell & {
  y: 0;
  variant: 'grass' | 'rock' | 'metal';
  mass: number;
  durability: number;
};
export type Building = Piece & { id: number; origin: Cell; y: 0; initial: boolean };
export type Supply = { seed: number; bag: Kind[]; draws: number };
export type Settings = {
  language: 'ko' | 'en';
  sound: boolean;
  shadows: boolean;
  reducedMotion: boolean;
};
export type Game = {
  version: 1;
  mode: 'mission' | 'training';
  platforms: Platform[];
  buildings: Building[];
  active: Piece;
  next: Piece[];
  hold: Piece | null;
  holdUsed: boolean;
  cursor: Cell;
  supply: Supply;
  population: number;
  resources: number;
  score: number;
  elapsed: number;
  remaining: number;
  nextId: number;
  won: boolean;
  tutorial: number;
  settings: Settings;
};
export type PlacementReason =
  | 'ready'
  | 'overlap'
  | 'missingPlatform'
  | 'disconnectedPlatform'
  | 'bounds'
  | 'core'
  | 'connectionWarning'
  | 'balanceWarning';
export type Placement = {
  valid: boolean;
  warning: boolean;
  reason: PlacementReason;
  cells: Cell[];
};
export type Stats = {
  mass: number;
  center: Cell;
  stability: number;
  lift: number;
  capacity: number;
  poweredCapacity: number;
  power: number;
  demand: number;
  disconnected: number;
  connectedIds: Set<number>;
  roads: Set<string>;
  homes: number;
  addedPower: number;
  expansion: number;
  food: number;
};
