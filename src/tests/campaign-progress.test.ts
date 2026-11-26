import { describe, it, expect, vi, afterEach } from 'vitest';
import { DEFAULT_SETTINGS } from '../data/rules';
import { loadStage } from '../game/campaign/loader';
import { campaignStep, advanceDialogue, chooseStory } from '../game/campaign/runtime';
import {
  freshProfile,
  updateProfile,
  canStart,
  starsFor,
  dailySeed,
  localDate,
} from '../game/campaign/progress';
import {
  freshCampaign,
  decodeCampaign,
  decodeCampaignGame,
  saveCampaign,
  CAMPAIGN_KEY,
  loadCampaign,
} from '../game/campaign/storage';
import { goalMet, metrics, evaluateResult } from '../game/campaign/objectives';
import { solveCampaign, runCampaign } from './campaign-solutions';
import { newGame, tick, recycle, hold } from '../game/engine';
import { validatePlacement } from '../game/placement';
import { upgrade, orderBuilding } from '../game/city/actions';
import { selectBlueprint, emergencyLift, reinforce } from '../game/repair/maintenance';
import { t } from '../game/campaign/definitions';
const now = '2026-11-26T10:00:00.000Z';
afterEach(() => vi.unstubAllGlobals());
describe('campaign progression and recovery', () => {
  it('one star unlocks the next stage; repeated claims and replays cannot farm XP', () => {
    const g = solveCampaign(1),
      p = freshProfile('Beno');
    const first = updateProfile(p, loadStage(1, DEFAULT_SETTINGS), g, now);
    expect(canStart(first, 2)).toBe(true);
    expect(canStart(first, 3)).toBe(false);
    expect(first.xp).toBeGreaterThan(0);
    const replay = updateProfile(first, g, g, now);
    expect(replay.xp).toBe(first.xp);
    expect(starsFor(first, 1)).toBe(3);
    const low = {
      ...g,
      campaign: { ...g.campaign!, result: { ...g.campaign!.result!, stars: 1, score: 100 } },
    };
    const next = updateProfile(first, low, low, now);
    expect(next.records['1:normal'].best.score).toBe(first.records['1:normal'].best.score);
    expect(next.records['1:normal'].latest.score).toBe(100);
    expect(next.records['1:normal'].stars).toBe(3);
    expect(next.xp).toBe(first.xp);
  });
  it('additional stars reward only their delta across difficulty records', () => {
    const g = solveCampaign(1),
      low = { ...g, campaign: { ...g.campaign!, result: { ...g.campaign!.result!, stars: 1 } } };
    const p = updateProfile(freshProfile(), low, low, now);
    const next = updateProfile(p, g, g, now);
    expect(next.xp - p.xp).toBe(50);
    const hard = { ...g, difficulty: 'hard' as const };
    expect(updateProfile(next, hard, hard, now).xp).toBe(next.xp);
  });
  it('AND/OR, once-only objectives and continuous hold reset use real state', () => {
    const g = loadStage(1, DEFAULT_SETTINGS),
      v = metrics(g);
    expect(
      goalMet(
        {
          id: 'or',
          text: t('또는', 'or'),
          any: [
            { id: 'p', text: t('인구', 'population'), metric: 'population', target: 100 },
            { id: 's', text: t('안전', 'safe'), metric: 'stability', target: 90 },
          ],
        },
        v,
      ),
    ).toBe(true);
    expect(
      goalMet({ id: 'once', text: t('한번', 'once'), metric: 'placed', target: 5, once: true }, v, [
        'once',
      ]),
    ).toBe(true);
    const start = loadStage(5, DEFAULT_SETTINGS);
    start.campaign!.hold = 22;
    expect(campaignStep(start, 0.25).campaign!.hold).toBe(0);
  });
  it('dialogue round-trips without time passing, skip is idempotent, and scene history is bounded', () => {
    const g = loadStage(1, DEFAULT_SETTINGS),
      next = advanceDialogue(g);
    expect(next.campaign!.line).toBe(1);
    expect(tick(next, 100)).toBe(next);
    const saved = decodeCampaignGame(next)!;
    expect(saved.campaign).toEqual(next.campaign);
    const ready = advanceDialogue(saved, true);
    expect(ready.campaign!.dialogue).toBeNull();
    expect(advanceDialogue(ready, true)).toBe(ready);
    expect(tick(ready, 1).elapsed).toBe(1);
  });
  it('locked construction, orders, blueprints, early upgrades and emergency lift are rejected', () => {
    const g = advanceDialogue(loadStage(1, DEFAULT_SETTINGS), true);
    expect(validatePlacement(g, { kind: 'aetherPower', shape: 'O', rotation: 0 }).valid).toBe(
      false,
    );
    expect(selectBlueprint(g, 'liftLarge')).toBe(g);
    expect(reinforce(g, { type: 'platform', id: '0,0' })).toBe(g);
    expect(emergencyLift(g, { x: 0, z: 0 })).toBe(g);
    const early = advanceDialogue(loadStage(4, DEFAULT_SETTINGS), true);
    expect(orderBuilding(early, 'aetherPower')).toBe(early);
    expect(upgrade(early, early.buildings.find((b) => b.kind === 'largeHome')!.id)).toBe(early);
    expect(selectBlueprint(newGame('citylab'), 'aetherPower').active.kind).toBe('aetherPower');
  });
  it('story choices change actual resources or population once and survive saving', () => {
    const g = loadStage(4, DEFAULT_SETTINGS),
      accepted = chooseStory(g, 'accept');
    expect(accepted.population).toBe(g.population + 8);
    expect(chooseStory(accepted, 'accept')).toBe(accepted);
    expect(decodeCampaignGame(accepted)!.campaign!.choice).toBe('accept');
    const research = loadStage(11, DEFAULT_SETTINGS),
      funded = chooseStory(research, 'research');
    expect(orderBuilding(research, 'aetherPower')).toBe(research);
    expect(funded.city.stocks.core.materials).toBe(research.city.stocks.core.materials - 60);
    expect(funded.city.stocks.core.aether).toBe(research.city.stocks.core.aether + 10);
    expect(orderBuilding(funded, 'aetherPower')).not.toBe(funded);
  });
  it('failure wins simultaneous evaluation; protected losses, timeout and exhausted puzzle fail exactly once', () => {
    const g = solveCampaign(1),
      ready = {
        ...g,
        won: false,
        campaign: { ...g.campaign!, result: null },
        structure: {
          ...g.structure,
          loss: { reason: 'core' as const, time: g.elapsed, firstFailure: 'core' },
        },
      };
    const failed = campaignStep(ready, 1);
    expect(failed.campaign!.result).toBeNull();
    expect(failed.campaign!.failed).toBe('core');
    expect(campaignStep(failed, 1)).toBe(failed);
    const protectedCity = loadStage(8, DEFAULT_SETTINGS);
    protectedCity.buildings = protectedCity.buildings.filter(
      (b) => b.id !== protectedCity.campaign!.protectedIds[0],
    );
    expect(campaignStep(protectedCity, 0).campaign!.failed).toBe('protected');
    const timed = loadStage(101, DEFAULT_SETTINGS);
    timed.elapsed = 300;
    expect(campaignStep(timed, 0).campaign!.failed).toBe('timeout');
    let puzzle = advanceDialogue(loadStage(101, DEFAULT_SETTINGS), true);
    expect(hold(puzzle)).toBe(puzzle);
    for (let i = 0; i < 6; i++) puzzle = recycle(puzzle);
    expect(puzzle.campaign!.failed).toBe('blocks');
  });
  it('checkpoint restores city, seed, dialogue and hold exactly; expert score policy is explicit', () => {
    let g = advanceDialogue(loadStage(14, DEFAULT_SETTINGS), true);
    g = runCampaign(g, 1);
    const save = { ...freshCampaign(), current: g, checkpoint: structuredClone(g) };
    const decoded = decodeCampaign(JSON.stringify(save));
    expect(decoded.save.checkpoint).toEqual(g);
    expect(decoded.recovered).toBe(false);
    const won = solveCampaign(1),
      normal = evaluateResult(won);
    won.difficulty = 'hard';
    won.campaign!.checkpointUsed = true;
    expect(evaluateResult(won).score).toBe(Math.round(normal.score * 0.9));
  });
  it('a damaged city snapshot preserves valid profile; corrupt profile never silently overwrites storage', () => {
    const save = freshCampaign();
    save.current = loadStage(1, DEFAULT_SETTINGS);
    save.current.population = -1;
    const recovered = decodeCampaign(JSON.stringify(save));
    expect(recovered.recovered).toBe(true);
    expect(recovered.save.current).toBeNull();
    expect(recovered.save.profile).toEqual(save.profile);
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    });
    storage.set(CAMPAIGN_KEY, '{bad');
    expect(loadCampaign().issue).toBe('campaignCorrupt');
    expect(storage.get(CAMPAIGN_KEY)).toBe('{bad');
    expect(saveCampaign(save)).toBe(false);
  });
  it('old v3 winning missions import only verified completion, with original slots untouched', () => {
    const legacy = newGame('mission', 5, DEFAULT_SETTINGS, 5);
    legacy.won = true;
    const storage = new Map([['skytopia.save.v3', JSON.stringify(legacy)]]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    });
    const r = loadCampaign();
    expect(r.save.profile.legacyImported).toBe(true);
    expect(starsFor(r.save.profile, 4)).toBe(1);
    expect(starsFor(r.save.profile, 3)).toBe(0);
    expect(r.save.current).toBeNull();
    expect(storage.size).toBe(1);
  });
  it('continued cities and laboratories do not award progress; new stages share no city state', () => {
    const g = solveCampaign(1),
      p = freshProfile();
    g.campaign!.continued = true;
    expect(updateProfile(p, g, g, now)).toBe(p);
    const lab = newGame('citylab');
    expect(updateProfile(p, lab, lab, now)).toBe(p);
    const next = loadStage(2, DEFAULT_SETTINGS);
    expect(next.elapsed).toBe(0);
    expect(next.campaign!.hold).toBe(0);
    expect(next.city.orders).toEqual([]);
    expect(next.campaign!.history).toEqual([]);
  });
  it('3x victory and timed failure discard leftover simulation time before saving', () => {
    const won = solveCampaign(1);
    const ready = {
      ...won,
      won: false,
      city: { ...won.city, speed: 3 as const },
      campaign: { ...won.campaign!, result: null },
    };
    const complete = tick(ready, 1);
    expect(complete.campaign!.result).not.toBeNull();
    expect(complete.city.accumulator).toBe(0);
    expect(decodeCampaignGame(complete)).not.toBeNull();
    const timed = advanceDialogue(loadStage(101, DEFAULT_SETTINGS), true);
    timed.elapsed = 299.9;
    timed.city.speed = 3;
    const failed = tick(timed, 1);
    expect(failed.campaign!.failed).toBe('timeout');
    expect(failed.city.accumulator).toBe(0);
    expect(decodeCampaignGame(failed)).not.toBeNull();
  });
  it('daily blueprints use local dates and deterministic seeds with separate result keys', () => {
    const date = localDate(new Date(2026, 10, 26, 23, 59));
    expect(date).toBe('2026-11-26');
    expect(dailySeed(date)).toBe(dailySeed(date));
    expect(dailySeed(date)).not.toBe(dailySeed('2026-11-27'));
    expect(loadStage(103, DEFAULT_SETTINGS, dailySeed(date))).toEqual(
      loadStage(103, DEFAULT_SETTINGS, dailySeed(date)),
    );
  });
});
