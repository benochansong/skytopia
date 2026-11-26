import { z } from 'zod';
import type { Game } from '../../types/game';
import type { CampaignSave, CampaignRun, Profile } from '../../types/campaign';
import { decodeSave, loadGame } from '../storage';
import { freshProfile } from './progress';
import { allStages, LEGACY_MAP, available, stage } from './definitions';
import { KINDS, VERTICAL_KINDS } from '../../data/rules';
export const CAMPAIGN_KEY = 'skytopia.campaign.v2';
const num = z.number().finite().min(0).max(1e9),
  count = num.int(),
  str = z.string().max(100),
  list = z.array(str).max(256);
const result = z.object({
  stars: count.min(1).max(3),
  score: num,
  time: num,
  population: num,
  stability: num.max(100),
  net: z.number().finite(),
  optional: z.array(z.boolean()).max(20),
  breakdown: z.record(num),
  checkpoint: z.boolean(),
});
const run = z.object({
  rewards: z
    .object({
      xp: count,
      unlocked: z
        .array(
          z.enum([...KINDS, ...VERTICAL_KINDS] as [
            (typeof KINDS)[number],
            ...(typeof KINDS)[number][],
          ]),
        )
        .max(64),
      achievements: list,
    })
    .optional(),
  stage: count.refine((n) => allStages.some((s) => s.id === n)),
  seed: count.max(4294967295),
  initialPlatforms: z.array(str).max(1792),
  initialBuildings: count.max(1200),
  protectedIds: z.array(count).max(1200),
  placed: count,
  spent: num,
  used: count,
  latched: list,
  seen: list,
  dialogue: z.enum(['briefing', 'crisis', 'milestone']).nullable(),
  line: count.max(1),
  history: list,
  choice: z.enum(['accept', 'defer', 'research']).nullable(),
  hold: num,
  checkpointUsed: z.boolean(),
  result: result.nullable(),
  failed: z.enum(['lift', 'balance', 'core', 'protected', 'timeout', 'blocks']).nullable(),
  continued: z.boolean(),
  peakPopulation: num,
  peakStability: num.max(100),
  safeTime: num,
  profitTime: num,
  initialSeparation: num,
  lastCollapsed: count,
  claimed: z.boolean(),
  daily: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  intro: z.boolean(),
});
const profile = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(32),
  records: z.record(z.object({ best: result, latest: result, stars: count.min(1).max(3) })),
  achievements: z.record(z.string().datetime()),
  xp: count.max(100000),
  seen: list,
  unlocked: z
    .array(
      z.enum([...KINDS, ...VERTICAL_KINDS] as [
        (typeof KINDS)[number],
        ...(typeof KINDS)[number][],
      ]),
    )
    .max(64),
  choices: z.record(z.enum(['accept', 'defer', 'research'])),
  stats: z.object({
    time: num,
    built: count,
    expanded: count,
    population: num,
    stability: num.max(100),
    repairs: count,
  }),
  legacyImported: z.boolean(),
});
export function decodeCampaignGame(raw: unknown): Game | null {
  if (!raw) return null;
  const data = raw as Game,
    decoded = decodeSave(JSON.stringify(data));
  if (!decoded.ok) throw Error('Invalid city snapshot');
  if (!data.campaign) return decoded.game;
  const c = run.parse(data.campaign) as CampaignRun;
  if (data.mode !== 'mission' || data.missionId !== stage(c.stage).source)
    throw Error('Mismatched mission snapshot');
  if (c.result && (!data.won || c.failed)) throw Error('Invalid result');
  if (c.claimed && !c.result && !c.failed) throw Error('Invalid claim');
  return { ...decoded.game, campaign: c };
}
export function freshCampaign(): CampaignSave {
  return { version: 2, profile: freshProfile(), current: null, checkpoint: null, free: null };
}
export function decodeCampaign(raw: string): { save: CampaignSave; recovered: boolean } {
  const value = JSON.parse(raw);
  if (value.version !== 1 && value.version !== 2) throw Error('Unknown campaign version');
  const p = profile.parse(value.profile) as Profile;
  if (
    Object.keys(p.records).length > 300 ||
    Object.keys(p.records).some(
      (k) =>
        !/^\d+:(easy|normal|hard)(:daily:\d{4}-\d{2}-\d{2})?$/.test(k) ||
        !allStages.some((s) => s.id === Number(k.split(':')[0])),
    )
  )
    throw Error('Invalid record key');
  let recovered = false;
  const snapshot = (v: unknown) => {
    try {
      return decodeCampaignGame(v);
    } catch {
      recovered = true;
      return null;
    }
  };
  let current = snapshot(value.current),
    checkpoint = snapshot(value.checkpoint),
    free = snapshot(value.free);
  if (current && !current.campaign) {
    current = null;
    recovered = true;
  }
  if (free?.campaign) {
    free = null;
    recovered = true;
  }
  return {
    save: {
      version: 2,
      profile: p,
      current,
      checkpoint:
        checkpoint?.campaign &&
        current?.campaign &&
        checkpoint.campaign.stage === current.campaign.stage &&
        checkpoint.campaign.seed === current.campaign.seed &&
        checkpoint.difficulty === current.difficulty
          ? checkpoint
          : null,
      free,
    },
    recovered,
  };
}
export function loadCampaign(): { save: CampaignSave; issue: string } {
  let raw: string | null;
  try {
    raw = localStorage.getItem(CAMPAIGN_KEY) ?? localStorage.getItem('skytopia.campaign.v1');
  } catch {
    return { save: freshCampaign(), issue: 'unavailable' };
  }
  try {
    if (raw) {
      const { save, recovered } = decodeCampaign(raw);
      return { save, issue: recovered ? 'snapshotRecovered' : '' };
    }
    const save = freshCampaign(),
      legacy = loadGame();
    if (legacy.ok) {
      save.profile.legacyImported = true;
      if (legacy.game.won && legacy.game.mode === 'mission') {
        const id = LEGACY_MAP[legacy.game.missionId],
          r = {
            stars: 1,
            score: legacy.game.score,
            time: legacy.game.elapsed,
            population: legacy.game.population,
            stability: 0,
            net: 0,
            optional: [],
            breakdown: { legacy: legacy.game.score },
            checkpoint: false,
          };
        save.profile.records[id + ':' + legacy.game.difficulty] = { best: r, latest: r, stars: 1 };
        save.profile.unlocked = available(Math.min(15, id + 1));
      }
    }
    return { save, issue: '' };
  } catch {
    return { save: freshCampaign(), issue: 'campaignCorrupt' };
  }
}
export function saveCampaign(save: CampaignSave) {
  try {
    const raw = JSON.stringify(save);
    if (decodeCampaign(raw).recovered) return false;
    localStorage.setItem(CAMPAIGN_KEY, raw);
    return true;
  } catch {
    return false;
  }
}
