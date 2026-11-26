import { clearWeather } from './state';
import { evacuatedTotal } from './effects';
import { growthTarget } from './survival';
import { DISASTER, DISASTER_KINDS, PHYSICAL } from '../../data/rules';
import type { Game, Kind } from '../../types/game';
import type { Policy } from '../../types/disaster';
import { forecast, snapshot, weatherAt } from './scheduler';
import { updateDefenses, applyImpact } from './protection';
import { recoveryStep, captureBlueprints } from './recovery';
import { evacuate, returnResidents } from './evacuation';
import { adjustStock, inventory } from '../city/inventory';
import { canUse } from '../campaign/runtime';
import { key } from '../grid';
import { orderBuilding } from '../city/actions';
export function disasterBefore(g: Game, dt: number): Game {
  const d = g.disaster;
  if (!d || d.setting === 'off') return g;
  let next: Game = {
    ...g,
    disaster: {
      ...d,
      clock: d.clock + dt,
      weatherClock: d.weatherClock + dt,
      emergencyCooldown: Math.max(0, d.emergencyCooldown - dt),
      outages: Object.fromEntries(
        Object.entries(d.outages)
          .filter(([, v]) => v > dt)
          .map(([id, v]) => [id, v - dt]),
      ),
      effects: d.effects.map((e) => ({ ...e, age: e.age + dt })).filter((e) => e.age < 2.5),
    },
  };
  if (d.phase === 'forecast' && next.disaster!.clock >= d.threat!.warning)
    next = {
      ...next,
      disaster: {
        ...next.disaster!,
        phase: 'active',
        clock: next.disaster!.clock - d.threat!.warning,
      },
    };
  next = { ...next, disaster: { ...next.disaster!, weather: weatherAt(next, dt) } };
  next = updateDefenses(next, dt);
  if (next.disaster!.policy === 'evacuate') next = evacuate(next);
  if (next.disaster!.phase === 'active')
    for (const impact of next.disaster!.threat!.impacts)
      if (impact.at <= next.disaster!.clock) next = applyImpact(next, impact);
  next = recoveryStep(next, dt);
  const state = next.disaster!;
  if (
    ((state.phase === 'calm' && state.clock >= 30) ||
      (state.phase === 'recovery' && state.clock >= state.threat!.recovery)) &&
    state.reward === null &&
    ['survival', 'free'].includes(state.mode)
  )
    next = forecast(
      { ...next, disaster: { ...state, phase: 'calm', clock: 0 } },
      state.setting === 'custom' ? state.config.kind : undefined,
      state.setting === 'custom' ? state.config : {},
    );
  return next;
}
export function disasterAfter(g: Game): Game {
  if (!g.disaster) return g;
  const live = new Set(g.buildings.map((b) => String(b.id)));
  g = {
    ...g,
    disaster: {
      ...g.disaster,
      ready: g.disaster.ready.filter((id) => live.has(String(id))),
      outages: Object.fromEntries(
        Object.entries(g.disaster.outages).filter(([id]) => live.has(id)),
      ),
      shields: Object.fromEntries(
        Object.entries(g.disaster.shields).filter(([id]) => live.has(id)),
      ),
    },
  };
  let next = captureBlueprints(g),
    d = next.disaster!;
  d = {
    ...d,
    stats: {
      ...d.stats,
      peakPopulation: Math.max(d.stats.peakPopulation, g.population),
      repaired: g.structure.repairsDone,
    },
  };
  next = { ...next, disaster: d };
  if (d.phase !== 'active' || d.clock < d.threat!.duration) return next;
  const t = d.threat!,
    base = d.baseline!,
    after = snapshot(next);
  const damaged = g.buildings.filter(
    (b) =>
      b.durability < (base.buildings.find((v) => v.id === b.id)?.durability ?? b.durability) - 0.01,
  );
  const report = {
    id: t.id,
    kind: t.kind,
    level: t.level,
    duration: t.duration,
    before: base.snapshot,
    after,
    damaged: damaged.length,
    collapsed: base.platforms.filter((p) => !g.platforms.some((q) => key(q) === key(p))).length,
    members: damaged.filter((b) =>
      ['column', 'hanger', 'bridge', 'truss'].some((k) => b.kind.toLowerCase().includes(k)),
    ).length,
    protected: d.stats.intercepted + d.stats.lightningProtected - base.tallies.protected,
    absorbed: d.stats.absorbed - base.tallies.absorbed,
    evacuated: d.evacuated.reduce((n, e) => n + e.count, 0),
    repairs: g.structure.repairsDone - base.tallies.repairs,
    repairCost: damaged.reduce((n, b) => n + PHYSICAL[b.kind].repairCost, 0),
  };
  const survived = !g.structure.loss;
  const stats = {
    ...d.stats,
    completed: d.stats.completed + Number(survived),
    storms:
      d.stats.storms +
      Number(survived && ['wind', 'storm', 'thunder', 'compound'].includes(t.kind)),
    aether: d.stats.aether + Number(survived && ['aether', 'compound'].includes(t.kind)),
    completedWaves: d.mode === 'survival' && survived ? d.wave : d.stats.completedWaves,
  };
  const score = Math.round(
    stats.completedWaves * 300 +
      Math.min(600, stats.peakPopulation) * 2 +
      after.stability * 3 +
      report.evacuated * 2 +
      Math.min(500, stats.absorbed) +
      after.resilience * 3 -
      Math.min(300, report.collapsed * 15),
  );
  next = {
    ...next,
    disaster: {
      ...d,
      phase: 'recovery',
      clock: 0,
      reports: [...d.reports, report].slice(-DISASTER.maxReports),
      stats,
      score: Math.max(0, score),
      reward: d.mode === 'survival' && survived ? d.wave : null,
      policy: d.policy === 'evacuate' ? 'recovery' : d.policy,
    },
  };
  return returnResidents(next);
}
export function setPolicy(g: Game, policy: Policy): Game {
  if (!g.disaster) return g;
  const next = { ...g, disaster: { ...g.disaster, policy } };
  return policy === 'evacuate' ? evacuate(next) : returnResidents(next);
}
export function emergencyOrder(g: Game, kind: Kind): Game {
  const d = g.disaster;
  if (!d || !DISASTER_KINDS.includes(kind) || !canUse(g, kind) || d.emergencyCooldown > 0) return g;
  const next = orderBuilding(g, kind);
  if (next === g) return g;
  return { ...next, disaster: { ...d, emergencyCooldown: 25 } };
}
export function claimWave(g: Game, choice: 'repair' | 'energy' | 'growth'): Game {
  const d = g.disaster,
    w = d?.reward;
  if (
    !d ||
    w === null ||
    w === undefined ||
    d.claimed.includes(w) ||
    g.population < growthTarget(g)
  )
    return g;
  let next = g;
  const inv = inventory(next);
  next = adjustStock(
    next,
    inv.root,
    choice === 'energy' ? 'aether' : 'materials',
    choice === 'energy' ? 25 : 100,
  );
  if (choice === 'growth') next = adjustStock(next, inv.root, 'food', 100);
  next = {
    ...next,
    city: { ...next.city, credits: next.city.credits + 150 },
    disaster: {
      ...d,
      reward: null,
      claimed: [...d.claimed, w],
      wave: w + 1,
      policy: choice === 'repair' ? 'recovery' : d.policy,
    },
  };
  return next;
}

export function changeDisasterSetting(
  g: Game,
  setting: NonNullable<Game['disaster']>['setting'],
): Game {
  const d = g.disaster;
  if (!d || d.mode !== 'free') return g;
  if (!['off', 'weather'].includes(setting)) return { ...g, disaster: { ...d, setting } };
  return {
    ...g,
    city: { ...g.city, displaced: g.city.displaced + evacuatedTotal(g) },
    disaster: {
      ...d,
      setting,
      phase: 'calm',
      clock: 0,
      threat: null,
      weather: clearWeather(),
      effects: [],
      outages: {},
      evacuated: [],
      policy: 'normal',
    },
  };
}
