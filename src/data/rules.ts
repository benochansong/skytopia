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
  saveKey: 'skytopia.save.v1',
  settingsKey: 'skytopia.settings.v1',
};
export const DEFAULT_SETTINGS: Settings = {
  language: 'ko',
  sound: true,
  shadows: true,
  reducedMotion: false,
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
export const KINDS: Kind[] = ['platform', 'home', 'power', 'road', 'farm', 'park'];
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
