import { tickWorld } from './world/runtime';
import { disasterBefore, disasterAfter } from './disasters/manager';
import { stage } from './campaign/definitions';
import { campaignDraw, campaignStep } from './campaign/runtime';
import { freshCity, cityEvent } from './city/state';
import { reconcileResidents } from './city/population';
import { reconcileStores } from './city/simulation';
import { tickCity } from './city/simulation';
import { inventory, adjustStock, pay } from './city/inventory';
import { cityReport } from './city/report';
import { constructionCost } from './city/actions';
import { configureLivingScenario } from './city/scenarios';
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
import { simulateStructure, structureStep } from './stability/simulation';
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
  let supply = {
    seed,
    bag: [],
    draws: 0,
    policy: 'adaptive',
    version: 2,
    recent: [],
  } as Game['supply'];
  const pieces: Piece[] = [];
  for (let i = 0; i < 4; i++) {
    const [p, s] = draw(supply, mode === 'training', {
      script: mode === 'mission' ? MISSIONS[missionId].script : [],
    });
    pieces.push(p);
    supply = s;
  }
  const g: Game = {
    version: 5,
    city: freshCity(
      mode === 'citylab' || (mode === 'mission' && missionId >= 5),
      mode === 'mission' ? MISSIONS[missionId].resources : 100,
      settings.difficulty,
    ),
    missionId,
    labExample,
    labPaused: mode === 'lab' || mode === 'citylab',
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
  if (mode === 'lab' || mode === 'citylab')
    g.active = { kind: 'factory', shape: 'single', rotation: 0 };
  return g.city.enabled ? configureLivingScenario(g) : configureScenario(g);
}
function advance(g: Game): Game {
  if (g.reservedActive) return { ...g, active: g.reservedActive, reservedActive: null };
  if (g.campaign) {
    let next = campaignDraw(g);
    if (g.city.orders[0]?.remaining === 0)
      next = {
        ...next,
        next: [...next.next.slice(0, 2), g.city.orders[0].piece],
        city: { ...next.city, orders: next.city.orders.slice(1) },
      };
    return next;
  }
  if (g.mode === 'citylab' && g.city.orders[0]?.remaining === 0)
    return cityEvent(
      { ...g, active: g.city.orders[0].piece, city: { ...g.city, orders: g.city.orders.slice(1) } },
      'delivery',
    );
  if (
    g.mode === 'lab' ||
    (g.mode === 'citylab' &&
      !g.worldContext &&
      !g.polish?.freeStyle &&
      g.disaster?.mode !== 'survival')
  )
    return { ...g, remaining: g.worldContext?.blockTime || RULES.fallSeconds, holdUsed: false };
  const s = analyze(g);
  const [randomPiece, randomSupply] = draw(g.supply, g.mode === 'training', {
    world: g.worldContext,
    vertical: !!g.vertical,
    disaster: !!g.disaster && !['off', 'weather'].includes(g.disaster.setting),
    hazard: g.disaster?.phase === 'forecast' ? g.disaster.threat?.kind : undefined,
    script: g.mode === 'mission' ? MISSIONS[g.missionId].script : [],
    needsLift: s.lift - s.mass < 80,
    needsSpace: g.platforms.length - g.buildings.length < 10,
    needsRoad: s.disconnected > 2,
    city: g.city.enabled
      ? {
          tier: Math.max(
            g.city.tier,
            g.missionId >= 8 ? 4 : g.missionId >= 7 ? 3 : g.missionId >= 6 ? 2 : 1,
          ),
          needFood: cityReport(g).foodETA < 120,
          needPower: cityReport(g).deficit > 0,
        }
      : undefined,
  });
  const ready = g.city.orders[0]?.remaining === 0;
  const piece = ready ? g.city.orders[0].piece : randomPiece,
    supply = ready ? g.supply : randomSupply;
  if (ready)
    g = cityEvent({ ...g, city: { ...g.city, orders: g.city.orders.slice(1) } }, 'delivery');
  return {
    ...g,
    active: g.next[0],
    next: [...g.next.slice(1), piece],
    supply,
    remaining: g.worldContext?.blockTime || RULES.fallSeconds,
    holdUsed: false,
  };
}
export function place(g: Game): Game {
  if (
    g.structure.loss ||
    g.campaign?.dialogue ||
    g.campaign?.failed ||
    (g.campaign?.result && !g.campaign.continued)
  )
    return g;
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
  const paid = g.city.enabled ? pay(g, constructionCost(g, g.active.kind)) : g;
  changed = {
    ...changed,
    city: paid.city,
    nextId: g.nextId + 1,
    score: g.score + definition.score,
    resources: g.city.enabled
      ? paid.resources
      : g.resources - (g.reservedActive ? costFor(g, PHYSICAL[g.active.kind].cost) : 0),
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
  if (g.campaign)
    changed = {
      ...changed,
      campaign: {
        ...g.campaign,
        placed: g.campaign.placed + 1,
        used: g.campaign.used + 1,
        spent: g.campaign.spent + Math.max(0, g.resources - changed.resources),
      },
    };
  if (changed.vertical)
    changed = {
      ...changed,
      vertical: {
        ...changed.vertical,
        builtColumns:
          changed.vertical.builtColumns +
          (['column', 'reinforcedColumn', 'industrialColumn', 'aetherColumn'].includes(
            g.active.kind,
          )
            ? 1
            : 0),
        builtBridges:
          changed.vertical.builtBridges + (g.active.kind.toLowerCase().includes('bridge') ? 1 : 0),
      },
    };
  if (g.world && g.active.kind === 'nexus') {
    changed = {
      ...changed,
      world: {
        ...g.world,
        cities: g.world.cities.map((c) =>
          c.id === g.world!.active
            ? {
                ...c,
                rare: {
                  ...c.rare,
                  pureAether: c.rare.pureAether - 20,
                  ancientAlloy: c.rare.ancientAlloy - 20,
                },
              }
            : c,
        ),
      },
    };
  }
  changed = advance(changed);
  if (changed.campaign) return campaignStep(changed, 0);
  return {
    ...changed,
    won: g.won || (g.mode === 'mission' && g.missionId === 1 && objectives(changed).every(Boolean)),
  };
}
export function recycle(g: Game, automatic = false): Game {
  if (
    g.structure.loss ||
    g.campaign?.dialogue ||
    g.campaign?.failed ||
    (g.campaign?.result && !g.campaign.continued)
  )
    return g;
  if (
    !automatic &&
    !g.city.unlimited &&
    !(g.campaign && stage(g.campaign.stage).limit) &&
    g.elapsed < (g.polish?.recycleAt ?? 0)
  )
    return g;
  g = { ...g, polish: { ...g.polish, version: 1, recycleAt: g.elapsed + RULES.recycleCooldown } };
  if (g.campaign) {
    const d = stage(g.campaign.stage);
    if (d.limit && g.campaign.used >= d.limit) return g;
    return campaignStep(
      advance({ ...g, campaign: { ...g.campaign, used: g.campaign.used + 1 } }),
      0,
    );
  }
  if (g.reservedActive || g.mode === 'lab' || g.mode === 'citylab') return advance(g);
  if (g.city.enabled) {
    const next = adjustStock(g, inventory(g).root, 'materials', RULES.recycleResources);
    return advance({ ...next, score: Math.max(0, g.score - RULES.recyclePenalty) });
  }
  return advance({
    ...g,
    resources: g.resources + RULES.recycleResources,
    score: Math.max(0, g.score - RULES.recyclePenalty),
  });
}
export function hold(g: Game): Game {
  if (g.campaign && stage(g.campaign.stage).limit) return g;
  if (
    g.reservedActive ||
    g.structure.loss ||
    g.mode === 'lab' ||
    (g.mode === 'citylab' && !g.worldContext && !g.polish?.freeStyle)
  )
    return g;
  if (g.holdUsed) return g;
  // Exchanging never resets the deadline: a hold cannot bypass the falling timer.
  if (g.hold) return { ...g, active: g.hold, hold: g.active, holdUsed: true };
  return { ...advance(g), hold: g.active, holdUsed: true, remaining: g.remaining };
}
export function move(g: Game, cursor: Cell): Game {
  if (!Number.isFinite(cursor.x) || !Number.isFinite(cursor.z)) return g;
  const c = {
    ...(g.vertical ? { y: g.vertical.floor } : {}),
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
export function tickStep(g: Game, dt: number, background = false): Game {
  if (!Number.isFinite(dt) || dt <= 0 || g.structure.loss || g.labPaused) return g;
  dt = Math.min(dt, 1); // Never punish players for a hidden tab or a stalled frame.
  const stats = analyze(g);
  if (g.mode === 'training' && stats.structural.critical) return g;
  let result: Game = {
    ...g,
    elapsed: g.elapsed + dt,
    population: g.city.enabled
      ? g.population
      : Math.min(stats.poweredCapacity, g.population + dt * RULES.populationPerSecond),
    remaining:
      g.mode !== 'mission' || g.reservedActive || (g.campaign && !stage(g.campaign.stage).fall)
        ? g.remaining
        : Math.max(
            0,
            g.remaining -
              dt *
                (g.campaign
                  ? g.difficulty === 'easy'
                    ? 0.5
                    : g.difficulty === 'hard'
                      ? 1.25
                      : 1
                  : 1) *
                (stats.structural.critical ? DIFFICULTIES[g.difficulty].fallSlow : 1),
          ),
    resources:
      g.resources +
      (!g.city.enabled && g.mode === 'mission' && g.missionId > 1
        ? g.population * STRUCTURE.incomePerPersonSecond * dt
        : 0),
  };
  // A disconnected city stops growing; existing residents stay until capacity falls.
  if (!g.city.enabled)
    result.population = Math.min(stats.capacity, Math.max(g.population, result.population));
  if (result.remaining === 0) {
    const candidate = validatePlacement(result);
    result = candidate.valid && candidate.risk < 2 ? place(result) : recycle(result, true);
  }
  result = disasterBefore(result, dt);
  if (!g.campaign || stage(g.campaign.stage).structure)
    result = background ? structureStep(result, dt) : simulateStructure(result, dt);
  if (result.city.enabled) {
    if (result.buildings !== g.buildings) result = reconcileStores(reconcileResidents(result));
    result = tickCity(result, dt);
  } else
    result = { ...result, city: { ...result.city, dayTime: (result.city.dayTime + dt) % 360 } };
  result = disasterAfter(result);
  if (result.campaign) return campaignStep(result, dt);
  const complete = objectives(result).every(Boolean) && !result.structure.loss;
  const missionHold = complete ? result.missionHold + dt : 0;
  if (
    g.mode === 'mission' &&
    result.city.enabled &&
    complete &&
    missionHold >= MISSIONS[g.missionId].hold &&
    !result.city.missionRewarded
  )
    result = {
      ...result,
      city: { ...result.city, credits: result.city.credits + 250, missionRewarded: true },
    };
  return {
    ...result,
    missionHold,
    won:
      result.won || (g.mode === 'mission' && complete && missionHold >= MISSIONS[g.missionId].hold),
  };
}

export function tick(g: Game, dt: number): Game {
  if (g.world) {
    const next = tickWorld(g, dt, tickStep, (city) => {
      const candidate = validatePlacement(city);
      return candidate.valid && candidate.risk < 2 ? place(city) : recycle(city, true);
    });
    return next.campaign ? campaignStep(next, next.world!.clock - g.world.clock) : next;
  }
  if (
    g.campaign &&
    (g.campaign.dialogue || g.campaign.failed || (g.campaign.result && !g.campaign.continued))
  )
    return g;
  if (!Number.isFinite(dt) || dt <= 0 || g.structure.loss || g.labPaused || g.city.speed === 0)
    return g;
  if (!g.city.enabled && g.city.speed === 1) return tickStep(g, dt);
  let next = g,
    acc = g.city.accumulator + Math.min(dt, 1) * g.city.speed,
    steps = 0;
  while (
    acc + 1e-9 >= 0.25 &&
    steps++ < 12 &&
    !next.structure.loss &&
    !next.campaign?.failed &&
    !(next.campaign?.result && !next.campaign.continued)
  ) {
    next = tickStep(next, 0.25);
    acc -= 0.25;
  }
  return {
    ...next,
    city: {
      ...next.city,
      accumulator:
        next.structure.loss ||
        next.campaign?.failed ||
        (next.campaign?.result && !next.campaign.continued) ||
        acc < 1e-9
          ? 0
          : acc,
    },
  };
}
