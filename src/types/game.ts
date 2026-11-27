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
  | 'ballast'
  | 'apartment'
  | 'housingEstate'
  | 'advancedPower'
  | 'relay'
  | 'powerLink'
  | 'aetherPower'
  | 'battery'
  | 'greenhouse'
  | 'hydroponics'
  | 'workshop'
  | 'manufacturer'
  | 'refinery'
  | 'warehouse'
  | 'logisticsDepot'
  | 'granary'
  | 'aetherStore'
  | 'plaza'
  | 'clinic'
  | 'shop'
  | 'deck'
  | 'metalDeck'
  | 'gardenDeck'
  | 'suspendedDeck'
  | 'column'
  | 'reinforcedColumn'
  | 'industrialColumn'
  | 'aetherColumn'
  | 'beam'
  | 'truss'
  | 'diagonal'
  | 'hanger'
  | 'bridge'
  | 'roadBridge'
  | 'reinforcedBridge'
  | 'archBridge'
  | 'suspensionBridge'
  | 'aetherBridge'
  | 'stairs'
  | 'elevator'
  | 'cargoElevator'
  | 'aetherElevator'
  | 'verticalRelay'
  | 'powerDistributor'
  | 'skyGarden'
  | 'towerHome'
  | 'observatory'
  | 'weatherStation'
  | 'weatherTower'
  | 'windbreak'
  | 'reinforcedWindbreak'
  | 'lightningRod'
  | 'lightningTower'
  | 'surgeRelay'
  | 'shieldSmall'
  | 'shieldLarge'
  | 'stabilizer'
  | 'emergencyBattery'
  | 'emergencyGranary'
  | 'shelter'
  | 'repairCenter'
  | 'climateControl'
  | 'portSmall'
  | 'port'
  | 'portLarge'
  | 'explorationPort'
  | 'shipyard'
  | 'shipMaintenance'
  | 'internationalWarehouse'
  | 'metalRefinery'
  | 'advancedAetherRefinery'
  | 'researchLab'
  | 'artifactAnalysis'
  | 'worldObservatory'
  | 'skybridgeAnchor'
  | 'distributedLiftCore'
  | 'centralControl'
  | 'nexus';
export type Shape =
  | 'single'
  | 'D'
  | 'I'
  | 'L'
  | 'T'
  | 'O'
  | 'S'
  | 'verticalI'
  | 'spatialL'
  | 'step'
  | 'corner3D'
  | 'arch'
  | 'columnPair'
  | 'hanging'
  | 'span'
  | 'multideck';
export type Cell = { x: number; z: number; y?: number };
export type Piece = { kind: Kind; shape: Shape; rotation: number; pitch?: number; roll?: number };
export type Platform = Cell & {
  id: string;
  y: number;
  variant: 'grass' | 'rock' | 'metal';
  mass: number;
  durability: number;
  material: 'basic' | 'metal';
  kind?: Kind;
  reinforcement: number;
  anchor: boolean;
};
export type Building = Piece & {
  id: number;
  origin: Cell;
  y: number;
  initial: boolean;
  durability: number;
  enabled: boolean;
  level?: number;
  priority?: number;
  reinforcement?: number;
  temporary?: number;
};
export type Supply = {
  seed: number;
  bag: Kind[];
  draws: number;
  policy?: 'classic' | 'adaptive';
  version?: 2;
  recent?: Kind[];
};
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
  uxVersion: 1;
  textScale: number;
  highContrast: boolean;
  onboarding: boolean;
  graphicsVersion: 1;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  cloudDensity: number;
  controlsVersion: 1;
  repeatDelay: number;
  repeatInterval: number;
  smartSnap: boolean;
  rotationAssist: boolean;
  assistance: 'guided' | 'normal' | 'expert';
  cameraSensitivity: number;
  zoomSensitivity: number;
  stormParticles: number;
  reducedFlashes: boolean;
  cameraShake: number;
  disasterCamera: boolean;
  warningScale: number;
  language: 'ko' | 'en';
  sound: boolean;
  shadows: boolean;
  reducedMotion: boolean;
  difficulty: Difficulty;
  musicVolume: number;
  effectsVolume: number;
  warningVolume: number;
  dayNight: boolean;
  citizens: number;
  vehicles: number;
  environment: boolean;
};
export type Game = {
  polish?: {
    version: 1;
    recycleAt: number;
    freeStyle?: 'relaxed' | 'classic' | 'engineering' | 'survival';
  };
  world?: import('./world').WorldState;
  worldContext?: import('./world').WorldContext;
  campaign?: import('./campaign').CampaignRun;
  version: 5;
  disaster?: import('./disaster').DisasterState;
  vertical?: import('./vertical').VerticalState;
  city: import('./city').CityState;
  mode: 'mission' | 'training' | 'lab' | 'citylab';
  missionId: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
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
  | 'reinforcementLimit'
  | 'noSupport'
  | 'verticalLocked'
  | 'volumeOverlap'
  | 'descentBlocked'
  | 'invalidEndpoint'
  | 'rockVolume';
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
