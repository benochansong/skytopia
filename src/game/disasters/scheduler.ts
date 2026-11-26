import { HAZARDS } from '../../types/disaster';
import { DISASTER, PHYSICAL } from '../../data/rules';
import type { Game } from '../../types/game';
import type { Hazard, Threat, DisasterSnapshot, Weather } from '../../types/disaster';
import { random } from '../supply';
import { analyze } from '../analysis';
import { cityReport } from '../city/report';
import { resilience } from './report';
import { clearWeather, WAVE_TYPES } from './state';
export function snapshot(g: Game): DisasterSnapshot {
  const a = analyze(g),
    r = cityReport(g);
  return {
    population: g.population,
    stability: a.stability,
    buildings: g.buildings.length,
    platforms: g.platforms.length,
    mass: a.mass,
    lift: a.lift,
    generation: r.generation,
    food: r.foodProduction,
    materials: r.stocks.materials,
    credits: g.city.credits,
    resilience: resilience(g).score,
  };
}
export function forecast(
  g: Game,
  kind?: Hazard,
  options: Partial<
    Pick<Threat, 'level' | 'direction' | 'wind' | 'duration' | 'warning' | 'target'>
  > = {},
): Game {
  const d = g.disaster;
  if (!d || d.phase === 'active' || d.reward !== null || ['off', 'weather'].includes(d.setting))
    return g;
  let seed = d.seed;
  const roll = () => {
    const [r, s] = random(seed);
    seed = s;
    return r;
  };
  const type =
    kind ??
    (d.mode === 'free'
      ? HAZARDS[Math.floor(roll() * HAZARDS.length)]
      : WAVE_TYPES[(d.wave - 1) % WAVE_TYPES.length]);
  const level = Math.min(
    5,
    Math.max(
      1,
      options.level ??
        (d.mode === 'survival'
          ? Math.ceil(d.wave / 2)
          : d.setting === 'low'
            ? 1
            : d.setting === 'high'
              ? 4
              : 2),
    ),
  );
  const warning =
    options.warning ??
    DISASTER.warning * (g.difficulty === 'easy' ? 1.4 : g.difficulty === 'hard' ? 0.75 : 1);
  const candidates = g.buildings.filter(
    (b) => b.durability > 0 && Math.abs(b.origin.x) + Math.abs(b.origin.z) > 1,
  );
  const chosen = candidates[Math.floor(roll() * candidates.length)];
  const target = options.target ?? (chosen ? { ...chosen.origin } : { x: 3, y: 0, z: 1 });
  const threat: Threat = {
    id: d.nextId,
    kind: type,
    level,
    direction: options.direction ?? Math.floor(roll() * 8) * 45,
    wind: options.wind ?? 12 + level * 8,
    duration: options.duration ?? DISASTER.duration,
    warning,
    recovery: DISASTER.recovery * (g.difficulty === 'easy' ? 1.25 : 1),
    target,
    impacts: [],
  };
  const meteor = type === 'meteor' || type === 'compound',
    lightning = ['thunder', 'compound'].includes(type);
  if (meteor)
    for (let i = 0; i < Math.min(4, level + 1); i++)
      threat.impacts.push({
        id: threat.id + ':m' + i,
        kind: 'meteor',
        at: threat.duration * (0.25 + 0.16 * i),
        cell: { ...target },
        power: 25 + level * 17,
        radius: level >= 4 ? 1.5 : 1,
      });
  if (lightning) {
    const weighted = candidates.flatMap((b) =>
      Array.from(
        { length: Math.min(8, 1 + Math.ceil(Math.max(0, b.y * 3 + PHYSICAL[b.kind].height))) },
        () => b,
      ),
    );
    for (let i = 0; i < Math.min(4, level + 1); i++) {
      const b = weighted[Math.floor(roll() * weighted.length)];
      threat.impacts.push({
        id: threat.id + ':l' + i,
        kind: 'lightning',
        at: threat.duration * (0.2 + 0.2 * i),
        cell: b ? { ...b.origin } : { ...target },
        power: 18 + level * 9,
        radius: 0.6,
      });
    }
  }
  return {
    ...g,
    disaster: {
      ...d,
      seed,
      nextId: d.nextId + 1,
      threat,
      phase: 'forecast',
      clock: 0,
      baseline: {
        tallies: {
          absorbed: d.stats.absorbed,
          protected: d.stats.intercepted + d.stats.lightningProtected,
          repairs: g.structure.repairsDone,
        },
        snapshot: snapshot(g),
        buildings: g.buildings.map((b) => ({ ...b, origin: { ...b.origin } })),
        platforms: g.platforms.map((p) => ({ ...p })),
      },
      effects: [],
    },
  };
}
export function weatherAt(g: Game, dt: number): Weather {
  const d = g.disaster!;
  if (d.setting === 'off') return clearWeather();
  const t = d.threat,
    active = d.phase === 'active' && t;
  const envelope = active ? Math.max(0, Math.sin(Math.PI * Math.min(1, d.clock / t.duration))) : 0;
  const calmKinds = ['clear', 'cloudy', 'breeze', 'rain', 'fog'] as const;
  const calm = calmKinds[Math.floor(d.weatherClock / 75) % calmKinds.length];
  const type = active ? t.kind : null;
  const windType = type && ['wind', 'storm', 'thunder', 'aether', 'compound'].includes(type);
  const target = {
    ...clearWeather(),
    kind: active
      ? type === 'meteor'
        ? 'cloudy'
        : type === 'gravity'
          ? 'aether'
          : type === 'compound'
            ? 'aether'
            : type === 'storm'
              ? 'wind'
              : type!
      : d.phase === 'forecast'
        ? 'cloudy'
        : calm,
    direction: t?.direction ?? d.weather.direction,
    wind: windType ? t!.wind * envelope : calm === 'breeze' ? 7 : 3,
    temperature: type === 'cold' ? 20 - 40 * envelope : type === 'heat' ? 20 + 28 * envelope : 20,
    clouds: active
      ? 0.45 + 0.5 * envelope
      : d.phase === 'forecast'
        ? 0.5
        : calm === 'clear'
          ? 0.15
          : 0.65,
    rain:
      type && ['storm', 'thunder', 'compound'].includes(type)
        ? envelope
        : calm === 'rain'
          ? 0.2
          : 0,
    lightning: type && ['thunder', 'compound'].includes(type) ? envelope : 0,
    instability:
      type && ['aether', 'compound', 'gravity'].includes(type) ? (envelope * t!.level) / 5 : 0,
  };
  const smooth = (a: number, b: number) => a + (b - a) * Math.min(1, dt * 1.5);
  return {
    ...target,
    wind: smooth(d.weather.wind, target.wind),
    temperature: smooth(d.weather.temperature, target.temperature),
    clouds: smooth(d.weather.clouds, target.clouds),
    rain: smooth(d.weather.rain, target.rain),
  };
}
