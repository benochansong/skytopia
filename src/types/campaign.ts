import type { Game, Kind } from './game';
export type LocalText = { ko: string; en: string };
export type Metric =
  | 'newPower'
  | 'population'
  | 'placed'
  | 'homes'
  | 'expansion'
  | 'outerHome'
  | 'connection'
  | 'powerMargin'
  | 'stability'
  | 'foodMargin'
  | 'foodStock'
  | 'farms'
  | 'amenities'
  | 'lifts'
  | 'separationGain'
  | 'reinforced'
  | 'alternatePath'
  | 'overloads'
  | 'repairs'
  | 'industry'
  | 'materials'
  | 'net'
  | 'happiness'
  | 'housingSpare'
  | 'clinic'
  | 'noise'
  | 'liftMargin'
  | 'workers'
  | 'survive'
  | 'credits'
  | 'collapse';
export type Goal = {
  id: string;
  text: LocalText;
  metric?: Metric;
  target?: number;
  max?: boolean;
  once?: boolean;
  all?: Goal[];
  any?: Goal[];
};
export type Stage = {
  id: number;
  chapter: number;
  title: LocalText;
  story: LocalText;
  type: 'BUILD' | 'EXPAND' | 'BALANCE' | 'REPAIR' | 'OPTIMIZE' | 'SURVIVE' | 'PUZZLE' | 'PRESERVE';
  source: Game['missionId'];
  layout: string;
  seed: number;
  population?: number;
  resources: number;
  food: boolean;
  structure: boolean;
  fall: boolean;
  allowed: Kind[];
  script: Kind[];
  limit?: number;
  timeLimit?: number;
  hold: number;
  goals: Goal[];
  optional: Goal[];
  speaker: string;
  protect?: Kind[];
  next?: number;
  choice?: 'survivors' | 'research';
  xp: number;
};
export type RunResult = {
  stars: number;
  score: number;
  time: number;
  population: number;
  stability: number;
  net: number;
  optional: boolean[];
  breakdown: Record<string, number>;
  checkpoint: boolean;
};
export type CampaignRun = {
  rewards?: { xp: number; unlocked: Kind[]; achievements: string[] };
  stage: number;
  seed: number;
  initialPlatforms: string[];
  initialBuildings: number;
  protectedIds: number[];
  placed: number;
  spent: number;
  used: number;
  latched: string[];
  seen: string[];
  dialogue: string | null;
  line: number;
  history: string[];
  choice: string | null;
  hold: number;
  checkpointUsed: boolean;
  result: RunResult | null;
  failed: string | null;
  continued: boolean;
  peakPopulation: number;
  peakStability: number;
  safeTime: number;
  profitTime: number;
  initialSeparation: number;
  lastCollapsed: number;
  claimed: boolean;
  daily: string | null;
  intro: boolean;
};
export type Profile = {
  version: 1;
  name: string;
  records: Record<string, { best: RunResult; latest: RunResult; stars: number }>;
  achievements: Record<string, string>;
  xp: number;
  seen: string[];
  unlocked: Kind[];
  choices: Record<string, string>;
  stats: {
    time: number;
    built: number;
    expanded: number;
    population: number;
    stability: number;
    repairs: number;
  };
  legacyImported: boolean;
};
export type CampaignSave = {
  version: 1;
  profile: Profile;
  current: Game | null;
  checkpoint: Game | null;
  free: Game | null;
};
