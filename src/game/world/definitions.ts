import type { Region, ShipType, Specialty } from '../../types/world';
import type { Kind } from '../../types/game';
export const regionNames: Record<Region, [string, string]> = {
  firstSky: ['첫 하늘', 'First Sky'],
  emerald: ['에메랄드 해역', 'Emerald Reach'],
  iron: ['철의 군도', 'Iron Archipelago'],
  frozen: ['얼어붙은 하늘', 'Frozen Sky'],
  aether: ['에테르 심연', 'Aether Expanse'],
  lostHeavens: ['잃어버린 천상', 'Lost Heavens'],
};
export const specialtyNames: Record<Specialty, [string, string]> = {
  mixed: ['균형', 'Mixed'],
  agriculture: ['농업', 'Agriculture'],
  industry: ['산업', 'Industry'],
  energy: ['에너지', 'Energy'],
  research: ['연구', 'Research'],
  residential: ['주거', 'Residential'],
  trade: ['무역', 'Trade'],
};
export const shipDefs: Record<
  ShipType,
  {
    name: [string, string];
    capacity: number;
    speed: number;
    cost: number;
    aether: number;
    seconds: number;
    range: number;
    resistance: number;
    port: number;
  }
> = {
  scout: {
    name: ['정찰선', 'Scout'],
    capacity: 10,
    speed: 1.8,
    cost: 25,
    aether: 5,
    seconds: 15,
    range: 500,
    resistance: 0.2,
    port: 1,
  },
  explorer: {
    name: ['탐사선', 'Explorer'],
    capacity: 30,
    speed: 1.3,
    cost: 45,
    aether: 10,
    seconds: 25,
    range: 900,
    resistance: 0.35,
    port: 1,
  },
  lightCargo: {
    name: ['소형 화물선', 'Light freighter'],
    capacity: 80,
    speed: 1.2,
    cost: 55,
    aether: 10,
    seconds: 30,
    range: 650,
    resistance: 0.2,
    port: 1,
  },
  heavyCargo: {
    name: ['대형 화물선', 'Heavy freighter'],
    capacity: 250,
    speed: 0.8,
    cost: 120,
    aether: 20,
    seconds: 45,
    range: 900,
    resistance: 0.5,
    port: 2,
  },
  colony: {
    name: ['개척선', 'Colony ship'],
    capacity: 150,
    speed: 0.9,
    cost: 80,
    aether: 15,
    seconds: 35,
    range: 800,
    resistance: 0.3,
    port: 1,
  },
  rescue: {
    name: ['구호선', 'Rescue ship'],
    capacity: 100,
    speed: 1.5,
    cost: 65,
    aether: 12,
    seconds: 25,
    range: 850,
    resistance: 0.8,
    port: 1,
  },
  research: {
    name: ['연구선', 'Research vessel'],
    capacity: 50,
    speed: 1,
    cost: 75,
    aether: 15,
    seconds: 35,
    range: 1200,
    resistance: 0.6,
    port: 1,
  },
};
export const portRanks: Partial<Record<Kind, number>> = {
  portSmall: 1,
  explorationPort: 1,
  port: 2,
  portLarge: 3,
};
export const researchFields = [
  'structure',
  'aether',
  'urban',
  'industry',
  'transport',
  'resilience',
] as const;
export type Technology = {
  id: string;
  field: (typeof researchFields)[number];
  name: [string, string];
  description: [string, string];
  prerequisite: string | null;
  points: number;
  materials: number;
  aether: number;
  data: number;
  seconds: number;
};
const fields: [Technology['field'], [string, string, string, string][]][] = [
  [
    'structure',
    [
      ['strongFrame', '강화 골조', 'Strong frames', 'structure'],
      ['lightFrame', '경량 구조', 'Lightweight frames', 'mass'],
      ['skyBridges', '도시 간 하늘 교량', 'Intercity skybridges', 'bridge'],
    ],
  ],
  [
    'aether',
    [
      ['efficientFuel', '에테르 연료 효율', 'Efficient aether fuel', 'fuel'],
      ['advancedAether', '고급 부양 이론', 'Advanced levitation', 'lift'],
      ['distributedCore', '분산 부양 코어', 'Distributed cores', 'core'],
    ],
  ],
  [
    'urban',
    [
      ['efficientCity', '도시 운영 효율', 'Efficient cities', 'upkeep'],
      ['healthyCity', '건강한 도시', 'Healthy cities', 'amenity'],
      ['federation', '도시 연합 관제', 'Federation control', 'nexus'],
    ],
  ],
  [
    'industry',
    [
      ['betterFarms', '정밀 농업', 'Precision agriculture', 'food'],
      ['betterIndustry', '자동화 산업', 'Automated industry', 'materials'],
      ['pureRefining', '고순도 정제', 'Pure refining', 'refinery'],
    ],
  ],
  [
    'transport',
    [
      ['navigation', '장거리 항법', 'Long-range navigation', 'range'],
      ['heavyFreight', '중량 운송', 'Heavy freight', 'heavy'],
      ['fastCargo', '고속 운항', 'Fast cargo', 'speed'],
    ],
  ],
  [
    'resilience',
    [
      ['earlyWarning', '조기 경보망', 'Early warning', 'warning'],
      ['shieldNetwork', '보호막 제어', 'Shield control', 'shield'],
      ['rapidRepair', '신속 복구', 'Rapid repair', 'repair'],
    ],
  ],
];
const effects: Record<string, [string, string]> = {
  structure: ['구조 허용 하중 +10%', 'Structural capacity +10%'],
  mass: ['시설 무게 -5%', 'Facility mass −5%'],
  bridge: ['하늘 교량 앵커와 교량 해금', 'Unlock skybridge anchors and bridges'],
  fuel: ['비공정 연료 -10%', 'Airship fuel −10%'],
  lift: ['부양 출력 +12%', 'Lift output +12%'],
  core: ['분산 부양 코어 해금', 'Unlock distributed lift cores'],
  upkeep: ['유지비 -10%', 'Upkeep −10%'],
  amenity: ['시민 행복도 보너스 +5', 'Citizen happiness bonus +5'],
  nexus: ['중앙 관제소와 넥서스 해금', 'Unlock control center and Nexus'],
  food: ['식량 생산 +10%', 'Food production +10%'],
  materials: ['자재 생산 +15%', 'Materials production +15%'],
  refinery: ['고순도 에테르 정제소 해금', 'Unlock pure aether refinery'],
  range: ['연구선, 탐사 거리 +20%', 'Research ships, range +20%'],
  heavy: ['대형 화물선과 항구 해금', 'Unlock heavy freighters and grand ports'],
  speed: ['비공정 속도 +15%', 'Airship speed +15%'],
  warning: ['재난 예보 시간 +20%', 'Disaster warning time +20%'],
  shield: ['보호막 충전 속도 +15%', 'Shield recharge +15%'],
  repair: ['복구 작업 간격 -25%', 'Repair interval −25%'],
};
export const technologies: Technology[] = fields.flatMap(([field, rows]) =>
  rows.map(([id, ko, en, effect], i) => ({
    id,
    field,
    name: [ko, en],
    description: effects[effect],
    prerequisite: i ? rows[i - 1][0] : null,
    points: 20 + i * 25,
    materials: 20 + i * 20,
    aether: 3 + i * 4,
    data: i === 2 ? 5 : 0,
    seconds: 20 + i * 15,
  })),
);
export const facilityTech: Partial<Record<Kind, string>> = {
  portLarge: 'heavyFreight',
  advancedAetherRefinery: 'pureRefining',
  skybridgeAnchor: 'skyBridges',
  distributedLiftCore: 'distributedCore',
  centralControl: 'federation',
  nexus: 'federation',
};
