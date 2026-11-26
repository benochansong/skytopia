import { useEffect, useRef } from 'react';
import { useGame } from '../stores/gameStore';
export default function Runtime() {
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    let last = performance.now(),
      lastSave = last;
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (!document.hidden) useGame.getState().tick(Math.min((now - last) / 1000, 1));
      last = now;
      if (now - lastSave > 10000 && useGame.getState().screen === 'playing') {
        useGame.getState().save(true);
        lastSave = now;
      }
    }, 250);
    const unload = () => {
      const s = useGame.getState();
      if (
        ['playing', 'paused', 'victory'].includes(s.screen) ||
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
        audio.current ??= new AudioContext();
        if (audio.current.state === 'suspended') void audio.current.resume().catch(() => {});
      } catch {
        /* Audio is optional. */
      }
    };
    const keyboard = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        el.matches('input,select,textarea') ||
        el.isContentEditable ||
        (el.closest('button') && (e.code === 'Space' || e.code === 'Enter'))
      )
        return;
      const s = useGame.getState();
      if (e.code === 'Escape') {
        if (s.screen === 'settings' || s.screen === 'about') s.setScreen(s.returnScreen);
        else s.pause();
        return;
      }
      if (s.screen !== 'playing') return;
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
      if (
        state.placementSerial === prev.placementSerial ||
        !state.settings.sound ||
        audio.current?.state !== 'running'
      )
        return;
      const ctx = audio.current,
        oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(520, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1040, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.045, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.25);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
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
      if (audio.current) void audio.current.close().catch(() => {});
      audio.current = null;
    };
  }, []);
  return null;
}
