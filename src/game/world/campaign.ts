import type { Game, Settings } from '../../types/game';
import type { CityRecord, ShipType } from '../../types/world';
import { disasterCity, authorPlot } from '../disasters/scenarios';
import { newWorld } from './scenarios';
import { attachWorld, context, emptyRare } from './state';
import { availablePorts } from './logistics';
import { technologies } from './definitions';
import { reconcileResidents } from '../city/population';
const templates = new Map<string, Game>();
export function worldStage(settings: Settings, id: number, seed: number): Game {
  const cacheKey = `${id}:${settings.difficulty}:${seed}`;
  const cached = templates.get(cacheKey);
  if (cached) return { ...structuredClone(cached), settings };
  let g = newWorld(settings, seed, { disasters: 0 });
  const w = g.world!;
  w.mode = 'campaign';
  const ship = (type: ShipType, city = w.capital) => {
    const id = `ship-${w.nextId++}`;
    w.ships.push({
      id,
      type,
      home: city,
      location: city,
      hp: 100,
      fuel: 0,
      state: 'docked',
      remaining: 0,
      cargo: {},
      trip: null,
    });
    return id;
  };
  if (id === 26) {
    g = { ...g, buildings: g.buildings.filter((b) => b.kind !== 'explorationPort') };
    w.cities[0].game = { ...g, world: undefined };
  }
  if (id === 27) {
    w.research.completed = ['navigation'];
    w.research.points = 20;
    ship('research');
    w.islands.find((i) => i.ruins)!.discovered = true;
  }
  if (id === 28) {
    ship('colony');
    ship('colony');
    ship('lightCargo');
    ship('lightCargo');
    w.islands[1].discovered = true;
    w.islands[2].discovered = true;
  }
  if (id >= 29) {
    const count = id === 30 ? 4 : 3;
    if (id === 30) {
      w.research.completed = technologies.filter((t) => t.id !== 'federation').map((t) => t.id);
      w.research.points = 100;
      let city = disasterCity(settings, 'free', true);
      city = {
        ...city,
        disaster: { ...city.disaster!, setting: 'off' },
        worldContext: {
          region: 'firstSky',
          specialty: 'mixed',
          techs: w.research.completed,
          bridgeMass: 0,
        },
      };
      for (const kind of ['port', 'shipyard', 'researchLab', 'distributedLiftCore'] as const)
        city = authorPlot(city, kind);
      w.cities[0].game = city;
    } else w.research.completed = ['efficientFuel', 'advancedAether'];
    const template = structuredClone(w.cities[0].game);
    for (let i = 0; i < count; i++) {
      const c: CityRecord = {
        id: i === 0 ? w.capital : `city-${w.nextId++}`,
        island: w.islands[i].id,
        name: ['Aetheria', 'Emerald', 'Ironhaven', 'Aurora'][i],
        specialty: (['mixed', 'agriculture', 'industry', 'energy'] as const)[i],
        pending: 0,
        game: structuredClone(template),
        rare: {
          ...emptyRare(),
          pureAether: id === 30 ? 25 : 0,
          ancientAlloy: id === 30 ? 25 : 0,
          data: id === 30 ? 10 : 0,
        },
        camera: null,
      };
      c.game = {
        ...c.game,
        missionId: 8,
        world: undefined,
        campaign: undefined,
        worldContext: context({ ...w, cities: [c] }, c),
        labPaused: false,
        city: {
          ...c.game.city,
          credits: 5000,
          unlimited: false,
          stocks: { core: { food: 220, materials: 600, aether: 80 } },
          speed: 1,
        },
      };
      c.game = reconcileResidents(c.game);
      for (const b of c.game.buildings.filter((b) =>
        ['port', 'explorationPort'].includes(b.kind),
      )) {
        for (let rotation = 0; rotation < 4; rotation++) {
          const candidate = {
            ...c.game,
            buildings: c.game.buildings.map((x) => (x.id === b.id ? { ...x, rotation } : x)),
          };
          if (availablePorts(candidate).length) {
            c.game = candidate;
            break;
          }
        }
      }
      if (i === 0) w.cities[0] = c;
      else w.cities.push(c);
      w.islands[i].discovered = true;
      w.islands[i].visited = true;
    }
    const pairs =
      id === 30
        ? [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 0],
            [0, 2],
          ]
        : [
            [0, 1],
            [1, 2],
          ];
    for (const [from, to] of pairs) {
      const a = w.cities[from],
        b = w.cities[to],
        vessel = ship('lightCargo', a.id);
      w.routes.push({
        id: `route-${w.nextId++}`,
        from: a.id,
        to: b.id,
        ship: vessel,
        resource: 'materials',
        amount: 40,
        reserve: 60,
        target: 800,
        interval: 20,
        next: 0,
        priority: 1,
        enabled: id === 30,
        allowRisk: false,
        delivered: 0,
      });
    }
    if (id === 29) {
      ship('rescue');
      ship('rescue');
      const c = w.cities[2];
      c.game = {
        ...c.game,
        city: { ...c.game.city, stocks: { core: { food: 10, materials: 10, aether: 30 } } },
      };
    }
  }
  w.cities[0].game = id <= 28 ? { ...g, world: undefined } : w.cities[0].game;
  g = attachWorld(g, w);
  templates.set(cacheKey, structuredClone(g));
  return g;
}
