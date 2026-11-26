import { worldStage } from '../world/campaign';
import { snapshot } from '../disasters/scheduler';
import { disasterStage } from '../disasters/scenarios';
import { verticalExample, verticalMetropolis } from '../vertical/scenarios';
import { configureLivingScenario } from '../city/scenarios';
import type { Game, Settings, Kind } from '../../types/game';
import { newGame } from '../engine';
import { stage } from './definitions';
import { makePlatform, makeBuilding } from '../stability/state';
import { BLOCKS, PHYSICAL } from '../../data/rules';
import { analyze } from '../analysis';
import { cellsOf, key, neighbors } from '../grid';
import { reconcileResidents } from '../city/population';
import { freshCity } from '../city/state';
export function loadStage(id: number, settings: Settings, seed = stage(id).seed): Game {
  const d = stage(id);
  let g =
    id >= 26 && id <= 30
      ? worldStage(settings, id, seed)
      : id >= 21 && id <= 25
        ? disasterStage(settings, id)
        : id === 20
          ? verticalMetropolis(settings)
          : id >= 16 && id <= 19
            ? verticalExample(
                settings,
                id === 17 ? 'B' : id === 18 ? 'C' : id === 19 ? 'D' : undefined,
              )
            : newGame('mission', seed, settings, d.source);
  if (id >= 16 && id <= 25) {
    g.mode = 'mission';
    g.missionId = d.source;
    g.labPaused = false;
    if (id === 18) g.buildings = g.buildings.filter((b) => b.kind !== 'bridge');
    if (id === 19) g.buildings = g.buildings.filter((b) => b.kind !== 'cargoElevator');
  }
  if (d.layout === 'long' && d.source < 3) {
    g = {
      ...g,
      platforms: Array.from({ length: 48 }, (_, i) => {
        const x = (i % 8) - 4,
          z = Math.floor(i / 8) - 3;
        return makePlatform({ x, z }, 'platform', 0, 1, x >= -3 && x <= 2 && z <= 2);
      }),
    };
  }
  if (d.layout === 'L') {
    g = { ...g, platforms: g.platforms.filter((p) => !(p.x > 0 && p.z > 0)) };
  }
  if (d.id === 4 || d.id === 5) {
    // Beginner city uses unlocked homes; preserve the two-cell plot footprints.
    g = configureLivingScenario(g, 'largeHome');
    if (d.id === 4) {
      g = {
        ...g,
        platforms: [
          ...g.platforms,
          ...[
            [-4, 0],
            [4, 0],
            [0, -4],
            [0, 4],
          ].map(([x, z]) => makePlatform({ x, z }, 'platform', 0, 1, false)),
        ],
      };
    }
    if (d.id === 5) {
      const extra = [];
      for (const x of [-5, -4, 4, 5])
        for (let z = -2; z <= 2; z++) extra.push(makePlatform({ x, z }, 'platform', 0, 1, false));
      g = { ...g, platforms: [...g.platforms, ...extra] };
    }
  }
  if (d.id === 8) {
    g = {
      ...g,
      buildings: g.buildings.map((b) => ({ ...b, durability: PHYSICAL[b.kind].hp })),
      platforms: g.platforms.map((p) => ({ ...p, durability: 100 })),
      structure: {
        ...g.structure,
        edges: Object.fromEntries(
          Object.keys(g.structure.edges).map((k) => [k, { durability: 70, reinforcement: 0 }]),
        ),
      },
    };
  }
  if (d.id === 9 || id === 102) {
    const lost = g.platforms.filter((p) => p.x === 6 && p.z === 1);
    g = {
      ...g,
      platforms: g.platforms.filter((p) => !lost.includes(p)),
      buildings: g.buildings.filter(
        (b) => !cellsOf(b, b.origin).some((c) => lost.some((p) => key(p) === key(c))),
      ),
    };
  }
  if (d.id === 15) {
    const used = new Set(g.platforms.map(key));
    const platforms = [...g.platforms];
    for (let z = -6; z <= 6; z++)
      for (let x = -6; x <= 6; x++)
        if (!used.has(key({ x, z })))
          platforms.push(makePlatform({ x, z }, 'platform', 0, 1, false));
    g = {
      ...g,
      platforms,
      buildings: g.buildings.map((b) => (b.kind === 'housingEstate' ? { ...b, level: 2 } : b)),
    };
    const fit = (kind: Kind, level = 0) => {
      const occupied = new Set([
          '0,0',
          ...g.buildings.flatMap((b) => cellsOf(b, b.origin).map(key)),
        ]),
        road = new Set(g.buildings.filter((b) => b.kind === 'road').map((b) => key(b.origin)));
      let best: Game | null = null,
        score = -Infinity;
      for (const p of g.platforms) {
        const b = {
            ...makeBuilding({ kind, shape: BLOCKS[kind].shapes[0], rotation: 0 }, p, g.nextId),
            initial: true,
            level,
          },
          cells = cellsOf(b, b.origin);
        if (
          !cells.every(
            (c) => g.platforms.some((p) => key(p) === key(c)) && !occupied.has(key(c)),
          ) ||
          !cells.some((c) => neighbors(c).some((n) => road.has(key(n))))
        )
          continue;
        const next = { ...g, nextId: g.nextId + 1, buildings: [...g.buildings, b] },
          s = analyze(next);
        const value = s.stability - (s.structural.critical ? 40 : 0);
        if (value > score) {
          best = next;
          score = value;
        }
      }
      if (!best) throw Error('Campaign plot unavailable');
      g = best;
    };
    fit('housingEstate', 2);
    fit('advancedPower', 1);
    fit('greenhouse', 1);
    fit('liftLarge', 2);
    fit('park');
    fit('park');
  }
  const resources = Math.round(
    d.resources *
      (settings.difficulty === 'easy' ? 1.25 : settings.difficulty === 'hard' ? 0.8 : 1),
  );
  const population = d.population ?? g.population;
  g = {
    ...g,
    resources,
    remaining: 20,
    population,
    won: false,
    missionHold: 0,
    city: {
      ...g.city,
      enabled: d.food,
      unlimited: false,
      credits: Math.max(180, resources),
      stocks: {
        core: { food: id === 14 ? 15 : 180, materials: Math.min(resources, 600), aether: 40 },
      },
      residents: {},
      displaced: d.food ? population : 0,
      happiness: id === 14 ? 35 : 75,
      speed: 1,
      orders: [],
      accumulator: 0,
    },
    structure: {
      ...g.structure,
      grace: settings.difficulty === 'easy' ? 60 : 40,
      events: [],
      collapsedCount: 0,
      loss: null,
      criticalTime: 0,
    },
  };
  if (!d.food)
    g = {
      ...g,
      city: {
        ...freshCity(false, resources, settings.difficulty),
        stocks: { core: { food: 180, materials: resources, aether: 40 } },
      },
    };
  if (g.city.enabled) g = reconcileResidents(g);
  const pieces = Array.from({ length: 4 }, (_, i) => {
    const kind = d.script[i % d.script.length];
    return { kind, shape: BLOCKS[kind].shapes[0], rotation: 0 };
  });
  g = {
    ...g,
    active: pieces[0],
    next: pieces.slice(1),
    hold: null,
    holdUsed: false,
    reservedActive: null,
    supply: { seed, draws: 4, bag: [], policy: 'classic' },
    campaign: {
      stage: id,
      seed,
      initialPlatforms: g.platforms.map(key),
      initialBuildings: g.buildings.length,
      protectedIds: g.buildings.filter((b) => d.protect?.includes(b.kind)).map((b) => b.id),
      placed: 0,
      spent: 0,
      used: 0,
      latched: [],
      seen: [],
      dialogue: 'briefing',
      line: 0,
      history: [],
      choice: null,
      hold: 0,
      checkpointUsed: false,
      result: null,
      failed: null,
      continued: false,
      peakPopulation: g.population,
      peakStability: analyze(g).stability,
      safeTime: 0,
      profitTime: 0,
      initialSeparation: analyze(g).structural.separation,
      lastCollapsed: g.structure.collapsedCount,
      claimed: false,
      daily: null,
      intro: true,
    },
  };
  if (g.disaster?.baseline)
    g = {
      ...g,
      disaster: { ...g.disaster, baseline: { ...g.disaster.baseline, snapshot: snapshot(g) } },
    };
  if (g.world) {
    // World scenarios retain independent authored city budgets and residents.
    const original = worldStage(settings, id, seed);
    g = { ...original, campaign: g.campaign, active: g.active, next: g.next, supply: g.supply };
  }
  return g;
}
