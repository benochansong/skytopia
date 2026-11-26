import { create } from 'zustand';
import type { Cell, Game, Settings, Kind, Target } from '../types/game';
import * as engine from '../game/engine';
import { loadGame, loadSettings, saveGame, saveSettings } from '../game/storage';
import { validatePlacement } from '../game/placement';
import { cameraMove } from '../game/grid';
import * as maintenance from '../game/repair/maintenance';
type Screen = 'menu' | 'playing' | 'paused' | 'victory' | 'settings' | 'about' | 'gameover';
export type AnalysisMode = 'off' | 'load' | 'lift' | 'center' | 'durability' | 'connections';
type Store = {
  game: Game;
  screen: Screen;
  settings: Settings;
  hasSave: boolean;
  hasLabSave: boolean;
  analysisMode: AnalysisMode;
  toolMode: 'build' | 'inspect';
  selected: Target | null;
  cameraFocus: Cell | null;
  saveIssue: string;
  notice: string;
  azimuth: number;
  cameraMode: 'free' | 'top';
  cameraReset: number;
  balanceVisible: boolean;
  placementSerial: number;
  lastPlaced: Cell;
  returnScreen: Screen;
  start: (mode: Game['mode'], missionId?: Game['missionId'], example?: Game['labExample']) => void;
  resume: (slot?: 'campaign' | 'lab') => void;
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
  camera: (mode?: 'free' | 'top') => void;
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
export const useGame = create<Store>((set, get) => {
  const apply = (next: Game) => {
    const current = get();
    set({
      game: next,
      ...(next.structure.loss
        ? { screen: 'gameover' as const }
        : next.won && !current.game.won
          ? { screen: 'victory' as const }
          : {}),
    });
  };
  const active = () => get().screen === 'playing';
  return {
    game: engine.newGame('mission', 2478, settings),
    screen: 'menu',
    returnScreen: 'menu',
    settings,
    hasSave: saved.ok,
    hasLabSave: loadGame('lab').ok,
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
          screen: result.game.structure.loss ? 'gameover' : 'playing',
          notice: '',
          selected: null,
          toolMode: 'build',
          cameraFocus: null,
        });
      else
        set({
          ...(slot === 'campaign' ? { hasSave: false } : { hasLabSave: false }),
          saveIssue: result.reason,
        });
    },
    setScreen: (screen) => {
      const previous = get().screen;
      if (
        screen === 'menu' &&
        previous !== 'menu' &&
        previous !== 'about' &&
        previous !== 'settings'
      )
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
      apply(engine.move(g, { x: g.cursor.x + d.x, z: g.cursor.z + d.z }));
    },
    aim: (cursor) => {
      if (!active()) return;
      const g = get().game;
      if (cursor.x !== g.cursor.x || cursor.z !== g.cursor.z) apply(engine.move(g, cursor));
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
      const ok = saveGame({ ...get().game, settings: get().settings });
      set({
        ...(get().game.mode === 'lab'
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
      const modes: AnalysisMode[] = ['off', 'load', 'lift', 'center', 'durability', 'connections'];
      set({ analysisMode: modes[(modes.indexOf(get().analysisMode) + 1) % modes.length] });
    },
    focus: (cell) => set({ cameraFocus: cell, cameraReset: get().cameraReset + 1 }),
    toggleLabTime: () => {
      if (get().game.mode === 'lab' && active())
        set({ game: { ...get().game, labPaused: !get().game.labPaused } });
    },
    resetLab: () => {
      const g = get().game;
      if (g.mode === 'lab') get().start('lab', 1, g.labExample);
    },
    toggleLift: (id) => {
      if (active()) apply(maintenance.toggleLift(get().game, id));
    },
  };
});

if (import.meta.env.DEV && import.meta.env.MODE === 'test' && typeof window !== 'undefined')
  window.__SKYTOPIA_TEST__ = useGame;
