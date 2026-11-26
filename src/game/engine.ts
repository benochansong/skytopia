import {
  BLOCKS,
  DEFAULT_SETTINGS,
  RULES,
  PHYSICAL,
  DIFFICULTIES,
  isPlatform,
  STRUCTURE,
} from '../data/rules';
import { MISSIONS } from '../data/missions';
import type { Cell, Game, Piece, Settings } from '../types/game';
import { draw } from './supply';
import { analyze, objectives } from './analysis';
import { validatePlacement } from './placement';
import { freshStructure, makePlatform } from './stability/state';
import { simulateStructure } from './stability/simulation';
import { configureScenario } from './scenarios';
import { projectPlacement } from './building';
import { costFor } from './repair/maintenance';
export function newGame(
  mode: Game['mode'] = 'mission',
  seed = Date.now() >>> 0,
  settings: Settings = DEFAULT_SETTINGS,
  missionId: Game['missionId'] = 1,
  labExample: Game['labExample'] = 'A',
): Game {
  let supply = { seed, bag: [], draws: 0, policy: 'adaptive' } as Game['supply'];
  const pieces: Piece[] = [];
  for (let i = 0; i < 4; i++) {
    const [p, s] = draw(supply, mode === 'training', {
      script: mode === 'mission' ? MISSIONS[missionId].script : [],
    });
    pieces.push(p);
    supply = s;
  }
  const g: Game = {
    version: 2,
    missionId,
    labExample,
    labPaused: mode === 'lab',
    missionHold: 0,
    baselineSeparation: 0,
    difficulty: settings.difficulty,
    structure: freshStructure(),
    reservedActive: null,
    mode,
    platforms: Array.from({ length: 36 }, (_, i) =>
      makePlatform({ x: (i % 6) - 3, z: Math.floor(i / 6) - 3 }, 'platform', 0, 1, true),
    ),
    buildings: [
      {
        id: 1,
        kind: 'home',
        shape: 'single',
        rotation: 0,
        origin: { x: -1, z: -2 },
        y: 0,
        initial: true,
        durability: PHYSICAL.home.hp,
        enabled: true,
      },
      {
        id: 2,
        kind: 'power',
        shape: 'single',
        rotation: 0,
        origin: { x: 1, z: -2 },
        y: 0,
        initial: true,
        durability: PHYSICAL.power.hp,
        enabled: true,
      },
      ...[-3, -2, -1].map((z, i) => ({
        id: i + 3,
        kind: 'road' as const,
        shape: 'single' as const,
        rotation: 0,
        origin: { x: 0, z },
        y: 0 as const,
        initial: true,
        durability: PHYSICAL.road.hp,
        enabled: true,
      })),
    ],
    active: pieces[0],
    next: pieces.slice(1),
    hold: null,
    holdUsed: false,
    cursor: { x: -1, z: -1 },
    supply,
    population: 2,
    resources: mode === 'mission' ? MISSIONS[missionId].resources : 100,
    score: 0,
    elapsed: 0,
    remaining: RULES.fallSeconds,
    nextId: 6,
    won: false,
    tutorial: 0,
    settings: { ...settings },
  };
  if (mode === 'lab') g.active = { kind: 'factory', shape: 'single', rotation: 0 };
  return configureScenario(g);
}
function advance(g: Game): Game {
  if (g.reservedActive) return { ...g, active: g.reservedActive, reservedActive: null };
  if (g.mode === 'lab') return { ...g, remaining: RULES.fallSeconds, holdUsed: false };
  const s = analyze(g);
  const [piece, supply] = draw(g.supply, g.mode === 'training', {
    script: g.mode === 'mission' ? MISSIONS[g.missionId].script : [],
    needsLift: s.lift - s.mass < 80,
    needsSpace: g.platforms.length - g.buildings.length < 10,
    needsRoad: s.disconnected > 2,
  });
  return {
    ...g,
    active: g.next[0],
    next: [...g.next.slice(1), piece],
    supply,
    remaining: RULES.fallSeconds,
    holdUsed: false,
  };
}
export function place(g: Game): Game {
  if (g.structure.loss) return g;
  const v = validatePlacement(g);
  if (!v.valid) return g;
  if (g.mode === 'training' && g.tutorial < 4) return g;
  if (
    g.mode === 'training' &&
    (g.tutorial === 4 || g.tutorial === 6 || g.tutorial === 7) &&
    v.reason === 'connectionWarning'
  )
    return g;
  const definition = BLOCKS[g.active.kind];
  let changed = projectPlacement(g);
  if (changed === g) return g;
  changed = {
    ...changed,
    nextId: g.nextId + 1,
    score: g.score + definition.score,
    resources: g.resources - (g.reservedActive ? costFor(g, PHYSICAL[g.active.kind].cost) : 0),
  };
  if (g.mode === 'training') {
    const step = g.tutorial;
    if (
      step === 4 ||
      (step === 5 && isPlatform(g.active.kind)) ||
      (step === 6 && g.active.kind === 'road' && analyze(changed).connectedIds.has(g.nextId)) ||
      (step === 7 && g.active.kind === 'power' && analyze(changed).connectedIds.has(g.nextId))
    )
      changed.tutorial++;
  }
  changed = advance(changed);
  return {
    ...changed,
    won: g.won || (g.mode === 'mission' && g.missionId === 1 && objectives(changed).every(Boolean)),
  };
}
export function recycle(g: Game): Game {
  if (g.structure.loss) return g;
  if (g.reservedActive || g.mode === 'lab') return advance(g);
  return advance({
    ...g,
    resources: g.resources + RULES.recycleResources,
    score: Math.max(0, g.score - RULES.recyclePenalty),
  });
}
export function hold(g: Game): Game {
  if (g.reservedActive || g.structure.loss || g.mode === 'lab') return g;
  if (g.holdUsed) return g;
  // Exchanging never resets the deadline: a hold cannot bypass the falling timer.
  if (g.hold) return { ...g, active: g.hold, hold: g.active, holdUsed: true };
  return { ...advance(g), hold: g.active, holdUsed: true, remaining: g.remaining };
}
export function move(g: Game, cursor: Cell): Game {
  if (!Number.isFinite(cursor.x) || !Number.isFinite(cursor.z)) return g;
  const c = {
    x: Math.max(RULES.min, Math.min(RULES.max, Math.round(cursor.x))) || 0,
    z: Math.max(RULES.min, Math.min(RULES.max, Math.round(cursor.z))) || 0,
  };
  return {
    ...g,
    cursor: c,
    tutorial:
      g.mode === 'training' && g.tutorial === 2 && (c.x !== g.cursor.x || c.z !== g.cursor.z)
        ? 3
        : g.tutorial,
  };
}
export function turn(g: Game, delta: number): Game {
  return {
    ...g,
    active: { ...g.active, rotation: (g.active.rotation + delta + 4) % 4 },
    tutorial: g.mode === 'training' && g.tutorial === 3 ? 4 : g.tutorial,
  };
}
export function tick(g: Game, dt: number): Game {
  if (!Number.isFinite(dt) || dt <= 0 || g.structure.loss || g.labPaused) return g;
  dt = Math.min(dt, 1); // Never punish players for a hidden tab or a stalled frame.
  const stats = analyze(g);
  if (g.mode === 'training' && stats.structural.critical) return g;
  let result: Game = {
    ...g,
    elapsed: g.elapsed + dt,
    population: Math.min(stats.poweredCapacity, g.population + dt * RULES.populationPerSecond),
    remaining:
      g.mode !== 'mission' || g.reservedActive
        ? g.remaining
        : Math.max(
            0,
            g.remaining -
              dt * (stats.structural.critical ? DIFFICULTIES[g.difficulty].fallSlow : 1),
          ),
    resources:
      g.resources +
      (g.mode === 'mission' && g.missionId > 1
        ? g.population * STRUCTURE.incomePerPersonSecond * dt
        : 0),
  };
  // A disconnected city stops growing; existing residents stay until capacity falls.
  result.population = Math.min(stats.capacity, Math.max(g.population, result.population));
  if (result.remaining === 0)
    result = validatePlacement(result).valid ? place(result) : recycle(result);
  result = simulateStructure(result, dt);
  const complete = objectives(result).every(Boolean) && !result.structure.loss;
  const missionHold = complete ? result.missionHold + dt : 0;
  return {
    ...result,
    missionHold,
    won:
      result.won || (g.mode === 'mission' && complete && missionHold >= MISSIONS[g.missionId].hold),
  };
}
