import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { ONLINE } from '../src/data/rules';
import { commandSchema } from '../src/game/online/protocol';
import type {
  Command,
  Member,
  Result,
  RoomOptions,
  RoomView,
  ServerMessage,
} from '../src/game/online/protocol';
import {
  advanceCity,
  advanceHand,
  compareScores,
  execute,
  newHand,
  onlineCity,
  publicCity,
  scoreCity,
} from '../src/game/online/match';
import type { Hand } from '../src/game/online/match';
import type { Game } from '../src/types/game';
import { Database } from './database';
import type { ServerConfig } from './config';

type Peer = {
  ws: WebSocket;
  id: string;
  name: string;
  room?: string;
  alive: boolean;
  last?: { revision: number; games: Game[] };
  window: number;
  count: number;
  pingAt: number;
};
type Player = Member & {
  hand: Hand;
  seq: number;
  acks: Map<string, Extract<ServerMessage, { type: 'ack' }>>;
  disconnected: number;
  left: boolean;
};
type Room = {
  rulesVersion: number;
  code: string;
  options: RoomOptions;
  host: string;
  players: Player[];
  spectators: Set<string>;
  phase: RoomView['phase'];
  games: Game[];
  seed: number;
  remaining: number;
  countdown: number;
  goalHold: number;
  paused: boolean;
  result: Result | null;
  match: string;
  revision: number;
  pings: RoomView['pings'];
  created: number;
  ended: number;
};
const zeroScore = () => ({
  total: 0,
  parts: [0, 0, 0, 0, 0, 0],
  stability: 0,
  efficiency: 0,
  objectives: 0,
});
export function createService(cfg: ServerConfig) {
  const db = new Database(cfg.database),
    peers = new Map<string, Peer>(),
    rooms = new Map<string, Room>(),
    queue = new Set<string>();
  const connections = new Set<Peer>();
  const ipRates = new Map<string, { at: number; count: number }>();
  const metrics = {
    ticks: 0,
    tickMs: [] as number[],
    messages: 0,
    bytes: 0,
    rejected: 0,
    matches: 0,
  };
  const http = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/health') {
      res.end(JSON.stringify({ ok: true, version: ONLINE.version }));
      return;
    }
    const expected = Buffer.from('Bearer ' + cfg.adminToken),
      actual = Buffer.from(req.headers.authorization || '');
    if (
      req.url === '/metrics' &&
      cfg.adminToken &&
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    ) {
      const sorted = [...metrics.tickMs].sort((a, b) => a - b);
      res.end(
        JSON.stringify({
          ...metrics,
          tickMs: undefined,
          p95TickMs: sorted[Math.floor(sorted.length * 0.95)] || 0,
          connections: peers.size,
          rooms: rooms.size,
          rss: process.memoryUsage().rss,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end('{"error":"notFound"}');
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false });
  http.on('upgrade', (req, socket, head) => {
    const ip = req.socket.remoteAddress || 'unknown',
      now = Date.now();
    const rate = ipRates.get(ip) || { at: now, count: 0 };
    if (now - rate.at > 60000) {
      rate.at = now;
      rate.count = 0;
    }
    rate.count++;
    ipRates.set(ip, rate);
    if (
      req.url !== '/online' ||
      !cfg.origins.includes(req.headers.origin || '') ||
      rate.count > 30 ||
      connections.size >= 100
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });
  const send = (peer: Peer, message: ServerMessage) => {
    if (peer.ws.readyState !== WebSocket.OPEN) return;
    if (peer.ws.bufferedAmount > 1024 * 1024) {
      peer.ws.close(1013, 'slowClient');
      return;
    }
    const json = JSON.stringify(message);
    peer.ws.send(json);
    metrics.messages++;
    metrics.bytes += Buffer.byteLength(json);
  };
  const error = (p: Peer, code: string) => {
    metrics.rejected++;
    send(p, { type: 'error', code });
  };
  const listing = (p: Peer) =>
    send(p, {
      type: 'rooms',
      queued: queue.has(p.id),
      rooms: [...rooms.values()]
        .filter((r) => r.options.public && r.phase !== 'ended')
        .slice(0, 30)
        .map((r) => ({
          code: r.code,
          name: r.options.name,
          mode: r.options.mode,
          players: r.players.length,
          phase: r.phase,
        })),
    });
  function view(r: Room, p: Peer): RoomView {
    const player = r.players.find((x) => x.id === p.id);
    const hand = player ? (({ supply: _supply, ...h }) => h)(player.hand) : null;
    return {
      rulesVersion: r.rulesVersion,
      match: r.match,
      code: r.code,
      options: r.options,
      host: r.host,
      members: r.players.map(({ id, name, ready, connected }) => ({ id, name, ready, connected })),
      spectators: r.spectators.size,
      phase: r.phase,
      remaining: r.remaining,
      countdown: r.countdown,
      goalHold: r.goalHold,
      paused: r.paused,
      result: r.result,
      lastSeq: player?.seq || 0,
      hand,
      scores: r.games.map(scoreCity),
      pings: r.pings,
    };
  }
  function broadcast(r: Room, full = false) {
    r.revision++;
    const games = r.games.map(publicCity);
    for (const id of [...r.players.map((p) => p.id), ...r.spectators]) {
      const p = peers.get(id);
      if (!p || p.room !== r.code) continue;
      const room = view(r, p);
      if (full || !p.last || p.last.games.length !== games.length || r.revision % 20 === 0)
        send(p, { type: 'state', revision: r.revision, room, games });
      else {
        const patches = games.map(
          (g, i) =>
            Object.fromEntries(
              Object.entries(g).filter(
                ([key, value]) =>
                  JSON.stringify(value) !== JSON.stringify(p.last!.games[i][key as keyof Game]),
              ),
            ) as Partial<Game>,
        );
        send(p, {
          type: 'patch',
          revision: r.revision,
          base: p.last.revision,
          room,
          games: patches,
        });
      }
      p.last = { revision: r.revision, games };
    }
  }
  function finish(r: Room, reason: string, winner?: string | null) {
    if (r.phase === 'ended') return;
    const scores = r.games.map(scoreCity);
    if (winner === undefined) {
      const comparison = r.options.mode === 'duel' ? compareScores(scores[0], scores[1]) : 0;
      winner = comparison > 0 ? r.players[0].id : comparison < 0 ? r.players[1].id : null;
    }
    const result: Result = {
      id: r.match,
      version: 1,
      rulesVersion: r.rulesVersion,
      mode: r.options.mode,
      reason,
      winner,
      at: new Date().toISOString(),
      players: r.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        score: scores[r.options.mode === 'coop' ? 0 : i],
      })),
    };
    // Commit before notifying either client; one id has one immutable final result.
    db.finish(result);
    r.result = result;
    r.phase = 'ended';
    r.ended = Date.now();
    broadcast(r, true);
  }
  function addPlayer(r: Room, p: Peer) {
    r.players.push({
      id: p.id,
      name: p.name,
      ready: false,
      connected: true,
      hand: newHand(r.seed),
      seq: 0,
      acks: new Map(),
      disconnected: 0,
      left: false,
    });
    p.room = r.code;
    p.last = undefined;
    queue.delete(p.id);
  }
  function createRoom(p: Peer, options: RoomOptions) {
    if (p.room || rooms.size >= cfg.maxRooms) return error(p, 'roomLimit');
    let code: string;
    do {
      code = randomBytes(4).toString('hex').toUpperCase();
    } while (rooms.has(code));
    const r: Room = {
      rulesVersion: ONLINE.version,
      code,
      options,
      host: p.id,
      players: [],
      spectators: new Set(),
      phase: 'lobby',
      games: [],
      seed: randomBytes(4).readUInt32LE(),
      remaining: options.seconds,
      countdown: ONLINE.countdown,
      goalHold: 0,
      paused: false,
      result: null,
      match: '',
      revision: 0,
      pings: [],
      created: Date.now(),
      ended: 0,
    };
    rooms.set(code, r);
    addPlayer(r, p);
    broadcast(r, true);
    return r;
  }
  function leave(p: Peer) {
    queue.delete(p.id);
    const r = rooms.get(p.room || '');
    if (r) {
      const player = r.players.find((x) => x.id === p.id);
      if (player && ['playing', 'countdown'].includes(r.phase))
        finish(
          r,
          'surrender',
          r.options.mode === 'duel' ? r.players.find((x) => x.id !== p.id)!.id : null,
        );
      if (r.phase === 'lobby') {
        r.players = r.players.filter((x) => x.id !== p.id);
        r.host = r.players[0]?.id || '';
        r.players.forEach((x) => (x.ready = false));
      }
      if (player && r.phase === 'ended') {
        player.left = true;
        player.connected = false;
      }
      r.spectators.delete(p.id);
      p.room = undefined;
      p.last = undefined;
      if (!r.players.length) rooms.delete(r.code);
      else broadcast(r);
    }
    send(p, { type: 'left' });
    listing(p);
  }
  function command(p: Peer, c: Command) {
    if (c.type === 'auth') {
      if (p.id) return error(p, 'alreadyAuthenticated');
      const session = db.authenticate(c.token, c.name);
      if (!session) return error(p, 'invalidSession');
      const old = peers.get(session.id);
      p.id = session.id;
      p.name = session.name;
      // One live connection per identity; stale close callbacks cannot disconnect the replacement.
      if (old) {
        p.room = old.room;
        old.ws.close(4001, 'replaced');
      }
      peers.set(p.id, p);
      if (!p.room)
        p.room = [...rooms.values()].find(
          (r) => r.players.some((x) => x.id === p.id && !x.left) || r.spectators.has(p.id),
        )?.code;
      send(p, { type: 'welcome', ...session });
      const r = rooms.get(p.room || '');
      if (r) {
        const player = r.players.find((x) => x.id === p.id);
        if (player) {
          player.connected = true;
          player.disconnected = 0;
        }
        broadcast(r, true);
      }
      listing(p);
      return;
    }
    if (!p.id) return error(p, 'authRequired');
    if (peers.get(p.id) !== p) return error(p, 'replaced');
    if (c.type === 'heartbeat') return send(p, c);
    if (c.type === 'list') return listing(p);
    if (c.type === 'history') return send(p, { type: 'history', results: db.history(p.id) });
    if (c.type === 'create') return createRoom(p, c.options);
    if (c.type === 'leave') return leave(p);
    if (c.type === 'queue') {
      if (p.room) return error(p, 'alreadyInRoom');
      if (!c.enabled) queue.delete(p.id);
      else {
        queue.add(p.id);
        const other = [...queue].find((id) => id !== p.id && peers.has(id));
        if (other) {
          const a = peers.get(other)!;
          const r = createRoom(a, {
            name: 'SKY DUEL',
            mode: 'duel',
            public: true,
            seconds: 600,
            disaster: false,
            spectators: true,
          });
          if (r) {
            addPlayer(r, p);
            broadcast(r, true);
          }
        }
      }
      listing(p);
      return;
    }
    if (c.type === 'join') {
      const r = rooms.get(c.code);
      if (p.room || !r || r.phase === 'ended') return error(p, 'roomUnavailable');
      if (c.spectator) {
        if (!r.options.spectators || r.spectators.size >= 4) return error(p, 'spectatorDenied');
        r.spectators.add(p.id);
        p.room = r.code;
        queue.delete(p.id);
      } else {
        if (r.phase !== 'lobby' || r.players.length >= 2) return error(p, 'roomFull');
        addPlayer(r, p);
      }
      broadcast(r, true);
      return;
    }
    const r = rooms.get(p.room || '');
    if (!r) return error(p, 'roomRequired');
    if (c.type === 'resync') {
      p.last = undefined;
      broadcast(r, true);
      return;
    }
    const player = r.players.find((x) => x.id === p.id);
    if (!player) return error(p, 'readOnly');
    if (c.type === 'ready') {
      if (r.phase !== 'lobby') return error(p, 'notLobby');
      player.ready = c.ready;
      broadcast(r);
      return;
    }
    if (c.type === 'start') {
      if (
        r.phase !== 'lobby' ||
        r.host !== p.id ||
        r.players.length !== 2 ||
        !r.players.every((x) => x.ready && x.connected)
      )
        return error(p, 'notReady');
      r.games = Array.from({ length: r.options.mode === 'coop' ? 1 : 2 }, () =>
        onlineCity(r.seed, r.options.disaster),
      );
      r.match = randomUUID();
      db.begin({
        id: r.match,
        version: 1,
        rulesVersion: r.rulesVersion,
        mode: r.options.mode,
        reason: 'running',
        winner: null,
        at: new Date().toISOString(),
        players: r.players.map((x) => ({ id: x.id, name: x.name, score: zeroScore() })),
      });
      r.phase = 'countdown';
      metrics.matches++;
      broadcast(r, true);
      return;
    }
    if (c.type === 'action') {
      const cached = player.acks.get(c.id);
      if (cached) return send(p, cached);
      let code = '',
        ok = false;
      if (c.match !== r.match) code = 'wrongMatch';
      else if (c.seq !== player.seq + 1) code = 'sequence';
      else {
        player.seq = c.seq;
        if (r.phase !== 'playing') code = 'notPlaying';
        else {
          const index = r.options.mode === 'coop' ? 0 : r.players.indexOf(player);
          const next = execute(
            r.games[index],
            player.hand,
            c.action,
            r.host === p.id,
            r.options.mode === 'coop',
          );
          code = next.error || 'accepted';
          ok = !next.error;
          if (ok) {
            r.games[index] = next.game;
            player.hand = next.hand;
          }
        }
      }
      const ack = { type: 'ack' as const, id: c.id, ok, code, seq: player.seq };
      player.acks.set(c.id, ack);
      if (player.acks.size > 256) player.acks.delete(player.acks.keys().next().value!);
      send(p, ack);
      broadcast(r);
      return;
    }
    if (r.phase !== 'playing') return error(p, 'notPlaying');
    if (c.type === 'surrender') {
      finish(
        r,
        'surrender',
        r.options.mode === 'duel' ? r.players.find((x) => x.id !== p.id)!.id : null,
      );
      return;
    }
    if (c.type === 'ping') {
      if (Date.now() - p.pingAt < 1000) return error(p, 'rateLimit');
      p.pingAt = Date.now();
      r.pings = [
        ...r.pings,
        { by: p.name, kind: c.kind, cell: c.cell, until: Date.now() + 10000 },
      ].slice(-8);
      broadcast(r);
    }
  }
  wss.on('connection', (ws) => {
    const p: Peer = { ws, id: '', name: '', alive: true, window: Date.now(), count: 0, pingAt: 0 };
    connections.add(p);
    const deadline = setTimeout(() => {
      if (!p.id) ws.close(4000, 'authTimeout');
    }, 5000);
    ws.on('pong', () => (p.alive = true));
    ws.on('error', () => {});
    ws.on('message', (data, binary) => {
      if (Date.now() - p.window >= 1000) {
        p.window = Date.now();
        p.count = 0;
      }
      if (++p.count > 20) {
        error(p, 'rateLimit');
        if (p.count > 40) ws.close(4008, 'rateLimit');
        return;
      }
      try {
        const parsed = !binary && commandSchema.safeParse(JSON.parse(data.toString()));
        if (!parsed || !parsed.success) return error(p, 'invalidMessage');
        command(p, parsed.data);
      } catch (cause) {
        console.error(
          'Online request failed',
          cause instanceof SyntaxError
            ? 'invalid JSON'
            : cause instanceof Error
              ? cause.message
              : 'unknown',
        );
        error(p, 'requestFailed');
      }
    });
    ws.on('close', () => {
      clearTimeout(deadline);
      connections.delete(p);
      if (peers.get(p.id) !== p) return;
      peers.delete(p.id);
      queue.delete(p.id);
      const r = rooms.get(p.room || '');
      if (!r) return;
      const player = r.players.find((x) => x.id === p.id);
      if (player) {
        player.connected = false;
        player.disconnected = Date.now();
        player.ready = false;
      }
      r.spectators.delete(p.id);
      broadcast(r);
    });
  });
  let accumulator = 0,
    previous = performance.now(),
    broadcastClock = 0;
  function step(dt: number, now = Date.now()) {
    for (const r of rooms.values()) {
      r.pings = r.pings.filter((x) => x.until > now);
      if (r.phase === 'ended') {
        if (now - r.ended > 300000) {
          for (const p of peers.values())
            if (p.room === r.code) {
              p.room = undefined;
              send(p, { type: 'left' });
            }
          rooms.delete(r.code);
        }
        continue;
      }
      if (r.phase === 'lobby') {
        for (const player of [...r.players])
          if (!player.connected && now - player.disconnected > ONLINE.grace * 1000)
            r.players = r.players.filter((x) => x !== player);
        if (!r.players.length || now - r.created > 1800000) {
          for (const p of peers.values())
            if (p.room === r.code) {
              p.room = undefined;
              send(p, { type: 'left' });
            }
          rooms.delete(r.code);
        } else if (!r.players.some((x) => x.id === r.host)) r.host = r.players[0].id;
        continue;
      }
      const online = r.players.filter((x) => x.connected);
      if (!online.length && r.players.every((x) => now - x.disconnected > ONLINE.grace * 1000)) {
        finish(r, 'disconnected', null);
        continue;
      }
      if (
        r.options.mode === 'duel' &&
        online.length === 1 &&
        r.players.some((x) => !x.connected && now - x.disconnected > ONLINE.grace * 1000)
      ) {
        finish(r, 'forfeit', online[0].id);
        continue;
      }
      r.paused = r.options.mode === 'coop' && !online.length;
      if (r.paused) continue;
      if (r.phase === 'countdown') {
        r.countdown = Math.max(0, r.countdown - dt);
        if (!r.countdown) r.phase = 'playing';
        continue;
      }
      r.remaining = Math.max(0, r.remaining - dt);
      r.games = r.games.map((g) => advanceCity(g, dt));
      for (const player of r.players) {
        player.hand = { ...player.hand, remaining: player.hand.remaining - dt };
        if (player.hand.remaining <= 0) player.hand = advanceHand(player.hand);
      }
      const lost = r.games.map((g) => !!g.structure.loss);
      if (r.options.mode === 'coop') {
        const g = r.games[0],
          score = scoreCity(g);
        r.goalHold =
          score.objectives === 4 &&
          g.buildings.filter((b) => !b.initial).length >= ONLINE.coopBuilds
            ? r.goalHold + dt
            : 0;
        if (lost[0]) finish(r, 'collapse', null);
        else if (r.goalHold >= ONLINE.coopHold) finish(r, 'cooperativeVictory', null);
        else if (!r.remaining) finish(r, 'timeout', null);
      } else if (lost.some(Boolean))
        finish(r, 'collapse', lost.every(Boolean) ? null : r.players[lost[0] ? 1 : 0].id);
      else if (!r.remaining) finish(r, 'time');
    }
  }
  const timer = setInterval(() => {
    const start = performance.now();
    accumulator += Math.min(2, (start - previous) / 1000);
    previous = start;
    // Bounded catch-up avoids a spiral under overload. Clocks use simulated time for fairness.
    while (accumulator >= ONLINE.tick) {
      step(ONLINE.tick);
      accumulator -= ONLINE.tick;
      broadcastClock += ONLINE.tick;
    }
    if (broadcastClock >= ONLINE.broadcast) {
      broadcastClock = 0;
      rooms.forEach((r) => broadcast(r));
    }
    metrics.ticks++;
    metrics.tickMs.push(performance.now() - start);
    if (metrics.tickMs.length > 1000) metrics.tickMs.shift();
  }, ONLINE.tick * 1000);
  const heartbeat = setInterval(() => {
    for (const p of connections) {
      if (!p.alive) p.ws.terminate();
      else {
        p.alive = false;
        p.ws.ping();
      }
    }
    for (const [ip, value] of ipRates) if (Date.now() - value.at > 60000) ipRates.delete(ip);
  }, 10000);
  return {
    http,
    db,
    rooms,
    metrics,
    step,
    async listen() {
      await new Promise<void>((resolve, reject) => {
        http.once('error', reject);
        http.listen(cfg.port, cfg.host, resolve);
      });
      return (http.address() as { port: number }).port;
    },
    async close() {
      clearInterval(timer);
      clearInterval(heartbeat);
      for (const r of rooms.values())
        if (['playing', 'countdown'].includes(r.phase)) finish(r, 'serverRestart', null);
      for (const p of connections) p.ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      db.close();
    },
  };
}
