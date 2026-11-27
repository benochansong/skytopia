import { DEFAULT_SETTINGS, ONLINE } from '../../data/rules';
import type { Game, Piece, Supply } from '../../types/game';
import { freshVertical } from '../../types/vertical';
import { analyze } from '../analysis';
import { cityReport } from '../city/report';
import { upgrade, emergencyFood, emergencyPower } from '../city/actions';
import { newGame, place, tick } from '../engine';
import { validatePlacement } from '../placement';
import * as maintenance from '../repair/maintenance';
import { draw } from '../supply';
import { freshDisaster } from '../disasters/state';
import type { Action, HandView, Score } from './protocol';
export type Hand = HandView & { supply: Supply };
function nextPiece(supply: Supply) {
  // Constant context: supply never depends on a player's city, score or actions.
  return draw(supply, false, {
    script: ['home', 'farm', 'road', 'power', 'liftSmall', 'platform'],
    city: { tier: 1, needFood: false, needPower: false },
  });
}
export function newHand(seed: number): Hand {
  let supply: Supply = { seed, bag: [], draws: 0, policy: 'adaptive' };
  const pieces: Piece[] = [];
  for (let i = 0; i < 4; i++) {
    const [p, s] = nextPiece(supply);
    pieces.push(p);
    supply = s;
  }
  return {
    supply,
    token: 0,
    active: pieces[0],
    next: pieces.slice(1),
    hold: null,
    holdUsed: false,
    remaining: ONLINE.handSeconds,
  };
}
export function advanceHand(h: Hand): Hand {
  const [p, supply] = nextPiece(h.supply);
  return {
    ...h,
    supply,
    token: h.token + 1,
    active: h.next[0],
    next: [...h.next.slice(1), p],
    holdUsed: false,
    remaining: ONLINE.handSeconds,
  };
}
export function onlineCity(seed: number, disaster: boolean): Game {
  const g = newGame('mission', seed, DEFAULT_SETTINGS, 5);
  return {
    ...g,
    mode: 'citylab',
    labPaused: false,
    vertical: freshVertical(),
    won: false,
    city: { ...g.city, unlimited: false, speed: 1 },
    ...(disaster
      ? {
          disaster: {
            ...freshDisaster('free', seed ^ 0x715a),
            setting: 'custom' as const,
            config: { ...freshDisaster('free').config, kind: 'wind' as const, level: 1, wind: 16 },
          },
        }
      : {}),
  };
}
export function withHand(g: Game, h: HandView): Game {
  return {
    ...g,
    active: h.active,
    next: h.next,
    hold: h.hold,
    holdUsed: h.holdUsed,
    remaining: h.remaining,
    reservedActive: null,
  };
}
// Only public city state leaves the authority. No future random state or hidden queue.
export function publicCity(g: Game): Game {
  return {
    ...g,
    supply: { seed: 0, bag: [], draws: 0 },
    active: { kind: 'road', shape: 'single', rotation: 0 },
    next: [],
    hold: null,
    reservedActive: null,
    ...(g.disaster ? { disaster: { ...g.disaster, seed: 0, initialSeed: 0 } } : {}),
  };
}
export function execute(
  g: Game,
  h: Hand,
  a: Action,
  host: boolean,
  coop: boolean,
): { game: Game; hand: Hand; error?: string } {
  const fail = (error: string) => ({ game: g, hand: h, error });
  if (g.structure.loss) return fail('cityLost');
  if ('hand' in a && a.hand !== h.token) return fail('staleHand');
  if (a.type === 'hold') {
    if (h.holdUsed) return fail('holdUsed');
    const next = h.hold ? { ...h, active: h.hold, token: h.token + 1 } : advanceHand(h);
    return { game: g, hand: { ...next, hold: h.active, holdUsed: true, remaining: h.remaining } };
  }
  if (a.type === 'recycle') return { game: g, hand: advanceHand(h) };
  if (a.type === 'place') {
    if ((a.pitch || a.roll) && !['beam', 'truss'].includes(h.active.kind))
      return fail('invalidRotation');
    if (g.buildings.length + g.platforms.length >= ONLINE.maxBuilds) return fail('buildLimit');
    const candidate = {
      ...withHand(g, h),
      cursor: a.cell,
      vertical: g.vertical ? { ...g.vertical, floor: a.cell.y } : undefined,
      active: { ...h.active, rotation: a.rotation, pitch: a.pitch, roll: a.roll },
    };
    const validation = validatePlacement(candidate);
    if (!validation.valid) return fail(validation.reason);
    const next = place(candidate);
    if (next === candidate) return fail('denied');
    if (next.buildings.length + next.platforms.length > ONLINE.maxBuilds) return fail('buildLimit');
    return { game: next, hand: advanceHand(h) };
  }
  if (a.type === 'demolish' && coop && !host) return fail('hostOnly');
  const next =
    a.type === 'upgrade'
      ? upgrade(g, a.id)
      : a.type === 'emergency'
        ? maintenance.emergencyLift(g, a.cell)
        : a.type === 'food'
          ? emergencyFood(g)
          : a.type === 'power'
            ? emergencyPower(g)
            : maintenance[a.type](g, a.target);
  return next === g ? fail('denied') : { game: next, hand: h };
}
export const advanceCity = (g: Game, dt: number) => tick(g, dt);
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export function scoreCity(g: Game): Score {
  const s = analyze(g),
    c = cityReport(g);
  const efficiency = clamp(g.population / Math.max(1, g.platforms.length) / 2);
  const operations = [...c.operations.values()];
  const connected = operations.length
    ? operations.filter((o) => o.road).length / operations.length
    : 0;
  const values = [
    clamp(g.population / 100),
    s.stability / 100,
    clamp((c.net + 2) / 5),
    connected,
    g.city.happiness / 100,
    efficiency,
  ];
  const parts = values.map((v, i) => Math.round(clamp(v) * ONLINE.scoreWeights[i] * 100));
  return {
    total: parts.reduce((a, b) => a + b, 0),
    parts,
    stability: s.stability,
    efficiency,
    objectives: [
      g.population >= ONLINE.coopPopulation,
      s.stability >= ONLINE.coopStability,
      c.foodProduction >= c.foodConsumption,
      c.deficit < 0.01,
    ].filter(Boolean).length,
  };
}
export function compareScores(a: Score, b: Score) {
  return (
    a.objectives - b.objectives ||
    a.total - b.total ||
    a.stability - b.stability ||
    a.efficiency - b.efficiency
  );
}
