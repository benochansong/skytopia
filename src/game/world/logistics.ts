import type { Game, Kind } from '../../types/game';
import type {
  Cargo,
  CargoType,
  CityRecord,
  Ship,
  ShipType,
  TradeRoute,
  WorldState,
} from '../../types/world';
import { inventory, adjustStock, canPay, pay } from '../city/inventory';
import { operatingNetwork } from '../city/operations';
import { cellsOf, key } from '../grid';
import { facility } from '../../data/rules';
import { cityReport } from '../city/report';
import { analyze } from '../analysis';
import { shipDefs, portRanks } from './definitions';
import { attachWorld, syncWorld } from './state';
export function mutableWorld(w: WorldState): WorldState {
  return {
    ...w,
    cities: w.cities.map((c) => ({ ...c, rare: { ...c.rare } })),
    islands: w.islands.map((i) => ({ ...i })),
    ships: w.ships.map((s) => ({
      ...s,
      cargo: { ...s.cargo },
      trip: s.trip ? { ...s.trip } : null,
    })),
    routes: w.routes.map((r) => ({ ...r })),
    bridges: w.bridges.map((b) => ({ ...b })),
    research: {
      ...w.research,
      completed: [...w.research.completed],
      active: w.research.active ? { ...w.research.active } : null,
    },
    stats: { ...w.stats },
    ledger: [...w.ledger],
    ending: { ...w.ending },
  };
}
export function working(g: Game, kind: Kind) {
  const ops = operatingNetwork(g);
  return g.buildings.filter(
    (b) =>
      b.kind === kind &&
      b.enabled &&
      (ops.operations.get(b.id)?.efficiency ?? 0) > 0.25 &&
      ops.road.attachments.get(b.id) === ops.road.root,
  );
}
export function availablePorts(g: Game, rank = 1) {
  if (g.structure.loss) return [];
  const ops = operatingNetwork(g);
  const occupied = new Set(
    g.buildings.filter((b) => b.kind !== 'road').flatMap((b) => cellsOf(b, b.origin).map(key)),
  );
  const offsets = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  return g.buildings.filter((b) => {
    if (
      (portRanks[b.kind] ?? 0) < rank ||
      !b.enabled ||
      (ops.operations.get(b.id)?.efficiency ?? 0) < 0.25 ||
      ops.road.attachments.get(b.id) !== ops.road.root
    )
      return false;
    const [x, z] = offsets[b.rotation];
    return !occupied.has(key({ x: b.origin.x + x, z: b.origin.z + z, y: b.y }));
  });
}
export function cargoStock(c: CityRecord, r: CargoType): number {
  if (r === 'passengers') {
    const road = operatingNetwork(c.game).road;
    return Object.entries(c.game.city.residents).reduce(
      (n, [id, count]) => n + (road.attachments.get(Number(id)) === road.root ? count : 0),
      0,
    );
  }
  if (r === 'food' || r === 'materials' || r === 'aether') return inventory(c.game).stocks[r];
  return c.rare[r];
}
export function cargoRoom(c: CityRecord, r: CargoType): number {
  if (r === 'passengers') {
    const ops = operatingNetwork(c.game);
    return c.game.buildings.reduce(
      (n, b) =>
        n +
        (b.enabled &&
        b.durability > 0 &&
        ops.road.attachments.get(b.id) === ops.road.root &&
        (ops.network.powerRatios.get(b.id) ?? 0) >= 0.99
          ? Math.max(0, facility(b).capacity - (c.game.city.residents[b.id] ?? 0))
          : 0),
      0,
    );
  }
  if (r === 'food' || r === 'materials' || r === 'aether') {
    const inv = inventory(c.game);
    return Math.max(0, inv.capacity[r] - inv.stocks[r]);
  }
  return Math.max(0, (working(c.game, 'internationalWarehouse').length ? 1000 : 200) - c.rare[r]);
}
// Every cargo change goes through the same physical store / resident operation.
export function moveCargo(c: CityRecord, r: CargoType, delta: number): number {
  let amount = Math.min(Math.abs(delta), delta >= 0 ? cargoRoom(c, r) : cargoStock(c, r));
  if (r === 'passengers') {
    const ops = operatingNetwork(c.game);
    amount = Math.floor(amount);
    if (delta >= 0) {
      if (
        c.game.structure.loss ||
        cityReport(c.game).deficit > 0.1 ||
        inventory(c.game).stocks.food < amount * 0.5
      )
        return 0;
      const residents = { ...c.game.city.residents };
      let left = amount;
      for (const b of c.game.buildings.filter((b) => facility(b).capacity > 0)) {
        if (
          !b.enabled ||
          b.durability <= 0 ||
          ops.road.attachments.get(b.id) !== ops.road.root ||
          (ops.network.powerRatios.get(b.id) ?? 0) < 0.99
        )
          continue;
        const room = Math.max(0, facility(b).capacity - (residents[b.id] ?? 0));
        const add = Math.min(left, room);
        residents[b.id] = (residents[b.id] ?? 0) + add;
        left -= add;
        if (!left) break;
      }
      amount -= left;
      c.game = {
        ...c.game,
        population: c.game.population + amount,
        city: { ...c.game.city, residents },
      };
    } else {
      const residents = { ...c.game.city.residents };
      let left = amount;
      for (const id of Object.keys(residents)) {
        if (ops.road.attachments.get(Number(id)) !== ops.road.root) continue;
        const take = Math.min(left, residents[id]);
        residents[id] -= take;
        left -= take;
        if (!left) break;
      }
      amount -= left;
      c.game = {
        ...c.game,
        population: c.game.population - amount,
        city: { ...c.game.city, residents },
      };
    }
  } else if (r === 'food' || r === 'materials' || r === 'aether')
    c.game = adjustStock(c.game, inventory(c.game).root, r, Math.sign(delta) * amount);
  else c.rare[r] = Math.max(0, c.rare[r] + Math.sign(delta) * amount);
  return amount;
}
export const cargoWeight = (cargo: Cargo) => Object.values(cargo).reduce((a, b) => a + (b ?? 0), 0);
export function distance(w: WorldState, a: string, b: string) {
  const locate = (id: string) =>
    w.islands.find((i) => i.id === (w.cities.find((c) => c.id === id)?.island ?? id));
  const x = locate(a),
    y = locate(b);
  return x && y ? Math.hypot(x.x - y.x, x.y - y.y) : Infinity;
}
export function buildShip(g: Game, type: ShipType): Game {
  if (!g.world) return g;
  const w = mutableWorld(syncWorld(g)),
    c = w.cities.find((c) => c.id === w.active)!,
    d = shipDefs[type];
  if (
    w.ships.length >= 24 ||
    !availablePorts(c.game, d.port).length ||
    (!['scout', 'explorer'].includes(type) && !working(c.game, 'shipyard').length) ||
    (type === 'heavyCargo' && !w.research.completed.includes('heavyFreight')) ||
    (type === 'research' && !w.research.completed.includes('navigation'))
  )
    return { ...g, world: { ...g.world, notice: 'shipRequirements' } };
  const metal = type === 'heavyCargo' ? 20 : type === 'research' ? 10 : 0;
  if (c.rare.metal < metal && !c.game.city.unlimited)
    return { ...g, world: { ...g.world, notice: 'resources' } };
  const cost = { materials: d.cost, credits: d.cost * 2, aether: d.aether };
  if (!canPay(c.game, cost)) return { ...g, world: { ...g.world, notice: 'resources' } };
  c.game = pay(c.game, cost);
  if (!c.game.city.unlimited) c.rare.metal -= metal;
  w.ships.push({
    id: `ship-${w.nextId++}`,
    type,
    home: c.id,
    location: c.id,
    hp: 100,
    fuel: 0,
    state: 'building',
    remaining: d.seconds,
    cargo: {},
    trip: null,
  });
  w.notice = 'shipBuilding';
  return attachWorld(g, w);
}
export type Dispatch = {
  ship: string;
  to: string;
  task: NonNullable<Ship['trip']>['task'];
  cargo?: Cargo;
  allowRisk?: boolean;
  artifact?: 'recover' | 'record';
  route?: string;
};
export function launch(w: WorldState, request: Dispatch): boolean {
  const s = w.ships.find((s) => s.id === request.ship);
  if (!s || s.state !== 'docked' || s.trip) return false;
  const from = w.cities.find((c) => c.id === s.location),
    to = w.cities.find((c) => c.id === request.to),
    island = w.islands.find((i) => i.id === request.to),
    d = shipDefs[s.type];
  if (!from || !availablePorts(from.game, d.port).length || request.to === from.id || s.hp < 30)
    return false;
  if (
    request.task === 'explore' &&
    (!island ||
      !['scout', 'explorer', 'research'].includes(s.type) ||
      (island.visited && (!island.ruins || island.artifact === 'recovered')))
  )
    return false;
  if (
    request.task === 'colonize' &&
    (!island ||
      !island.discovered ||
      w.cities.some((c) => c.island === island.id) ||
      w.cities.length + w.ships.filter((s) => s.trip?.task === 'colonize').length >=
        w.config.maxCities ||
      s.type !== 'colony')
  )
    return false;
  if (
    !['explore', 'colonize'].includes(request.task) &&
    (!to || !availablePorts(to.game, d.port).length)
  )
    return false;
  const dist = distance(w, from.id, request.to),
    range = d.range * (w.research.completed.includes('navigation') ? 1.2 : 1);
  if (dist * 2 > range) return false;
  const fuel =
    dist *
    0.025 *
    (w.research.completed.includes('efficientFuel') ? 0.9 : 1) *
    w.config.tradeDifficulty;
  const cargo: Cargo =
    request.task === 'colonize'
      ? { materials: island!.colonyCost, food: 30, aether: 10, passengers: 20 }
      : { ...request.cargo };
  if (
    cargoWeight(cargo) > d.capacity ||
    Object.values(cargo).some((n) => !Number.isFinite(n) || n! < 0)
  )
    return false;
  for (const [r, n] of Object.entries(cargo))
    if (cargoStock(from, r as CargoType) < n!) return false;
  if (inventory(from.game).stocks.aether < (cargo.aether ?? 0) + Math.max(0, fuel - s.fuel))
    return false;
  if ((cargo.passengers ?? 0) > Math.max(0, cargoStock(from, 'passengers') - 10)) return false;
  if (request.task === 'colonize' && from.game.city.credits < 150) return false;
  if (!request.allowRisk && routeRisk(w, from.id, request.to) > 0.75) return false;
  for (const [r, n] of Object.entries(cargo))
    if (n) s.cargo[r as CargoType] = moveCargo(from, r as CargoType, -n);
  if (request.task === 'colonize')
    from.game = {
      ...from.game,
      city: { ...from.game.city, credits: from.game.city.credits - 150 },
    };
  moveCargo(from, 'aether', -Math.max(0, fuel - s.fuel));
  s.fuel = Math.max(s.fuel, fuel);
  s.state = 'loading';
  s.remaining = 2;
  s.trip = {
    id: `trip-${w.nextId++}`,
    from: from.id,
    to: request.to,
    distance: dist,
    progress: 0,
    task: request.task,
    route: request.route ?? null,
    charterCredits: request.task === 'colonize' ? 150 : 0,
    risk: !!request.allowRisk,
    artifact: request.artifact ?? 'record',
    returning: false,
  };
  return true;
}
export function dispatch(g: Game, request: Dispatch): Game {
  if (!g.world) return g;
  const w = mutableWorld(syncWorld(g));
  w.notice = launch(w, request) ? 'departing' : 'dispatchRequirements';
  return attachWorld(g, w);
}
export function routeRisk(w: WorldState, from: string, to: string) {
  const cities = w.cities.filter((c) => c.id === from || c.id === to),
    observatory = cities.some((c) => working(c.game, 'worldObservatory').length > 0),
    hazard = cities.some(
      (c) =>
        c.game.disaster?.phase === 'active' ||
        (observatory && c.game.disaster?.phase === 'forecast'),
    );
  const island = w.islands.find((i) => i.id === (w.cities.find((c) => c.id === to)?.island ?? to));
  return Math.min(1, (island?.risk ?? 0.15) + (hazard ? 0.65 : 0));
}
export function createRoute(g: Game, config: Omit<TradeRoute, 'id' | 'next' | 'delivered'>): Game {
  if (!g.world) return g;
  const w = mutableWorld(syncWorld(g)),
    s = w.ships.find((s) => s.id === config.ship);
  if (
    w.routes.length >= 24 ||
    !s ||
    w.routes.some((r) => r.ship === s.id) ||
    config.from === config.to ||
    !w.cities.some((c) => c.id === config.from) ||
    !w.cities.some((c) => c.id === config.to) ||
    ![config.amount, config.reserve, config.target, config.interval, config.priority].every(
      Number.isFinite,
    ) ||
    config.amount <= 0 ||
    config.reserve < 0 ||
    config.target < 0 ||
    config.interval < 1
  )
    return g;
  w.routes.push({
    ...config,
    amount: Math.min(shipDefs[s.type].capacity, config.amount),
    id: `route-${w.nextId++}`,
    next: w.clock,
    delivered: 0,
  });
  w.notice = 'routeCreated';
  return attachWorld(g, w);
}
export function cancelTrip(g: Game, id: string): Game {
  if (!g.world) return g;
  const w = mutableWorld(syncWorld(g)),
    s = w.ships.find((s) => s.id === id);
  if (!s?.trip) return g;
  // Cancellation reverses the remaining flight. Freight stays aboard until a real dock arrival.
  if (!s.trip.returning) {
    s.trip.progress = Math.max(0, s.trip.distance - s.trip.progress);
    s.trip.returning = true;
    s.state = 'returning';
  }
  if (s.trip.route) {
    const r = w.routes.find((r) => r.id === s.trip!.route);
    if (r) r.enabled = false;
  }
  return attachWorld(g, w);
}
export function repairShip(g: Game, id: string): Game {
  if (!g.world) return g;
  const w = mutableWorld(syncWorld(g)),
    s = w.ships.find((s) => s.id === id),
    c = w.cities.find((c) => c.id === s?.location);
  if (!s || !c || s.state !== 'docked' || s.hp >= 100 || !working(c.game, 'shipMaintenance').length)
    return g;
  const cost = { materials: (100 - s.hp) * 0.2, credits: 100 - s.hp, aether: 0 };
  if (!canPay(c.game, cost)) return g;
  c.game = pay(c.game, cost);
  s.state = 'repairing';
  s.remaining = (100 - s.hp) * 0.3;
  return attachWorld(g, w);
}
export function capitalTransfer(g: Game, id: string): Game {
  if (!g.world) return g;
  const w = syncWorld(g),
    c = w.cities.find((c) => c.id === id);
  return c && working(c.game, 'centralControl').length && analyze(c.game).stability >= 80
    ? attachWorld(g, { ...w, capital: id })
    : g;
}
