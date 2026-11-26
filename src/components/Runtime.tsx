import { stage } from '../game/campaign/definitions';
import { useEffect, useRef } from 'react';
import { Soundscape } from '../game/audio';
import { useGame } from '../stores/gameStore';
export default function Runtime() {
  const audio = useRef<Soundscape | null>(null);
  useEffect(() => {
    let last = performance.now(),
      lastSave = last,
      lastThreat = 0,
      lastDisasterEffect = '',
      lastDisasterPhase = '';
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (!document.hidden) useGame.getState().tick(Math.min((now - last) / 1000, 1));
      last = now;
      const current = useGame.getState(),
        hazard = current.game.disaster;
      if (current.screen === 'playing' && hazard) {
        if (hazard.phase === 'active') audio.current?.cue('storm');
        if (hazard.phase !== lastDisasterPhase) {
          if (hazard.phase === 'forecast') audio.current?.cue('forecast');
          if (hazard.phase === 'recovery') audio.current?.cue('stormEnd');
          lastDisasterPhase = hazard.phase;
        }
        const effect = hazard.effects.at(-1);
        if (effect && effect.id !== lastDisasterEffect) {
          audio.current?.cue(effect.kind === 'lightning' ? 'thunder' : effect.kind);
          lastDisasterEffect = effect.id;
        }
        if (hazard.threat && hazard.threat.id !== lastThreat) {
          lastThreat = hazard.threat.id;
          if (current.settings.disasterCamera && !current.settings.reducedMotion)
            current.focus(hazard.threat.target);
        }
      }
      if (useGame.getState().game.campaign && useGame.getState().screen === 'playing')
        audio.current?.chapter(stage(useGame.getState().game.campaign!.stage).chapter);
      if (
        !useGame.getState().game.campaign &&
        useGame.getState().screen === 'playing' &&
        useGame.getState().settings.musicVolume > 0
      )
        audio.current?.cue(
          useGame.getState().game.city.enabled
            ? useGame.getState().game.city.dayTime > 180
              ? 'night'
              : 'city'
            : 'ambient',
        );
      if (
        useGame.getState().screen === 'playing' &&
        useGame
          .getState()
          .game.buildings.some(
            (b) => b.enabled && (b.kind === 'liftSmall' || b.kind === 'liftLarge'),
          )
      )
        audio.current?.cue('engine');
      if (now - lastSave > 10000 && useGame.getState().screen === 'playing') {
        useGame.getState().save(true);
        lastSave = now;
      }
    }, 250);
    const unload = () => {
      const s = useGame.getState();
      if (
        ['playing', 'paused', 'victory', 'gameover'].includes(s.screen) ||
        (s.screen === 'settings' && s.returnScreen === 'paused')
      )
        s.save(true);
    };
    const visibility = () => {
      if (document.hidden && useGame.getState().screen === 'playing') useGame.getState().pause();
      last = performance.now();
    };
    const unlock = () => {
      if (!useGame.getState().settings.sound) return;
      try {
        audio.current ??= new Soundscape(new AudioContext());
        audio.current.configure(
          useGame.getState().settings,
          useGame.getState().screen === 'playing',
        );
        if (audio.current.context.state === 'suspended')
          void audio.current.context.resume().catch(() => {});
      } catch {
        /* Audio is optional. */
      }
    };
    const keyboard = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        el.matches('input,select,textarea') ||
        el.isContentEditable ||
        (el.closest('button,summary') && (e.code === 'Space' || e.code === 'Enter'))
      )
        return;
      const s = useGame.getState();
      if (e.code === 'Escape') {
        if (s.screen === 'settings' || s.screen === 'about') s.setScreen(s.returnScreen);
        else s.pause();
        return;
      }
      if (s.screen !== 'playing' || s.game.world?.view === 'map') return;
      if (el.closest('[role="dialog"]')) return;
      if (e.code === 'Tab' && !e.shiftKey && !el.closest('button')) {
        e.preventDefault();
        s.cycleAnalysis();
        return;
      }
      if (s.game.vertical && ['PageUp', 'PageDown', 'KeyR', 'KeyF'].includes(e.code)) {
        e.preventDefault();
        if (e.repeat) return;
        if (e.code === 'PageUp') s.setFloor(s.game.vertical.floor + 1);
        if (e.code === 'PageDown') s.setFloor(s.game.vertical.floor - 1);
        if (e.code === 'KeyR') s.rotateAxis('pitch');
        if (e.code === 'KeyF') s.rotateAxis('roll');
        return;
      }
      const moves: Record<string, [number, number]> = {
        KeyW: [0, -1],
        ArrowUp: [0, -1],
        KeyS: [0, 1],
        ArrowDown: [0, 1],
        KeyA: [-1, 0],
        ArrowLeft: [-1, 0],
        KeyD: [1, 0],
        ArrowRight: [1, 0],
      };
      if (moves[e.code]) {
        e.preventDefault();
        s.move(...moves[e.code]);
        return;
      }
      if (!['KeyQ', 'KeyE', 'Space', 'KeyC', 'KeyX', 'KeyH'].includes(e.code)) return;
      e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'KeyQ') s.rotate(-1);
      if (e.code === 'KeyE') s.rotate(1);
      if (e.code === 'Space') s.place();
      if (e.code === 'KeyC') s.hold();
      if (e.code === 'KeyX') s.recycle();
      if (e.code === 'KeyH') s.camera();
    };
    const unsubscribe = useGame.subscribe((state, prev) => {
      audio.current?.configure(state.settings, state.screen === 'playing');
      if (!state.settings.sound || audio.current?.context.state !== 'running') return;
      if (state.game.city.enabled && state.game.elapsed >= prev.game.elapsed)
        for (const e of state.game.city.events.filter((e) => e.id >= prev.game.city.nextEventId))
          audio.current.cue(
            e.kind === 'shortage'
              ? 'shortage'
              : e.kind === 'upgrade'
                ? 'upgrade'
                : e.kind === 'tier'
                  ? 'tier'
                  : 'recovered',
          );
      if (state.placementSerial !== prev.placementSerial) audio.current.cue('place');
      if (
        state.game.structure.nextEventId >= prev.game.structure.nextEventId &&
        state.game.elapsed >= prev.game.elapsed
      ) {
        for (const e of state.game.structure.events.filter(
          (e) => e.id >= prev.game.structure.nextEventId,
        ))
          audio.current.cue(e.kind);
        if (state.game.structure.loss && !prev.game.structure.loss) audio.current.cue('loss');
      }
    });
    window.addEventListener('keydown', keyboard);
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(timer);
      unsubscribe();
      window.removeEventListener('keydown', keyboard);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('visibilitychange', visibility);
      audio.current?.close();
      audio.current = null;
    };
  }, []);
  return null;
}
