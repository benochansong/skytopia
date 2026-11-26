import { BLOCKS, DEFAULT_SETTINGS, RULES } from '../data/rules';
import type { Cell, Game, Piece, Settings } from '../types/game';
import { draw } from './supply';
import { analyze, objectives } from './analysis';
import { validatePlacement } from './placement';
export function newGame(
  mode: Game['mode'] = 'mission',
  seed = Date.now() >>> 0,
  settings: Settings = DEFAULT_SETTINGS,
): Game {
  let supply = { seed, bag: [], draws: 0 } as Game['supply'];
  const pieces: Piece[] = [];
  for (let i = 0; i < 4; i++) {
    const [p, s] = draw(supply, mode === 'training');
    pieces.push(p);
    supply = s;
  }
  return {
    version: 1,
    mode,
    platforms: Array.from({ length: 36 }, (_, i) => ({
      x: (i % 6) - 3,
      z: Math.floor(i / 6) - 3,
      y: 0,
      variant: 'grass',
      mass: 5,
      durability: 100,
    })),
    buildings: [
      {
        id: 1,
        kind: 'home',
        shape: 'single',
        rotation: 0,
        origin: { x: -1, z: -2 },
        y: 0,
        initial: true,
      },
      {
        id: 2,
        kind: 'power',
        shape: 'single',
        rotation: 0,
        origin: { x: 1, z: -2 },
        y: 0,
        initial: true,
      },
      ...[-3, -2, -1].map((z, i) => ({
        id: i + 3,
        kind: 'road' as const,
        shape: 'single' as const,
        rotation: 0,
        origin: { x: 0, z },
        y: 0 as const,
        initial: true,
      })),
    ],
    active: pieces[0],
    next: pieces.slice(1),
    hold: null,
    holdUsed: false,
    cursor: { x: -1, z: -1 },
    supply,
    population: 2,
    resources: 100,
    score: 0,
    elapsed: 0,
    remaining: RULES.fallSeconds,
    nextId: 6,
    won: false,
    tutorial: 0,
    settings: { ...settings },
  };
}
function advance(g: Game): Game {
  const [piece, supply] = draw(g.supply, g.mode === 'training');
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
  let changed: Game;
  if (g.active.kind === 'platform') {
    changed = {
      ...g,
      platforms: [
        ...g.platforms,
        ...v.cells.map((c) => ({
          ...c,
          y: 0 as const,
          variant: (g.nextId % 3 === 0 ? 'metal' : g.nextId % 3 === 1 ? 'rock' : 'grass') as
            | 'metal'
            | 'rock'
            | 'grass',
          mass: definition.mass / v.cells.length,
          durability: 100,
        })),
      ],
    };
  } else
    changed = {
      ...g,
      buildings: [
        ...g.buildings,
        { ...g.active, id: g.nextId, origin: { ...g.cursor }, y: 0, initial: false },
      ],
    };
  changed = { ...changed, nextId: g.nextId + 1, score: g.score + definition.score };
  if (g.mode === 'training') {
    const step = g.tutorial;
    if (
      step === 4 ||
      (step === 5 && g.active.kind === 'platform') ||
      (step === 6 && g.active.kind === 'road' && analyze(changed).connectedIds.has(g.nextId)) ||
      (step === 7 && g.active.kind === 'power' && analyze(changed).connectedIds.has(g.nextId))
    )
      changed.tutorial++;
  }
  changed = advance(changed);
  return { ...changed, won: g.won || objectives(changed).every(Boolean) };
}
export function recycle(g: Game): Game {
  return advance({
    ...g,
    resources: g.resources + RULES.recycleResources,
    score: Math.max(0, g.score - RULES.recyclePenalty),
  });
}
export function hold(g: Game): Game {
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
  if (!Number.isFinite(dt) || dt <= 0) return g;
  dt = Math.min(dt, 1); // Never punish players for a hidden tab or a stalled frame.
  const stats = analyze(g);
  let result = {
    ...g,
    elapsed: g.elapsed + dt,
    population: Math.min(stats.poweredCapacity, g.population + dt * RULES.populationPerSecond),
    remaining: g.mode === 'training' ? g.remaining : Math.max(0, g.remaining - dt),
  };
  // A disconnected city stops growing; existing residents stay until capacity falls.
  result.population = Math.min(stats.capacity, Math.max(g.population, result.population));
  if (result.remaining === 0)
    result = validatePlacement(result).valid ? place(result) : recycle(result);
  return { ...result, won: result.won || objectives(result).every(Boolean) };
}
