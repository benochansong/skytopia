import { reconcileResidents } from '../city/population';
import type { Game } from '../../types/game';
import type { CityRecord, Island, WorldState } from '../../types/world';
import { REGIONS } from '../../types/world';
import { regionNames } from './definitions';
export const emptyRare = () => ({ metal: 0, pureAether: 0, ancientAlloy: 0, data: 0 });
export function localGame(g: Game): Game {
  const { world: _world, campaign: _campaign, ...local } = g;
  return local;
}
export function generateIslands(seed: number, size = 18): Island[] {
  let n = seed >>> 0;
  const random = () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
  return Array.from({ length: Math.max(12, Math.min(20, Math.floor(size))) }, (_, i) => {
    const region = REGIONS[i % 6],
      r = i % 6,
      ring = Math.floor(i / 6),
      angle = (r * Math.PI) / 3;
    return {
      id: `island-${i + 1}`,
      name: `${regionNames[region][0]} ${ring + 1}`,
      region,
      x: Math.round(400 + Math.cos(angle) * (100 + ring * 100) + (random() - 0.5) * 50),
      y: Math.round(300 + Math.sin(angle) * (100 + ring * 100) + (random() - 0.5) * 50),
      radius: 18 + Math.floor(random() * 13),
      rockMass: 100 + Math.floor(random() * 150) + (region === 'iron' ? 150 : 0),
      lift: 400 + Math.floor(random() * 200),
      fertility: region === 'emerald' ? 1.5 : region === 'frozen' ? 0.65 : 1,
      mineral: region === 'iron' ? 1.5 : 1,
      aether: region === 'aether' ? 1.5 : 1,
      temperature: region === 'frozen' ? -25 : region === 'iron' ? 30 : 18,
      wind: region === 'iron' ? 1.4 : 1,
      risk: region === 'lostHeavens' ? 0.7 : region === 'aether' ? 0.5 : 0.15,
      ruins: region === 'lostHeavens' || (region === 'frozen' && ring === 1),
      discovered: i === 0,
      visited: i === 0,
      artifact: 'unseen',
      colonyCost: 60 + ring * 15,
    };
  });
}
export function context(w: WorldState, c: CityRecord) {
  const island = w.islands.find((i) => i.id === c.island)!;
  return {
    massOffset: c.island === 'island-1' ? 0 : (island.rockMass - 100) * 0.1,
    liftOffset: c.island === 'island-1' ? 0 : (island.lift - 500) * 0.1,
    blockTime: w.config.blockTime,
    disasterFrequency: w.config.disasters,
    region: island.region,
    specialty: c.specialty,
    techs: w.research.completed,
    bridgeMass: w.bridges.filter((b) => b.hp > 0 && (b.from === c.id || b.to === c.id)).length * 20,
  };
}
export function syncWorld(g: Game): WorldState {
  const w = g.world!;
  return {
    ...w,
    cities: w.cities.map((c) => (c.id === w.active ? { ...c, game: localGame(g) } : c)),
  };
}
export function attachWorld(g: Game, w: WorldState): Game {
  const active = w.cities.find((c) => c.id === w.active)!;
  const nextContext = context(w, active),
    worldContext =
      JSON.stringify(nextContext) === JSON.stringify(active.game.worldContext)
        ? active.game.worldContext
        : nextContext;
  return {
    ...active.game,
    settings: g.settings,
    worldContext,
    world: w,
    won: g.campaign ? g.won : active.game.won,
    campaign: g.campaign,
  };
}
export function createWorld(
  g: Game,
  seed = 70127,
  patch: Partial<WorldState['config']> = {},
): Game {
  const config = {
    maxCities: 6,
    size: 18,
    resources: 1,
    researchSpeed: 1,
    disasters: 1,
    tradeDifficulty: 1,
    blockTime: 0,
    ...patch,
  };
  config.maxCities = Math.max(1, Math.min(6, Math.round(config.maxCities) || 6));
  config.size = Math.max(12, Math.min(20, Math.round(config.size) || 18));
  const local = {
    ...localGame(g),
    mode: 'citylab' as const,
    labPaused: false,
    won: false,
    remaining: config.blockTime || g.remaining,
    city: { ...g.city, enabled: true, unlimited: false, speed: 1 as const },
  };
  const c: CityRecord = {
    id: 'city-1',
    pending: 0,
    island: 'island-1',
    name: 'Aetheria',
    specialty: 'mixed',
    game: g.city.enabled ? local : reconcileResidents(local),
    rare: emptyRare(),
    camera: null,
  };
  const w: WorldState = {
    version: 1,
    name: 'SKYTOPIA',
    seed: seed >>> 0,
    mode: 'civilization',
    example: 'A',
    active: c.id,
    capital: c.id,
    view: 'map',
    inspected: [],
    colonyTarget: null,
    clock: 0,
    accumulator: 0,
    nextId: 2,
    config,
    islands: generateIslands(seed, config.size),
    cities: [c],
    ships: [],
    routes: [],
    bridges: [],
    research: { points: 0, completed: [], active: null },
    ledger: [],
    stats: {
      explored: 0,
      colonies: 0,
      deliveries: 0,
      food: 0,
      materials: 0,
      rescued: 0,
      recovered: 0,
    },
    ending: { scene: 0, seen: false, continued: false },
    notice: '',
  };
  return attachWorld({ ...local, campaign: undefined }, w);
}
export function switchCity(g: Game, id: string): Game {
  if (!g.world || !g.world.cities.some((c) => c.id === id)) return g;
  const w = syncWorld(g),
    speed = g.city.speed;
  const result = attachWorld(g, { ...w, active: id, view: 'city' });
  return { ...result, labPaused: g.labPaused, city: { ...result.city, speed } };
}
export function changeWorld(g: Game, update: (w: WorldState) => WorldState): Game {
  return g.world ? attachWorld(g, update(syncWorld(g))) : g;
}
