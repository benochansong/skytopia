export type Kind =
  | 'platform'
  | 'home'
  | 'power'
  | 'road'
  | 'farm'
  | 'park'
  | 'metalPlatform'
  | 'largeHome'
  | 'factory'
  | 'liftSmall'
  | 'liftLarge'
  | 'brace'
  | 'ballast';
export type Shape = 'single' | 'I' | 'L' | 'T' | 'O' | 'S';
export type Cell = { x: number; z: number };
export type Piece = { kind: Kind; shape: Shape; rotation: number };
export type Platform = Cell & {
  id: string;
  y: 0;
  variant: 'grass' | 'rock' | 'metal';
  mass: number;
  durability: number;
  material: 'basic' | 'metal';
  reinforcement: number;
  anchor: boolean;
};
export type Building = Piece & {
  id: number;
  origin: Cell;
  y: 0;
  initial: boolean;
  durability: number;
  enabled: boolean;
};
export type Supply = { seed: number; bag: Kind[]; draws: number; policy?: 'classic' | 'adaptive' };
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Target = { type: 'platform' | 'edge' | 'building'; id: string };
export type EdgeState = { durability: number; reinforcement: number };
export type LiftState = { factor: number; outage: number };
export type EventKind =
  | 'crack'
  | 'edgeFailed'
  | 'collapse'
  | 'powerLost'
  | 'liftFading'
  | 'repair'
  | 'reinforce'
  | 'emergency'
  | 'recovered'
  | 'critical'
  | 'demolish';
export type StructureEvent = {
  id: number;
  time: number;
  kind: EventKind;
  target: string;
  cell: Cell;
  platforms: Platform[];
  buildings: Building[];
};
export type StructureState = {
  edges: Record<string, EdgeState>;
  lifts: Record<string, LiftState>;
  coreDurability: number;
  accumulator: number;
  grace: number;
  criticalTime: number;
  pending: string[];
  events: StructureEvent[];
  nextEventId: number;
  emergency: { cell: Cell; remaining: number; cooldown: number };
  repairs: { target: Target; remaining: number }[];
  repairsDone: number;
  reinforcementsDone: number;
  collapsedCount: number;
  maxCitySize: number;
  loss: null | { reason: 'lift' | 'balance' | 'core'; time: number; firstFailure: string };
};
export type Settings = {
  language: 'ko' | 'en';
  sound: boolean;
  shadows: boolean;
  reducedMotion: boolean;
  difficulty: Difficulty;
  musicVolume: number;
  effectsVolume: number;
  warningVolume: number;
};
export type Game = {
  version: 2;
  mode: 'mission' | 'training' | 'lab';
  missionId: 1 | 2 | 3 | 4;
  missionHold: number;
  baselineSeparation: number;
  labExample: 'A' | 'B' | 'C' | 'D';
  labPaused: boolean;
  difficulty: Difficulty;
  structure: StructureState;
  reservedActive: Piece | null;
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
  | 'balanceWarning'
  | 'overloadWarning'
  | 'criticalWarning'
  | 'resourcesNeeded'
  | 'settling'
  | 'reinforcementLimit';
export type Placement = {
  valid: boolean;
  warning: boolean;
  reason: PlacementReason;
  cells: Cell[];
  risk: 0 | 1 | 2 | 3;
};
export type Stats = {
  mass: number;
  center: Cell;
  stability: number;
  lift: number;
  capacity: number;
  poweredCapacity: number;
  powerRatios: Map<number, number>;
  power: number;
  demand: number;
  disconnected: number;
  connectedIds: Set<number>;
  roads: Set<string>;
  homes: number;
  addedPower: number;
  expansion: number;
  food: number;
  structural: import('../game/stability/types').StructuralReport;
};
