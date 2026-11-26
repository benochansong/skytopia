import { create } from 'zustand';
import type { Cell, Game, Settings } from '../types/game';
import * as engine from '../game/engine';
import { loadGame, loadSettings, saveGame, saveSettings } from '../game/storage';
import { validatePlacement } from '../game/placement';
import { cameraMove } from '../game/grid';
type Screen = 'menu' | 'playing' | 'paused' | 'victory' | 'settings' | 'about';
type Store = {
  game: Game;
  screen: Screen;
  settings: Settings;
  hasSave: boolean;
  saveIssue: string;
  notice: string;
  azimuth: number;
  cameraMode: 'free' | 'top';
  cameraReset: number;
  balanceVisible: boolean;
  placementSerial: number;
  lastPlaced: Cell;
  returnScreen: Screen;
  start: (mode: Game['mode']) => void;
  resume: () => void;
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
};
const settings = loadSettings();
const saved = loadGame();
export const useGame = create<Store>((set, get) => {
  const apply = (next: Game) => {
    const current = get();
    set({ game: next, ...(next.won && !current.game.won ? { screen: 'victory' as const } : {}) });
  };
  const active = () => get().screen === 'playing';
  return {
    game: engine.newGame('mission', 2478, settings),
    screen: 'menu',
    returnScreen: 'menu',
    settings,
    hasSave: saved.ok,
    saveIssue: saved.ok || saved.reason === 'empty' ? '' : saved.reason,
    notice: '',
    azimuth: Math.PI / 4,
    cameraMode: 'free',
    cameraReset: 0,
    balanceVisible: true,
    placementSerial: 0,
    lastPlaced: { x: 0, z: 0 },
    start: (mode) =>
      set({
        game: engine.newGame(mode, Date.now() >>> 0, get().settings),
        screen: 'playing',
        notice: '',
        cameraMode: 'free',
        cameraReset: get().cameraReset + 1,
      }),
    resume: () => {
      const result = loadGame();
      if (result.ok)
        set({ game: { ...result.game, settings: get().settings }, screen: 'playing', notice: '' });
      else set({ hasSave: false, saveIssue: result.reason });
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
        hasSave: ok || get().hasSave,
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
    camera: (mode) => set({ cameraMode: mode || 'free', cameraReset: get().cameraReset + 1 }),
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
  };
});

if (import.meta.env.DEV && import.meta.env.MODE === 'test' && typeof window !== 'undefined')
  window.__SKYTOPIA_TEST__ = useGame;
