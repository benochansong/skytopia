import { BLOCKS, DEFAULT_SETTINGS, PHYSICAL } from '../../data/rules';
import type { Game, Kind, Settings } from '../../types/game';
import type { DisasterState, Hazard } from '../../types/disaster';
import { newGame } from '../engine';
import { configureLivingScenario } from '../city/scenarios';
import { verticalMetropolis, add } from '../vertical/scenarios';
import { freshVertical } from '../../types/vertical';
import { freshDisaster } from './state';
import { forecast } from './scheduler';
import { validatePlacement } from '../placement';
import { makePlatform } from '../stability/state';
import { STRUCTURE } from '../../data/rules';
import { key, atFloor } from '../grid';
import { reconcileResidents } from '../city/population';
import { updateDefenses } from './protection';
import { captureBlueprints } from './recovery';
import { evacuate } from './evacuation';
import { analyze } from '../analysis';
export function authorPlot(g: Game, kind: Kind, level = 0): Game {
  const piece = { kind, shape: BLOCKS[kind].shapes[0], rotation: 0 };
  let best: Game | null = null,
    bestScore = -Infinity;
  for (const p of [...g.platforms].filter((p) => p.y === 0)) {
    const draft = { ...g, cursor: atFloor(p.x, p.z), active: piece };
    if (!validatePlacement(draft).valid) continue;
    const next = { ...g, buildings: [...g.buildings] };
    add(next, kind, p.x, p.z);
    const id = next.nextId - 1;
    next.buildings = next.buildings.map((b) => (b.id === id ? { ...b, level, initial: true } : b));
    const report = analyze(next);
    if (!report.connectedIds.has(id) || (report.powerRatios.get(id) ?? 0) < 0.99) continue;
    const score = report.stability - (report.structural.critical ? 100 : 0);
    if (score > bestScore) {
      best = next;
      bestScore = score;
    }
  }
  if (best) return best;
  throw Error('No disaster plot for ' + kind);
}
const templates = new Map<string, Game>();
export function disasterCity(
  settings: Settings = DEFAULT_SETTINGS,
  mode: DisasterState['mode'] = 'lab',
  large = false,
): Game {
  const templateKey = mode + ':' + settings.difficulty + ':' + large,
    cached = templates.get(templateKey);
  if (cached) return { ...structuredClone(cached), settings: { ...settings } };
  let g = large
    ? verticalMetropolis(settings)
    : configureLivingScenario(newGame('mission', 60127, settings, 8));
  g = {
    ...g,
    mode: 'citylab',
    campaign: undefined,
    vertical: g.vertical ?? freshVertical(),
    disaster: freshDisaster(mode),
    labPaused: mode === 'lab',
    won: false,
    population: large ? 300 : 130,
    buildings: g.buildings.map((b) => ({ ...b, enabled: true })),
    city: {
      ...g.city,
      enabled: true,
      unlimited: mode === 'lab',
      speed: 1,
      residents: {},
      displaced: large ? 300 : 130,
      stocks: { core: { food: 280, materials: 600, aether: 80 } },
      credits: 2500,
      happiness: 78,
      orders: [],
      batteries: {},
    },
    structure: {
      ...g.structure,
      loss: null,
      criticalTime: 0,
      grace: 40,
      events: [],
      collapsedCount: 0,
    },
  };
  if (!large) {
    for (const z of [-3, -2, 1, 2]) {
      g.platforms = [
        ...g.platforms,
        makePlatform(atFloor(6, z), 'metalPlatform', g.nextId++),
        makePlatform(atFloor(6, z, 1), 'metalDeck', g.nextId++),
      ];
    }
    add(g, 'reinforcedColumn', 6, -3);
    add(g, 'reinforcedColumn', 6, 1);
    add(g, 'stairs', 6, -2);
    add(g, 'verticalRelay', 6, 2);
    add(g, 'roadBridge', 6, -2, 1, 'span', 1);
    add(g, 'home', 6, 2, 1);
    add(g, 'road', 6, -3, 1);
    g = {
      ...g,
      buildings: g.buildings.map((b) => (b.kind === 'housingEstate' ? { ...b, level: 2 } : b)),
    };
    g = reconcileResidents(g);
    // Fixed authored coordinates validated with the physical solver; avoid a search on menu entry.
    for (const [x, z] of [
      [4, -5],
      [4, -4],
      [4, 2],
      [-3, -4],
    ]) {
      add(g, 'liftSmall', x, z);
      g.buildings = g.buildings.map((b) =>
        b.id === g.nextId - 1 ? { ...b, level: 2, initial: true } : b,
      );
    }
  }
  g = reconcileResidents(g);
  // Authored support is paid for by the starting-city budget, not free runtime repairs.
  for (const n of analyze(g).structural.nodes.values())
    if (n.ratio > 0.85)
      g = {
        ...g,
        platforms: g.platforms.map((p) =>
          key(p) === n.key
            ? {
                ...p,
                reinforcement: Math.min(3, p.reinforcement + 1),
                durability: p.durability + 100,
              }
            : p,
        ),
      };
  for (const e of analyze(g).structural.edges.values())
    if (e.ratio > 0.8 && !e.key.includes('~'))
      g = {
        ...g,
        structure: {
          ...g.structure,
          edges: {
            ...g.structure.edges,
            [e.key]: { reinforcement: 2, durability: STRUCTURE.linkHP + 2 * STRUCTURE.braceHP },
          },
        },
      };
  templates.set(templateKey, structuredClone(g));
  return g;
}
export function disasterExample(settings: Settings, example: DisasterState['example'] = 'A'): Game {
  let g = disasterCity(settings, 'lab', example === 'F');
  const kinds: Record<DisasterState['example'], Hazard> = {
    A: 'storm',
    B: 'storm',
    C: 'thunder',
    D: 'meteor',
    E: 'aether',
    F: 'compound',
  };
  const facilities: Partial<Record<DisasterState['example'], Kind[]>> = {
    B: ['windbreak', 'reinforcedWindbreak'],
    C: ['lightningRod', 'emergencyBattery'],
    D: ['shieldSmall'],
    E: ['stabilizer', 'emergencyBattery'],
    F: ['shelter', 'shieldLarge', 'repairCenter'],
  };
  for (const kind of facilities[example] ?? []) g = authorPlot(g, kind);
  const target = g.buildings.find(
    (b) => b.kind === (example === 'D' ? 'shieldSmall' : 'advancedPower'),
  )!.origin;
  g = {
    ...g,
    disaster: {
      ...g.disaster!,
      example,
      config: {
        kind: kinds[example],
        level: 2,
        direction: 315,
        wind: 30,
        duration: 40,
        target: { ...target },
      },
    },
  };
  return updateDefenses(g, 0.25);
}
export function disasterStage(settings: Settings, id: number): Game {
  let g = disasterCity(settings, 'campaign', id === 25);
  if (id === 23) g = authorPlot(g, 'emergencyBattery');
  if (id === 24) {
    g = authorPlot(g, 'shelter');
    const plant = g.buildings.find((b) => b.kind === 'advancedPower')!;
    g = {
      ...g,
      buildings: g.buildings.map((b) =>
        b.id === plant.id ? { ...b, durability: PHYSICAL[b.kind].hp * 0.35 } : b,
      ),
    };
    g = updateDefenses(g, 0.25);
    g = forecast(g, 'meteor', { warning: 90, target: plant.origin, level: 1 });
    g = evacuate(g);
    g = captureBlueprints({ ...g, buildings: g.buildings.filter((b) => b.kind !== 'roadBridge') });
    g = updateDefenses(g, 0);
    g = {
      ...g,
      disaster: {
        ...g.disaster!,
        phase: 'recovery',
        clock: 0,
        stats: { ...g.disaster!.stats, completed: 1 },
      },
    };
    return g;
  }
  const kind: Hazard =
    id === 21 ? 'storm' : id === 22 ? 'meteor' : id === 23 ? 'aether' : 'compound';
  const target = g.buildings.find((b) => b.kind === 'advancedPower')!.origin;
  return forecast(g, kind, {
    target,
    direction: 315,
    level: id === 25 ? 3 : 2,
    wind: id === 25 ? 38 : 30,
  });
}
