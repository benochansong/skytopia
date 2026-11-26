import type { Game } from '../../types/game';
import type { CargoType, Ship, WorldState } from '../../types/world';
import {
  availablePorts,
  cargoRoom,
  cargoStock,
  cargoWeight,
  distance,
  launch,
  moveCargo,
  mutableWorld,
  routeRisk,
  working,
} from './logistics';
import { attachWorld, context, localGame, syncWorld } from './state';
import { shipDefs, portRanks } from './definitions';
import { colonyCity } from './scenarios';
import { researchStep } from './research';
import { analyze } from '../analysis';

function beginReturn(s: Ship) {
  if (!s.trip) return;
  s.trip.returning = true;
  s.trip.progress = 0;
  s.state = 'returning';
}
function completeDock(w: WorldState, s: Ship) {
  const t = s.trip!;
  s.location = t.returning ? t.from : t.to;
  // Unused prepaid fuel is conserved in the dock inventory, or remains aboard if full.
  const city = w.cities.find((c) => c.id === s.location);
  if (city && t.charterCredits > 0) {
    city.game = {
      ...city.game,
      city: { ...city.game.city, credits: city.game.city.credits + t.charterCredits },
    };
    t.charterCredits = 0;
  }
  if (city && s.fuel > 0) s.fuel -= moveCargo(city, 'aether', s.fuel);
  s.state = 'docked';
  s.trip = null;
  s.remaining = 0;
}
function deliver(w: WorldState, s: Ship) {
  const t = s.trip!,
    target = t.returning ? t.from : t.to,
    c = w.cities.find((c) => c.id === target);
  if (!c || !availablePorts(c.game, shipDefs[s.type].port).length) return;
  for (const [resource, value] of Object.entries(s.cargo)) {
    const r = resource as CargoType;
    if (!value) continue;
    const amount = moveCargo(c, r, value);
    s.cargo[r] = Math.max(0, value - amount);
    if (amount > 0) {
      const id = `receipt-${w.nextId++}`;
      w.ledger.push({
        id,
        from: t.returning ? t.to : t.from,
        to: target,
        resource: r,
        amount,
        time: w.clock,
      });
      w.ledger = w.ledger.slice(-128);
      if (!t.returning) {
        w.stats.deliveries++;
        if (r === 'food') w.stats.food += amount;
        if (r === 'materials') w.stats.materials += amount;
        if (t.task === 'rescue' && (r === 'food' || r === 'materials')) w.stats.rescued += amount;
        const route = w.routes.find((r) => r.id === t.route);
        if (route) route.delivered += amount;
      }
    }
  }
  if (cargoWeight(s.cargo) > 1e-7) return;
  if (t.returning) {
    completeDock(w, s);
    return;
  }
  // Scheduled ships return empty; one-off passenger and rescue flights dock at their destination.
  if (t.route) beginReturn(s);
  else completeDock(w, s);
}
function arrive(w: WorldState, s: Ship) {
  const t = s.trip!;
  if (t.returning) {
    s.state = 'unloading';
    s.remaining = 2;
    return;
  }
  if (t.task === 'explore') {
    const island = w.islands.find((i) => i.id === t.to)!;
    if (!island.visited) {
      island.discovered = true;
      island.visited = true;
      w.stats.explored++;
    }
    if (island.ruins && island.artifact !== 'recovered') {
      if (t.artifact === 'recover' && s.type !== 'scout') {
        island.artifact = 'recovered';
        s.cargo.data = 10;
        s.cargo.ancientAlloy = 8;
        w.stats.recovered++;
      } else island.artifact = 'recorded';
    }
    beginReturn(s);
    w.notice = 'islandDiscovered';
    return;
  }
  if (t.task === 'colonize') {
    const island = w.islands.find((i) => i.id === t.to)!;
    if (!w.cities.some((c) => c.island === island.id) && w.cities.length < w.config.maxCities) {
      const source = w.cities.find((c) => c.id === t.from)!;
      const c = colonyCity(source.game, island, s.cargo.passengers ?? 0);
      c.id = `city-${w.nextId++}`;
      // Materials pay for the authored landing settlement; food and aether become actual stocks.
      c.game = {
        ...c.game,
        city: {
          ...c.game.city,
          credits: t.charterCredits,
          stocks: { core: { food: s.cargo.food ?? 0, materials: 0, aether: s.cargo.aether ?? 0 } },
        },
      };
      c.game.worldContext = context({ ...w, cities: [...w.cities, c] }, c);
      w.cities.push(c);
      w.stats.colonies++;
      s.cargo = {};
      t.charterCredits = 0;
      t.to = c.id;
      island.discovered = true;
      island.visited = true;
      w.notice = 'colonyFounded';
    }
    beginReturn(s);
    return;
  }
  s.state = 'unloading';
  s.remaining = 2;
}
export function transportStep(w: WorldState, dt: number) {
  const used = new Map<string, number>();
  const service = (city: string, rank: number) => {
    const c = w.cities.find((c) => c.id === city);
    if (!c) return false;
    const capacity = availablePorts(c.game, rank).reduce(
      (n, b) => n + ((portRanks[b.kind] ?? 0) === 3 ? 4 : (portRanks[b.kind] ?? 0)),
      0,
    );
    if ((used.get(city) ?? 0) >= capacity) return false;
    used.set(city, (used.get(city) ?? 0) + 1);
    return true;
  };
  for (const s of [...w.ships].sort(
    (a, b) => (a.type === 'rescue' ? -1 : 0) - (b.type === 'rescue' ? -1 : 0),
  )) {
    const d = shipDefs[s.type];
    if (s.state === 'building' || s.state === 'repairing') {
      const c = w.cities.find((c) => c.id === s.location);
      if (
        !c ||
        !availablePorts(c.game, d.port).length ||
        (s.state === 'repairing' && !working(c.game, 'shipMaintenance').length) ||
        (s.state === 'building' &&
          !['scout', 'explorer'].includes(s.type) &&
          !working(c.game, 'shipyard').length)
      )
        continue;
      s.remaining = Math.max(0, s.remaining - dt);
      if (!s.remaining) {
        s.state = 'docked';
        s.hp = 100;
      }
      continue;
    }
    const t = s.trip;
    if (!t) continue;
    if (s.state === 'loading' || s.state === 'departing' || s.state === 'approach') {
      if (s.state === 'loading') {
        const c = w.cities.find((c) => c.id === t.from);
        if (!c || !service(c.id, d.port)) continue;
      }
      const tradeBonus =
        s.state === 'loading' && w.cities.find((c) => c.id === t.from)?.specialty === 'trade'
          ? 1.25
          : 1;
      s.remaining = Math.max(0, s.remaining - dt * tradeBonus);
      if (!s.remaining) {
        if (s.state === 'loading') {
          s.state = 'departing';
          s.remaining = 1;
        } else if (s.state === 'departing') s.state = 'sailing';
        else arrive(w, s);
      }
      continue;
    }
    if (s.state === 'unloading') {
      if (service(t.returning ? t.from : t.to, d.port)) {
        const destination = w.cities.find((c) => c.id === (t.returning ? t.from : t.to));
        s.remaining = Math.max(
          0,
          s.remaining - dt * (destination?.specialty === 'trade' ? 1.25 : 1),
        );
        if (!s.remaining) deliver(w, s);
      }
      continue;
    }
    const risk = routeRisk(w, t.from, t.to);
    if (!t.risk && !t.returning && risk > 0.75) {
      s.state = 'avoiding';
      continue;
    }
    s.state = t.returning ? 'returning' : 'sailing';
    const speed =
      (d.speed * 6 * (w.research.completed.includes('fastCargo') ? 1.15 : 1) * (0.5 + s.hp / 200)) /
      (1 + (cargoWeight(s.cargo) / d.capacity) * 0.2) /
      (1 + risk * (1 - d.resistance));
    const step = Math.min(t.distance - t.progress, speed * dt),
      fuelRate =
        0.0125 *
        (w.research.completed.includes('efficientFuel') ? 0.9 : 1) *
        w.config.tradeDifficulty;
    // A round trip is prepaid. This guard stops corrupted or manually altered flights.
    if (s.fuel + 1e-7 < step * fuelRate) {
      s.state = 'avoiding';
      continue;
    }
    s.fuel = Math.max(0, s.fuel - step * fuelRate);
    t.progress += step;
    if (risk > 0.75 && t.risk) s.hp = Math.max(20, s.hp - dt * 0.5 * (1 - d.resistance));
    if (t.progress >= t.distance - 1e-7) {
      s.state = 'approach';
      s.remaining = 1;
    }
  }
  for (const r of [...w.routes].sort((a, b) => a.priority - b.priority)) {
    const s = w.ships.find((s) => s.id === r.ship),
      a = w.cities.find((c) => c.id === r.from),
      b = w.cities.find((c) => c.id === r.to);
    if (
      !r.enabled ||
      r.next > w.clock ||
      !s ||
      s.trip ||
      s.state !== 'docked' ||
      s.location !== r.from ||
      !a ||
      !b
    )
      continue;
    const incoming = w.ships
      .filter((s) => s.trip?.to === r.to && !s.trip.returning)
      .reduce((n, s) => n + (s.cargo[r.resource] ?? 0), 0);
    const amount = Math.min(
      r.amount,
      shipDefs[s.type].capacity,
      Math.max(0, cargoStock(a, r.resource) - r.reserve),
      Math.max(0, r.target - cargoStock(b, r.resource) - incoming),
      cargoRoom(b, r.resource),
    );
    if (amount < 1) continue;
    if (
      launch(w, {
        ship: s.id,
        to: b.id,
        task: r.resource === 'passengers' ? 'passengers' : s.type === 'rescue' ? 'rescue' : 'trade',
        cargo: { [r.resource]: Math.floor(amount) },
        allowRisk: r.allowRisk,
        route: r.id,
      })
    )
      r.next = w.clock + r.interval;
  }
}
export function bridgeStep(w: WorldState, dt: number) {
  for (const b of w.bridges) {
    const a = w.cities.find((c) => c.id === b.from)!,
      c = w.cities.find((c) => c.id === b.to)!;
    if (b.hp <= 0) continue;
    const ar = analyze(a.game),
      cr = analyze(c.game),
      unsafe =
        ar.stability < 65 || cr.stability < 65 || a.game.structure.loss || c.game.structure.loss;
    if (unsafe) b.hp = Math.max(0, b.hp - dt * 5);
    if (
      b.hp <= 0 ||
      unsafe ||
      !working(a.game, 'skybridgeAnchor').length ||
      !working(c.game, 'skybridgeAnchor').length
    )
      continue;
    if (b.cargo > 0) {
      b.remaining = Math.max(0, b.remaining - dt);
      if (!b.remaining) {
        const amount = moveCargo(c, b.resource, b.cargo);
        b.cargo -= amount;
        b.delivered += amount;
      }
    } else {
      const amount = Math.min(
        5,
        Math.max(0, cargoStock(a, b.resource) - 50),
        cargoRoom(c, b.resource),
      );
      if (amount > 0) {
        b.cargo = moveCargo(a, b.resource, -amount);
        b.remaining = distance(w, a.id, c.id) / 10;
      }
    }
  }
}
export function tickWorld(
  g: Game,
  dt: number,
  localTick: (g: Game, dt: number, background?: boolean) => Game,
  drop?: (g: Game) => Game,
): Game {
  if (
    !g.world ||
    !Number.isFinite(dt) ||
    dt <= 0 ||
    g.labPaused ||
    g.city.speed === 0 ||
    g.campaign?.dialogue ||
    g.campaign?.failed ||
    (g.campaign?.result && !g.campaign.continued)
  )
    return g;
  let w = mutableWorld(syncWorld(g));
  w.accumulator += Math.min(1, dt) * g.city.speed;
  let steps = 0;
  while (w.accumulator + 1e-9 >= 0.25 && steps++ < 12) {
    w.clock += 0.25;
    w.accumulator = Math.max(0, w.accumulator - 0.25);
    for (const c of w.cities) {
      const active = c.id === w.active,
        background = !active || w.view === 'map';
      c.pending += 0.25;
      if (background && c.pending < 1) continue;
      const step = c.pending,
        ctx = context(w, c),
        same = JSON.stringify(c.game.worldContext) === JSON.stringify(ctx);
      const local = {
        ...localGame(c.game),
        worldContext: same ? c.game.worldContext : ctx,
        labPaused: false,
        city: { ...c.game.city, speed: 1 as const },
      };
      c.pending = 0;
      c.game = localTick(local, step, background);
      if (
        !background &&
        w.config.blockTime > 0 &&
        !c.game.reservedActive &&
        !c.game.structure.loss
      ) {
        c.game = { ...c.game, remaining: Math.max(0, c.game.remaining - 0.25) };
        if (c.game.remaining === 0 && drop) c.game = drop(c.game);
      }
    }
    researchStep(w, 0.25);
    transportStep(w, 0.25);
    bridgeStep(w, 0.25);
  }
  const next = attachWorld(g, w);
  return { ...next, labPaused: g.labPaused, city: { ...next.city, speed: g.city.speed } };
}
