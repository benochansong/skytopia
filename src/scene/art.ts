import type { Settings } from '../types/game';
import type { Region } from '../types/world';

// Visual definitions only. No occupancy, production or mission rules live here.
export const ART = {
  sky: '#87ceeb',
  cloud: '#f3f7ff',
  leaf: '#75ad7d',
  stone: '#e4eaf0',
  metal: '#52677c',
  aether: '#35d5ff',
  gold: '#e8bc67',
  industry: '#a98a69',
  night: '#172a48',
  danger: '#e45b52',
  roof: '#407a9b',
  glass: '#9bd9df',
} as const;
export const QUALITY = {
  low: { dpr: 1, shadow: 0, clouds: 6, detail: 0, citizens: 8, vehicles: 4, particles: 24 },
  medium: {
    dpr: 1.6,
    shadow: 1024,
    clouds: 12,
    detail: 1,
    citizens: 32,
    vehicles: 12,
    particles: 96,
  },
  high: { dpr: 2, shadow: 2048, clouds: 20, detail: 2, citizens: 48, vehicles: 16, particles: 160 },
  ultra: {
    dpr: 2,
    shadow: 4096,
    clouds: 28,
    detail: 2,
    citizens: 48,
    vehicles: 16,
    particles: 200,
  },
} as const;
export type Quality = keyof typeof QUALITY;
export function qualityPatch(quality: Quality): Partial<Settings> {
  const q = QUALITY[quality];
  return {
    quality,
    shadows: q.shadow > 0,
    citizens: q.citizens,
    vehicles: q.vehicles,
    stormParticles: q.particles,
  };
}
export const REGION_ART: Record<Region, { sky: string; rock: string; leaf: string }> = {
  firstSky: { sky: ART.sky, rock: '#61758a', leaf: ART.leaf },
  emerald: { sky: '#9bd8d7', rock: '#597d71', leaf: '#68b881' },
  iron: { sky: '#c8bfad', rock: '#8d6d61', leaf: '#a7ae6b' },
  frozen: { sky: '#c6e3f4', rock: '#95b2c8', leaf: '#b3d4cf' },
  aether: { sky: '#b4b9e5', rock: '#686a98', leaf: '#9cbcca' },
  lostHeavens: { sky: '#dfd2ac', rock: '#8c849b', leaf: '#91af97' },
};
export const PHOTO_PRESETS = [
  'live',
  'sunrise',
  'clear',
  'golden',
  'night',
  'cinematic',
  'blueprint',
] as const;
export type PhotoPreset = (typeof PHOTO_PRESETS)[number];
export function photoDay(preset: PhotoPreset): number | undefined {
  return {
    live: undefined,
    sunrise: 24,
    clear: 90,
    golden: 155,
    night: 270,
    cinematic: 140,
    blueprint: 90,
  }[preset];
}
