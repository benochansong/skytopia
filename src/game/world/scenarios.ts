import { inventory, adjustStock } from '../city/inventory';
import { freshDisaster } from '../disasters/state';
import type { Game, Settings } from '../../types/game';
import type { CityRecord, Island } from '../../types/world';
import { DEFAULT_SETTINGS, PHYSICAL } from '../../data/rules';
import { disasterCity, authorPlot } from '../disasters/scenarios';
import { newGame } from '../engine';
import { reconcileResidents } from '../city/population';
import { createWorld, emptyRare, attachWorld } from './state';
import { availablePorts } from './logistics';
export function worldCapital(settings: Settings = DEFAULT_SETTINGS): Game {
  let g = disasterCity(settings, 'free');
  g = {
    ...g,
    worldContext: { region: 'firstSky', specialty: 'mixed', techs: [], bridgeMass: 0 },
    disaster: { ...g.disaster!, setting: 'off' },
    labPaused: false,
    city: { ...g.city, unlimited: false },
  };
  for (const kind of ['explorationPort', 'shipyard', 'researchLab'] as const)
    g = authorPlot(g, kind);
  // Authored ports have a clear approach; orientation is a real docking condition.
  for (const b of g.buildings.filter((b) => b.kind === 'explorationPort')) {
    for (let r = 0; r < 4; r++) {
      const candidate = {
        ...g,
        buildings: g.buildings.map((x) => (x.id === b.id ? { ...x, rotation: r } : x)),
      };
      if (availablePorts(candidate).length) {
        g = candidate;
        break;
      }
    }
  }
  return g;
}
export function colonyCity(source: Game, island: Island, population: number): CityRecord {
  let g = newGame('mission', source.supply.seed, source.settings, 5);
  g = {
    ...g,
    mode: 'citylab',
    labPaused: false,
    population,
    won: false,
    missionHold: 0,
    disaster: {
      ...freshDisaster('free', (source.supply.seed + island.radius * 101) >>> 0),
      setting: source.disaster?.setting ?? 'off',
    },
    city: {
      ...g.city,
      enabled: true,
      unlimited: false,
      credits: 0,
      stocks: { core: { food: 0, materials: 0, aether: 0 } },
      residents: {},
      displaced: population,
      speed: 1,
    },
  };
  // The colony package includes one physical landing pad, replacing a pre-authored park.
  const park = g.buildings.find((b) => b.kind === 'park');
  if (park)
    g = {
      ...g,
      buildings: g.buildings.map((b) =>
        b.id === park.id
          ? {
              ...b,
              kind: 'portSmall',
              shape: 'single',
              rotation: 0,
              durability: PHYSICAL.portSmall.hp,
            }
          : b,
      ),
    };
  g = reconcileResidents(g);
  for (let r = 0; r < 4; r++) {
    const draft = {
      ...g,
      buildings: g.buildings.map((b) => (b.kind === 'portSmall' ? { ...b, rotation: r } : b)),
    };
    if (availablePorts(draft).length) {
      g = draft;
      break;
    }
  }
  return {
    id: '',
    pending: 0,
    island: island.id,
    name: island.name,
    specialty: 'mixed',
    game: g,
    rare: emptyRare(),
    camera: null,
  };
}
export function newWorld(
  settings: Settings = DEFAULT_SETTINGS,
  seed = 70127,
  config: Parameters<typeof createWorld>[2] = {},
): Game {
  let g = createWorld(worldCapital(settings), seed, config);
  const setting =
    g.world!.config.disasters === 0 ? 'off' : g.world!.config.disasters >= 2 ? 'normal' : 'low';
  g = {
    ...g,
    disaster: { ...freshDisaster('free', seed), setting },
    city: { ...g.city, credits: g.city.credits * g.world!.config.resources },
  };
  for (const r of ['food', 'materials', 'aether'] as const) {
    const inv = inventory(g);
    g = adjustStock(g, inv.root, r, inv.stocks[r] * (g.world!.config.resources - 1));
  }
  return g;
}
export function worldExample(
  example: 'A' | 'B' | 'C' | 'D' | 'E',
  settings: Settings = DEFAULT_SETTINGS,
): Game {
  let g = newWorld(settings, 70127, { disasters: 0 });
  const w = g.world!;
  w.mode = 'lab';
  w.example = example;
  const second = {
    ...w.cities[0],
    id: 'city-2',
    island: 'island-2',
    name: 'Emerald',
    specialty: 'agriculture' as const,
    game: structuredClone(w.cities[0].game),
    rare: emptyRare(),
  };
  w.cities = [{ ...w.cities[0], specialty: 'industry' }, second];
  w.nextId = 3;
  w.islands[1].discovered = true;
  w.islands[1].visited = true;
  if (example === 'C') second.specialty = 'energy' as 'agriculture';
  if (example === 'E') second.specialty = 'research' as 'agriculture';
  for (const c of w.cities) c.game = { ...c.game, city: { ...c.game.city, unlimited: true } };
  w.ships = [
    {
      id: 'ship-lab',
      type: example === 'D' ? 'rescue' : 'lightCargo',
      home: second.id,
      location: second.id,
      hp: 100,
      fuel: 0,
      state: 'docked',
      remaining: 0,
      cargo: {},
      trip: null,
    },
  ];
  w.routes = [
    {
      id: 'route-lab',
      from: second.id,
      to: w.capital,
      resource: example === 'C' ? 'aether' : 'food',
      amount: 40,
      reserve: 40,
      target: 250,
      ship: 'ship-lab',
      interval: 15,
      next: 0,
      priority: 0,
      allowRisk: false,
      enabled: example !== 'B',
      delivered: 0,
    },
  ];
  if (example === 'D')
    w.cities[0].game = {
      ...w.cities[0].game,
      city: { ...w.cities[0].game.city, stocks: { core: { food: 5, materials: 100, aether: 30 } } },
    };
  g = attachWorld(g, w);
  return g;
}
