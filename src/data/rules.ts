import type { Cell, Kind, Settings, Shape } from '../types/game';
export const RULES = {
  min: -8,
  max: 7,
  initialMin: -3,
  initialMax: 2,
  fallSeconds: 20,
  lift: 500,
  populationPerSecond: 0.5,
  recycleResources: 2,
  recyclePenalty: 5,
  saveKey: 'skytopia.save.v2',
  legacySaveKey: 'skytopia.save.v1',
  labSaveKey: 'skytopia.lab.v2',
  settingsKey: 'skytopia.settings.v1',
};
export const DEFAULT_SETTINGS: Settings = {
  language: 'ko',
  sound: true,
  shadows: true,
  reducedMotion: false,
  difficulty: 'normal',
  musicVolume: 0,
  effectsVolume: 0.65,
  warningVolume: 0.5,
};
export const SHAPES: Record<Shape, Cell[]> = {
  single: [{ x: 0, z: 0 }],
  I: [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 2, z: 0 },
  ],
  L: [
    { x: 0, z: 0 },
    { x: 0, z: 1 },
    { x: 1, z: 1 },
  ],
  T: [
    { x: 0, z: 0 },
    { x: -1, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
  ],
  O: [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: 1, z: 1 },
  ],
  S: [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 1 },
  ],
};
export const LEGACY_KINDS: Kind[] = ['platform', 'home', 'power', 'road', 'farm', 'park'];
export const KINDS: Kind[] = [
  ...LEGACY_KINDS,
  'metalPlatform',
  'largeHome',
  'factory',
  'liftSmall',
  'liftLarge',
  'brace',
  'ballast',
];
export const BLOCKS: Record<
  Kind,
  {
    ko: string;
    en: string;
    mass: number;
    capacity: number;
    power: number;
    demand: number;
    score: number;
    food: number;
    color: string;
    shapes: Shape[];
  }
> = {
  metalPlatform: {
    ko: '강화 플랫폼',
    en: 'Reinforced platform',
    mass: 12,
    capacity: 0,
    power: 0,
    demand: 0,
    score: 25,
    food: 0,
    color: '#a6b6c2',
    shapes: ['single', 'I', 'O'],
  },
  largeHome: {
    ko: '대형 주거시설',
    en: 'Sky residence',
    mass: 35,
    capacity: 15,
    power: 0,
    demand: 5,
    score: 90,
    food: 0,
    color: '#e9c4a0',
    shapes: ['O'],
  },
  factory: {
    ko: '공장',
    en: 'Factory',
    mass: 60,
    capacity: 0,
    power: 0,
    demand: 8,
    score: 100,
    food: 0,
    color: '#d19b82',
    shapes: ['single', 'O'],
  },
  liftSmall: {
    ko: '소형 부양장치',
    en: 'Small levitator',
    mass: 12,
    capacity: 0,
    power: 0,
    demand: 4,
    score: 60,
    food: 0,
    color: '#75e3f4',
    shapes: ['single'],
  },
  liftLarge: {
    ko: '대형 부양장치',
    en: 'Large levitator',
    mass: 35,
    capacity: 0,
    power: 0,
    demand: 12,
    score: 120,
    food: 0,
    color: '#a6bcff',
    shapes: ['O'],
  },
  brace: {
    ko: '구조 보강재',
    en: 'Structural brace',
    mass: 8,
    capacity: 0,
    power: 0,
    demand: 0,
    score: 20,
    food: 0,
    color: '#eac578',
    shapes: ['single'],
  },
  ballast: {
    ko: '균형추',
    en: 'Counterweight',
    mass: 25,
    capacity: 0,
    power: 0,
    demand: 0,
    score: 20,
    food: 0,
    color: '#9b9ab1',
    shapes: ['single'],
  },
  platform: {
    ko: '플랫폼',
    en: 'Platform',
    mass: 5,
    capacity: 0,
    power: 0,
    demand: 0,
    score: 15,
    food: 0,
    color: '#8bb99a',
    shapes: ['single', 'I', 'L', 'T', 'O', 'S'],
  },
  home: {
    ko: '주거시설',
    en: 'Residence',
    mass: 10,
    capacity: 5,
    power: 0,
    demand: 2,
    score: 50,
    food: 0,
    color: '#eab77c',
    shapes: ['single', 'L', 'O'],
  },
  power: {
    ko: '발전소',
    en: 'Reactor',
    mass: 25,
    capacity: 0,
    power: 20,
    demand: 0,
    score: 60,
    food: 0,
    color: '#6adce6',
    shapes: ['single', 'O'],
  },
  road: {
    ko: '도로',
    en: 'Road',
    mass: 2,
    capacity: 0,
    power: 0,
    demand: 0,
    score: 10,
    food: 0,
    color: '#9babb9',
    shapes: ['single', 'I', 'L', 'T', 'S'],
  },
  farm: {
    ko: '농장',
    en: 'Farm',
    mass: 8,
    capacity: 0,
    power: 0,
    demand: 3,
    score: 35,
    food: 10,
    color: '#c1d879',
    shapes: ['single', 'O'],
  },
  park: {
    ko: '공원',
    en: 'Park',
    mass: 4,
    capacity: 0,
    power: 0,
    demand: 0,
    score: 40,
    food: 0,
    color: '#73c49d',
    shapes: ['single', 'L'],
  },
};

export type PhysicalDefinition = {
  hp: number;
  height: number;
  maxLoad: number;
  linkStrength: number;
  repairCost: number;
  lift: number;
  cost: number;
  importance: number;
};
const physical = (
  hp: number,
  height: number,
  maxLoad: number,
  linkStrength: number,
  repairCost: number,
  lift = 0,
  cost = 30,
  importance = 1,
): PhysicalDefinition => ({
  hp,
  height,
  maxLoad,
  linkStrength,
  repairCost,
  lift,
  cost,
  importance,
});
export const PHYSICAL: Record<Kind, PhysicalDefinition> = {
  platform: physical(100, 0.3, 90, 75, 15, 0, 12),
  metalPlatform: physical(250, 0.4, 220, 180, 25, 0, 25),
  home: physical(80, 0.9, 70, 60, 12),
  largeHome: physical(120, 1.6, 150, 100, 20, 0, 55),
  power: physical(120, 1, 140, 100, 20, 0, 45, 3),
  road: physical(70, 0.1, 80, 70, 8, 0, 8),
  farm: physical(70, 0.5, 65, 55, 10),
  park: physical(60, 0.7, 60, 50, 8),
  factory: physical(160, 1.2, 180, 130, 30, 0, 65),
  liftSmall: physical(100, 1.1, 100, 90, 18, 80, 45, 3),
  liftLarge: physical(180, 1.3, 220, 150, 30, 220, 85, 4),
  brace: physical(200, 0.2, 150, 120, 15, 0, 25, 2),
  ballast: physical(100, 0.5, 100, 80, 15, 0, 20),
};
export const STRUCTURE = {
  step: 0.25,
  islandBaseMass: 80,
  islandCenter: { x: 0, y: -1, z: 0 },
  stiffness: 4500,
  maxTilt: 25,
  coreHP: 500,
  coreLift: 500,
  linkHP: 100,
  braceMass: 8,
  braceHP: 100,
  braceCapacity: 0.85,
  maxReinforcement: 3,
  damageRate: 12,
  momentPerSpan: 0.12,
  repairSeconds: 3,
  repairFraction: 0.65,
  liftGrace: 8,
  liftFadePerSecond: 0.12,
  liftRecoveryPerSecond: 0.3,
  emergencyFloor: 0.2,
  emergencyLift: 140,
  emergencySeconds: 20,
  emergencyCooldown: 45,
  emergencyCost: 35,
  maxCollapsePerStep: 8,
  maxEvents: 48,
  debrisSeconds: 4,
  maxDebris: 32,
  criticalLiftRatio: 0.8,
  criticalSeparation: 4.5,
  criticalTilt: 22,
  salvageFraction: 0.25,
  incomePerPersonSecond: 0.04,
};
export const DIFFICULTIES = {
  easy: { strength: 1.3, damage: 0.65, grace: 30, cost: 0.7, fallSlow: 0.45 },
  normal: { strength: 1, damage: 1, grace: 20, cost: 1, fallSlow: 0.65 },
  hard: { strength: 0.85, damage: 1.25, grace: 12, cost: 1.3, fallSlow: 1 },
};
export const isPlatform = (kind: Kind) => kind === 'platform' || kind === 'metalPlatform';
export const isLift = (kind: Kind) => kind === 'liftSmall' || kind === 'liftLarge';
