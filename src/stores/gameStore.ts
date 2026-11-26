import { saveSurvivalBest } from '../game/disasters/survival';
import { disasterCity, disasterExample } from '../game/disasters/scenarios';
import { loadDisaster } from '../game/storage';
import type { DisasterState } from '../types/disaster';
import { verticalExample } from '../game/vertical/scenarios';
import { floorRange } from '../game/vertical/placement';
import { freshVertical, type View3D } from '../types/vertical';
import { loadVertical } from '../game/storage';
import type { CampaignSave } from '../types/campaign';
import { loadCampaign, saveCampaign } from '../game/campaign/storage';
import { loadStage } from '../game/campaign/loader';
import {
  canStart,
  freshProfile,
  updateProfile,
  dailySeed,
  localDate,
} from '../game/campaign/progress';
import { advanceDialogue, chooseStory, campaignStep } from '../game/campaign/runtime';
import { cityExample } from '../game/city/scenarios';
import { create } from 'zustand';
import type { Cell, Game, Settings, Kind, Target } from '../types/game';
import * as engine from '../game/engine';
import { loadGame, loadSettings, saveGame, saveSettings } from '../game/storage';
import { validatePlacement } from '../game/placement';
import { cameraMove } from '../game/grid';
import * as maintenance from '../game/repair/maintenance';
type Screen =
  | 'campaign'
  | 'profile'
  | 'challenges'
  | 'opening'
  | 'menu'
  | 'playing'
  | 'paused'
  | 'victory'
  | 'settings'
  | 'about'
  | 'gameover';
export type AnalysisMode =
  | 'off'
  | 'load'
  | 'lift'
  | 'center'
  | 'durability'
  | 'connections'
  | 'power'
  | 'food'
  | 'happiness'
  | 'logistics'
  | 'economy';
type Store = {
  startDisaster: (
    mode: 'lab' | 'survival',
    example?: DisasterState['example'],
    resume?: boolean,
  ) => void;
  hasDisasterSave: boolean;
  hasSurvivalSave: boolean;
  startVertical: (example?: 'A' | 'B' | 'C' | 'D' | 'E', resume?: boolean) => void;
  setFloor: (floor: number) => void;
  setView: (view: View3D) => void;
  rotateAxis: (axis: 'pitch' | 'roll') => void;
  hasVerticalSave: boolean;
  campaignSave: CampaignSave;
  campaignIssue: string;
  freeMode: boolean;
  openingReplay: boolean;
  newCampaign: (name: string) => void;
  startStage: (id: number, daily?: boolean) => void;
  resumeCampaign: () => void;
  campaignMap: () => void;
  dialogueNext: (skip?: boolean) => void;
  storyChoice: (choice: string) => void;
  checkpoint: (restore?: boolean) => void;
  continueCity: () => void;
  startFree: (resume?: boolean) => void;
  finishOpening: () => void;
  replayOpening: () => void;

  game: Game;
  screen: Screen;
  settings: Settings;
  hasSave: boolean;
  hasLabSave: boolean;
  hasCitySave: boolean;
  cityAction: (action: (g: Game) => Game) => void;
  cityExample: (example: Game['city']['example']) => void;
  analysisMode: AnalysisMode;
  toolMode: 'build' | 'inspect';
  selected: Target | null;
  cameraFocus: Cell | null;
  saveIssue: string;
  notice: string;
  azimuth: number;
  cameraMode: 'free' | 'top' | 'front' | 'side' | 'below' | 'floor';
  cameraReset: number;
  balanceVisible: boolean;
  placementSerial: number;
  lastPlaced: Cell;
  returnScreen: Screen;
  start: (mode: Game['mode'], missionId?: Game['missionId'], example?: Game['labExample']) => void;
  resume: (slot?: 'campaign' | 'lab' | 'city') => void;
  setScreen: (screen: Screen) => void;
  pause: () => void;
  move: (dx: number, dz: number) => void;
  aim: (c: Cell) => void;
  rotate: (delta: number) => void;
  place: (cursor?: Cell) => void;
  hold: () => void;
  recycle: () => void;
  tick: (dt: number) => void;
  save: (silent?: boolean) => void;
  configure: (patch: Partial<Settings>) => void;
  camera: (mode?: 'free' | 'top' | 'front' | 'side' | 'below' | 'floor') => void;
  tutorialEvent: (event: 'orbit' | 'zoom' | 'balance') => void;
  skipTutorial: () => void;
  select: (cell: Cell) => void;
  selectTarget: (target: Target) => void;
  blueprint: (kind: Kind) => void;
  maintain: (action: 'repair' | 'reinforce' | 'demolish', target?: Target) => void;
  emergency: () => void;
  cycleAnalysis: () => void;
  focus: (cell: Cell) => void;
  toggleLabTime: () => void;
  resetLab: () => void;
  toggleLift: (id: number) => void;
};
const settings = loadSettings();
const saved = loadGame();
const campaignLoaded = loadCampaign();
export const useGame = create<Store>((set, get) => {
  const apply = (next: Game) => {
    const current = get();
    if (next.campaign) {
      next = campaignStep(next, 0);
      const profile = updateProfile(current.campaignSave.profile, current.game, next);
      const finished =
        !!(next.campaign!.result || next.campaign!.failed) && !next.campaign!.claimed;
      if (finished)
        next = {
          ...next,
          campaign: {
            ...next.campaign!,
            claimed: true,
            rewards: {
              xp: profile.xp - current.campaignSave.profile.xp,
              unlocked: profile.unlocked.filter(
                (k) => !current.campaignSave.profile.unlocked.includes(k),
              ),
              achievements: Object.keys(profile.achievements).filter(
                (k) => !current.campaignSave.profile.achievements[k],
              ),
            },
          },
        };
      const campaignSave = { ...current.campaignSave, profile, current: next };
      set({ campaignSave });
      if (finished && !saveCampaign(campaignSave))
        set({ campaignIssue: 'unavailable', notice: 'saveFailed' });
    }
    if (
      next.disaster?.mode === 'survival' &&
      (next.disaster.stats.completedWaves !== (current.game.disaster?.stats.completedWaves ?? 0) ||
        !!next.structure.loss)
    ) {
      if (!saveSurvivalBest(next)) set({ notice: 'saveFailed' });
      if (
        next.disaster.stats.completedWaves >= 10 &&
        !current.campaignSave.profile.achievements.allStorms &&
        current.campaignIssue !== 'campaignCorrupt'
      ) {
        const campaignSave = {
          ...get().campaignSave,
          profile: {
            ...get().campaignSave.profile,
            xp: get().campaignSave.profile.xp + 40,
            achievements: {
              ...get().campaignSave.profile.achievements,
              allStorms: new Date().toISOString(),
            },
          },
        };
        set({ campaignSave });
        if (!saveCampaign(campaignSave)) set({ notice: 'saveFailed' });
      }
    }
    set({
      game: next,
      ...(next.structure.loss || next.campaign?.failed
        ? { screen: 'gameover' as const }
        : next.won && !current.game.won
          ? { screen: 'victory' as const }
          : {}),
    });
  };
  const active = () => get().screen === 'playing' && !get().game.campaign?.dialogue;
  return {
    hasDisasterSave: loadDisaster('lab').ok,
    hasSurvivalSave: loadDisaster('survival').ok,
    startDisaster: (mode, example = 'A', resume = false) => {
      const saved = resume ? loadDisaster(mode) : null;
      if (resume && !saved?.ok) {
        set({ notice: 'saveFailed' });
        return;
      }
      const game = saved?.ok
        ? saved.game
        : mode === 'lab'
          ? disasterExample(get().settings, example)
          : disasterCity(get().settings, 'survival');
      set({
        game,
        screen: 'playing',
        freeMode: false,
        selected: null,
        toolMode: 'build',
        analysisMode: 'off',
        cameraFocus: null,
        cameraMode: 'free',
        cameraReset: get().cameraReset + 1,
      });
    },
    hasVerticalSave: loadVertical().ok,
    startVertical: (example, resume = false) => {
      const saved = resume ? loadVertical() : null;
      if (resume && !saved?.ok) {
        set({ notice: 'saveFailed' });
        return;
      }
      const game = saved?.ok ? saved.game : verticalExample(get().settings, example);
      set({
        game,
        screen: 'playing',
        freeMode: false,
        selected: null,
        toolMode: 'build',
        analysisMode: 'off',
        cameraFocus: null,
        cameraMode: 'free',
        cameraReset: get().cameraReset + 1,
      });
    },
    setFloor: (floor) => {
      const g = get().game;
      if (!g.vertical || !active() || !Number.isInteger(floor)) return;
      const [min, max] = floorRange(g);
      if (floor < min || floor > max) {
        set({ notice: 'verticalLocked' });
        return;
      }
      set({
        game: { ...g, vertical: { ...g.vertical, floor }, cursor: { ...g.cursor, y: floor } },
        selected: null,
        cameraFocus: { x: g.cursor.x, z: g.cursor.z, y: floor },
      });
    },
    setView: (view) => {
      const g = get().game;
      if (g.vertical) set({ game: { ...g, vertical: { ...g.vertical, view } }, selected: null });
    },
    rotateAxis: (axis) => {
      const g = get().game;
      if (!active() || !g.vertical || !['beam', 'truss'].includes(g.active.kind)) return;
      apply({ ...g, active: { ...g.active, [axis]: ((g.active[axis] ?? 0) + 1) % 4 } });
    },
    campaignSave: campaignLoaded.save,
    campaignIssue: campaignLoaded.issue,
    freeMode: false,
    openingReplay: false,
    newCampaign: (name) => {
      const campaignSave = {
        ...get().campaignSave,
        profile: freshProfile(name),
        current: null,
        checkpoint: null,
      };
      const ok = saveCampaign(campaignSave);
      set({
        campaignSave,
        campaignIssue: ok ? '' : 'unavailable',
        screen: 'opening',
        openingReplay: false,
        freeMode: false,
      });
    },
    startStage: (id, daily = false) => {
      if (get().campaignIssue === 'campaignCorrupt') return;
      if (!canStart(get().campaignSave.profile, id)) return;
      const date = daily ? localDate() : null;
      let game = loadStage(id, get().settings, date ? dailySeed(date) : undefined);
      if (date) game = { ...game, campaign: { ...game.campaign!, daily: date } };
      const campaignSave = { ...get().campaignSave, current: game, checkpoint: null };
      const ok = saveCampaign(campaignSave);
      set({
        game,
        campaignSave,
        campaignIssue: ok ? '' : 'unavailable',
        screen: 'playing',
        freeMode: false,
        notice: '',
        selected: null,
        cameraFocus: null,
        cameraMode: 'free',
        cameraReset: get().cameraReset + 1,
        toolMode: 'build',
        analysisMode: 'off',
      });
    },
    resumeCampaign: () => {
      const saved = loadCampaign();
      set({ campaignSave: saved.save, campaignIssue: saved.issue });
      const game = saved.save.current;
      if (game)
        set({
          game: { ...game, settings: get().settings },
          screen:
            game.campaign?.failed || game.structure.loss
              ? 'gameover'
              : game.campaign?.result && !game.campaign.continued
                ? 'victory'
                : 'playing',
          freeMode: false,
          selected: null,
          cameraFocus: null,
          analysisMode: 'off',
          cameraReset: get().cameraReset + 1,
        });
    },
    campaignMap: () => {
      if (
        get().game.campaign &&
        ['playing', 'paused', 'victory', 'gameover'].includes(get().screen)
      )
        get().save(true);
      set({ screen: 'campaign', selected: null });
    },
    dialogueNext: (skip = false) => {
      const game = advanceDialogue(get().game, skip);
      apply(game);
      get().save(true);
    },
    storyChoice: (choice) => {
      apply(chooseStory(get().game, choice));
      get().save(true);
    },
    checkpoint: (restore = false) => {
      const s = get();
      if (restore) {
        const snapshot = s.campaignSave.checkpoint;
        if (!snapshot?.campaign || snapshot.campaign.stage !== s.game.campaign?.stage) return;
        const game = structuredClone(snapshot);
        game.campaign!.checkpointUsed = true;
        const campaignSave = { ...s.campaignSave, current: game };
        set({
          game,
          campaignSave,
          screen: 'playing',
          selected: null,
          cameraReset: s.cameraReset + 1,
        });
        if (!saveCampaign(campaignSave)) set({ campaignIssue: 'unavailable' });
      } else if (
        s.game.campaign &&
        !s.game.campaign.failed &&
        !s.game.campaign.result &&
        !s.game.structure.loss
      ) {
        const campaignSave = {
          ...s.campaignSave,
          checkpoint: structuredClone(s.game),
          current: s.game,
        };
        set({ campaignSave, notice: saveCampaign(campaignSave) ? 'saved' : 'saveFailed' });
      }
    },
    continueCity: () => {
      const g = get().game;
      if (!g.campaign?.result) return;
      const game = { ...g, campaign: { ...g.campaign, continued: true, dialogue: null } };
      set({ game, screen: 'playing' });
      get().save(true);
    },
    startFree: (resume = false) => {
      let game = resume ? get().campaignSave.free : null;
      if (!game) {
        game = cityExample(engine.newGame('citylab', Date.now() >>> 0, get().settings), 'C');
        game = {
          ...game,
          vertical: freshVertical(),
          labPaused: false,
          city: { ...game.city, unlimited: false },
        };
      }
      game = { ...game, vertical: game.vertical ?? freshVertical() };
      set({
        game,
        freeMode: true,
        screen: 'playing',
        selected: null,
        analysisMode: 'off',
        cameraReset: get().cameraReset + 1,
      });
    },
    finishOpening: () => {
      const s = get(),
        campaignSave = {
          ...s.campaignSave,
          profile: {
            ...s.campaignSave.profile,
            seen: [...new Set([...s.campaignSave.profile.seen, 'opening'])],
          },
        };
      set({ campaignSave });
      if (s.campaignIssue !== 'campaignCorrupt') saveCampaign(campaignSave);
      if (s.openingReplay) set({ screen: 'menu' });
      else get().startStage(1);
    },
    replayOpening: () => set({ openingReplay: true, screen: 'opening' }),
    game: engine.newGame('mission', 2478, settings),
    screen: 'menu',
    returnScreen: 'menu',
    settings,
    hasSave: saved.ok,
    hasLabSave: loadGame('lab').ok,
    hasCitySave: loadGame('city').ok,
    cityAction: (action) => {
      if (active()) apply(action(get().game));
    },
    cityExample: (example) => {
      if (active() && get().game.mode === 'citylab') {
        const g = engine.newGame('citylab', Date.now() >>> 0, get().settings);
        apply(cityExample(g, example));
      }
    },
    analysisMode: 'off',
    toolMode: 'build',
    selected: null,
    cameraFocus: null,
    saveIssue: saved.ok || saved.reason === 'empty' ? '' : saved.reason,
    notice: '',
    azimuth: Math.PI / 4,
    cameraMode: 'free',
    cameraReset: 0,
    balanceVisible: true,
    placementSerial: 0,
    lastPlaced: { x: 0, z: 0 },
    start: (mode, missionId = 1, example = 'A') =>
      set({
        game: engine.newGame(mode, Date.now() >>> 0, get().settings, missionId, example),
        freeMode: false,
        screen: 'playing',
        notice: '',
        cameraMode: 'free',
        cameraReset: get().cameraReset + 1,
        cameraFocus: null,
        selected: null,
        toolMode: 'build',
        analysisMode: mode === 'lab' ? 'load' : 'off',
      }),
    resume: (slot = 'campaign') => {
      const result = loadGame(slot);
      if (result.ok)
        set({
          game: { ...result.game, settings: get().settings },
          freeMode: false,
          screen: result.game.structure.loss ? 'gameover' : 'playing',
          notice: '',
          selected: null,
          toolMode: 'build',
          cameraFocus: null,
        });
      else
        set({
          ...(slot === 'city'
            ? { hasCitySave: false }
            : slot === 'campaign'
              ? { hasSave: false }
              : { hasLabSave: false }),
          saveIssue: result.reason,
        });
    },
    setScreen: (screen) => {
      const previous = get().screen;
      if (screen === 'menu' && ['playing', 'paused', 'victory', 'gameover'].includes(previous))
        get().save(true);
      set({
        screen,
        returnScreen: screen === 'settings' || screen === 'about' ? previous : get().returnScreen,
      });
    },
    pause: () => {
      const s = get().screen;
      if (s === 'playing') {
        get().save(true);
        set({ screen: 'paused' });
      } else if (s === 'paused') set({ screen: 'playing' });
    },
    move: (dx, dz) => {
      if (!active()) return;
      const g = get().game,
        d = cameraMove(dx, dz, get().azimuth);
      apply(
        engine.move(g, {
          x: g.cursor.x + d.x,
          z: g.cursor.z + d.z,
          ...(g.vertical ? { y: g.vertical.floor } : {}),
        }),
      );
    },
    aim: (cursor) => {
      if (!active()) return;
      const g = get().game;
      if (
        cursor.x !== g.cursor.x ||
        cursor.z !== g.cursor.z ||
        (cursor.y ?? 0) !== (g.cursor.y ?? 0)
      )
        apply(engine.move(g, cursor));
    },
    rotate: (delta) => {
      if (active()) apply(engine.turn(get().game, delta));
    },
    place: (cursor) => {
      if (!active()) return;
      if (get().toolMode === 'inspect') {
        get().select(cursor ?? get().game.cursor);
        return;
      }
      const g = cursor ? engine.move(get().game, cursor) : get().game;
      const v = validatePlacement(g);
      if (!v.valid) {
        set({ notice: v.reason });
        return;
      }
      const next = engine.place(g);
      if (next === g) {
        set({ notice: g.tutorial < 4 ? 'trainingFirst' : 'connectionWarning' });
        return;
      }
      apply(next);
      set({
        placementSerial: get().placementSerial + 1,
        lastPlaced: { ...g.cursor },
        notice: 'placed',
      });
    },
    hold: () => {
      if (active()) {
        const g = get().game;
        if (g.mode === 'training' && g.tutorial < 8) {
          set({ notice: 'trainingFirst' });
          return;
        }
        apply(engine.hold(g));
        set({ notice: g.holdUsed ? 'holdUsed' : 'held' });
      }
    },
    recycle: () => {
      if (active()) {
        const g = get().game;
        if (g.mode === 'training' && g.tutorial < 8) {
          set({ notice: 'trainingFirst' });
          return;
        }
        apply(engine.recycle(g));
        set({ notice: 'recycled' });
      }
    },
    tick: (dt) => {
      if (!active()) return;
      const g = get().game,
        next = engine.tick(g, dt);
      apply(next);
      if (g.active !== next.active)
        set({
          notice: next.score > g.score ? 'placed' : 'recycled',
          ...(next.score > g.score
            ? { placementSerial: get().placementSerial + 1, lastPlaced: g.cursor }
            : {}),
        });
    },
    save: (silent = false) => {
      if (get().game.campaign || get().freeMode) {
        if (get().campaignIssue === 'campaignCorrupt') {
          set({ notice: 'saveFailed' });
          return;
        }
        const s = get(),
          campaignSave = {
            ...s.campaignSave,
            ...(s.freeMode ? { free: s.game } : { current: s.game }),
          };
        const ok = saveCampaign(campaignSave);
        set({
          campaignSave,
          campaignIssue: ok ? '' : 'unavailable',
          ...(!silent || !ok ? { notice: ok ? 'saved' : 'saveFailed' } : {}),
        });
        return;
      }
      const ok = saveGame({ ...get().game, settings: get().settings });
      set({
        ...(get().game.disaster?.mode === 'lab'
          ? { hasDisasterSave: ok || get().hasDisasterSave }
          : get().game.disaster?.mode === 'survival'
            ? { hasSurvivalSave: ok || get().hasSurvivalSave }
            : get().game.vertical && get().game.mode === 'citylab'
              ? { hasVerticalSave: ok || get().hasVerticalSave }
              : get().game.mode === 'citylab'
                ? { hasCitySave: ok || get().hasCitySave }
                : get().game.mode === 'lab'
                  ? { hasLabSave: ok || get().hasLabSave }
                  : { hasSave: ok || get().hasSave }),
        saveIssue: ok ? '' : 'unavailable',
        ...(!silent || !ok ? { notice: ok ? 'saved' : 'saveFailed' } : {}),
      });
    },
    configure: (patch) => {
      const next = { ...get().settings, ...patch };
      const ok = saveSettings(next);
      set({
        settings: next,
        game: { ...get().game, settings: next },
        ...(!ok ? { notice: 'saveFailed' } : {}),
      });
    },
    camera: (mode) =>
      set({ cameraMode: mode || 'free', cameraReset: get().cameraReset + 1, cameraFocus: null }),
    tutorialEvent: (event) => {
      const g = get().game;
      if (!active() || g.mode !== 'training') return;
      if (
        (g.tutorial === 0 && event === 'orbit') ||
        (g.tutorial === 1 && event === 'zoom') ||
        (g.tutorial === 8 && event === 'balance')
      )
        set({ game: { ...g, tutorial: g.tutorial + 1 } });
    },
    skipTutorial: () => set({ game: { ...get().game, tutorial: 9 } }),
    select: (cell) => {
      if (active()) {
        set({ selected: maintenance.targetAt(get().game, cell) });
      }
    },
    selectTarget: (selected) => set({ selected, toolMode: 'inspect' }),
    blueprint: (kind) => {
      if (active()) {
        apply(maintenance.selectBlueprint(get().game, kind));
        set({ toolMode: 'build' });
      }
    },
    maintain: (action, target) => {
      if (!active()) return;
      const selected = target ?? get().selected;
      if (!selected) return;
      const g = get().game,
        next = maintenance[action](g, selected);
      if (next === g) {
        set({ notice: 'maintenanceDenied' });
        return;
      }
      apply(next);
      set({
        notice:
          action === 'repair'
            ? 'repairStarted'
            : action === 'reinforce'
              ? 'reinforced'
              : 'demolished',
      });
    },
    emergency: () => {
      if (!active()) return;
      const g = get().game,
        cell = get().selected
          ? (maintenance.targetInfo(g, get().selected!)?.cell ?? g.cursor)
          : g.cursor,
        next = maintenance.emergencyLift(g, cell);
      apply(next);
      set({ notice: next === g ? 'maintenanceDenied' : 'emergencyActive' });
    },
    cycleAnalysis: () => {
      const modes: AnalysisMode[] = [
        'off',
        'load',
        'lift',
        'center',
        'durability',
        'connections',
        ...(get().game.city.enabled
          ? (['power', 'food', 'happiness', 'logistics', 'economy'] as AnalysisMode[])
          : []),
      ];
      set({ analysisMode: modes[(modes.indexOf(get().analysisMode) + 1) % modes.length] });
    },
    focus: (cell) => set({ cameraFocus: cell, cameraReset: get().cameraReset + 1 }),
    toggleLabTime: () => {
      if (['lab', 'citylab'].includes(get().game.mode) && active())
        set({ game: { ...get().game, labPaused: !get().game.labPaused } });
    },
    resetLab: () => {
      const g = get().game;
      if (g.disaster && ['lab', 'survival'].includes(g.disaster.mode))
        get().startDisaster(g.disaster.mode as 'lab' | 'survival', g.disaster.example);
      else if (['lab', 'citylab'].includes(g.mode)) get().start(g.mode, 1, g.labExample);
    },
    toggleLift: (id) => {
      if (active()) apply(maintenance.toggleLift(get().game, id));
    },
  };
});

if (import.meta.env.DEV && import.meta.env.MODE === 'test' && typeof window !== 'undefined')
  window.__SKYTOPIA_TEST__ = useGame;
