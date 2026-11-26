import type { EventKind, Settings } from '../types/game';
type Channel = 'music' | 'effects' | 'warning';
/** Small synthesized sound palette; no downloads or autoplay before user interaction. */
export class Soundscape {
  private channels: Record<Channel, GainNode>;
  private last = new Map<string, number>();
  constructor(readonly context: AudioContext) {
    this.channels = {
      music: context.createGain(),
      effects: context.createGain(),
      warning: context.createGain(),
    };
    Object.values(this.channels).forEach((g) => g.connect(context.destination));
  }
  configure(s: Settings, playing: boolean) {
    for (const k of ['music', 'effects', 'warning'] as const)
      this.channels[k].gain.setTargetAtTime(
        s.sound && (k !== 'music' || playing) ? s[`${k}Volume`] : 0,
        this.context.currentTime,
        0.03,
      );
  }
  private tone(
    channel: Channel,
    from: number,
    to: number,
    duration: number,
    type: OscillatorType = 'sine',
    amplitude = 0.045,
  ) {
    const c = this.context;
    if (c.state !== 'running') return;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(to, c.currentTime + duration);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(amplitude, c.currentTime + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    o.connect(g);
    g.connect(this.channels[channel]);
    o.start();
    o.stop(c.currentTime + duration + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  cue(
    kind:
      | EventKind
      | 'place'
      | 'loss'
      | 'ambient'
      | 'engine'
      | 'city'
      | 'night'
      | 'shortage'
      | 'upgrade'
      | 'tier',
  ) {
    const now = this.context.currentTime,
      warning = ['critical', 'liftFading', 'powerLost', 'crack'].includes(kind),
      gap = ['ambient', 'engine', 'city', 'night'].includes(kind)
        ? 6
        : warning
          ? 2
          : kind === 'collapse'
            ? 0.65
            : 0.12;
    if (now - (this.last.get(kind) ?? -Infinity) < gap) return;
    this.last.set(kind, now);
    if (kind === 'city' || kind === 'night') {
      this.tone(
        'music',
        kind === 'night' ? 146.83 : 174.61,
        kind === 'night' ? 146.83 : 220,
        5.5,
        'sine',
        0.008,
      );
      return;
    }
    if (kind === 'shortage') {
      this.tone('warning', 380, 250, 0.4, 'triangle', 0.02);
      return;
    }
    if (kind === 'engine') {
      this.tone('effects', 90, 110, 1.1, 'sine', 0.012);
      return;
    }
    if (kind === 'ambient') {
      for (const hz of [130.81, 196, 261.63]) this.tone('music', hz, hz, 5.5, 'sine', 0.008);
      return;
    }
    if (kind === 'loss') {
      this.tone('warning', 220, 55, 1.8, 'triangle', 0.075);
      return;
    }
    if (kind === 'collapse' || kind === 'edgeFailed' || kind === 'demolish') {
      this.tone('effects', 110, 32, 0.65, 'sawtooth', 0.025);
      this.tone('effects', 180, 45, 0.4, 'triangle', 0.04);
      return;
    }
    if (warning) {
      this.tone(
        'warning',
        kind === 'crack' ? 160 : 440,
        kind === 'crack' ? 65 : 330,
        0.32,
        'triangle',
        0.04,
      );
      return;
    }
    if (kind === 'repair' || kind === 'reinforce' || kind === 'recovered') {
      this.tone('effects', 660, 990, 0.36);
      return;
    }
    if (kind === 'emergency') {
      this.tone('effects', 180, 720, 0.8, 'sine', 0.06);
      return;
    }
    this.tone('effects', 520, 1040, 0.24);
  }
  close() {
    void this.context.close().catch(() => {});
  }
}
