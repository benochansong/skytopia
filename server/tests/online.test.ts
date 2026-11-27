import { afterEach, describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createService } from '../service';
import { config } from '../config';
import { Database } from '../database';
import { commandSchema } from '../../src/game/online/protocol';
import type {
  Action,
  Command,
  Result,
  ServerMessage,
  Snapshot,
} from '../../src/game/online/protocol';
import {
  advanceCity,
  advanceHand,
  execute,
  newHand,
  onlineCity,
  publicCity,
  scoreCity,
  withHand,
} from '../../src/game/online/match';
import { validatePlacement } from '../../src/game/placement';
import type { Game } from '../../src/types/game';
import { RULES, ONLINE } from '../../src/data/rules';
import { makePlatform } from '../../src/game/stability/state';
const services: ReturnType<typeof createService>[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  for (const s of services.splice(0)) await s.close();
});
async function service() {
  const s = createService({ ...config({}), port: 0, database: ':memory:' });
  services.push(s);
  return { s, port: await s.listen() };
}
async function waitFor<T>(read: () => T | undefined | false, timeout = 6000): Promise<T> {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const v = read();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw Error('Timed out waiting for socket condition');
}
async function client(port: number, name: string, token?: string) {
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/online', {
    origin: 'http://127.0.0.1:5188',
  });
  sockets.push(ws);
  const messages: ServerMessage[] = [];
  let state: Snapshot | undefined;
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString()) as ServerMessage;
    messages.push(m);
    if (m.type === 'state') state = m;
    if (m.type === 'patch' && state?.revision === m.base)
      state = {
        type: 'state',
        room: m.room,
        revision: m.revision,
        games: m.games.map((g, i) => ({ ...state!.games[i], ...g })),
      };
  });
  await new Promise<void>((r) => ws.on('open', r));
  const send = (c: Command) => ws.send(JSON.stringify(c));
  send({ type: 'auth', version: 1, name, ...(token ? { token } : {}) });
  const welcome = (await waitFor(() => messages.find((m) => m.type === 'welcome'))) as Extract<
    ServerMessage,
    { type: 'welcome' }
  >;
  return {
    ws,
    messages,
    send,
    welcome,
    state: () => state,
    wait: (fn: (s: Snapshot) => boolean) => waitFor(() => state && fn(state) && state),
    async action(a: Action, id = randomUUID(), seq = (state?.room.lastSeq || 0) + 1) {
      send({ type: 'action', match: state!.room.match, id, seq, action: a });
      return (await waitFor(() =>
        messages.find((m) => m.type === 'ack' && m.id === id),
      )) as Extract<ServerMessage, { type: 'ack' }>;
    },
  };
}
function placement(g: Game): Action {
  for (let z = RULES.min; z <= RULES.max; z++)
    for (let x = RULES.min; x <= RULES.max; x++)
      for (let rotation = 0; rotation < 4; rotation++) {
        const cell = { x, z, y: 0 };
        if (validatePlacement(g, { ...g.active, rotation }, cell).valid)
          return { type: 'place', hand: 0, cell, rotation, pitch: 0, roll: 0 };
      }
  throw Error('No valid placement for ' + g.active.kind);
}
async function match(mode: 'duel' | 'coop' = 'duel') {
  const { s, port } = await service(),
    a = await client(port, 'A'),
    b = await client(port, 'B');
  a.send({
    type: 'create',
    options: {
      name: 'Private test',
      mode,
      public: false,
      seconds: 600,
      disaster: false,
      spectators: true,
    },
  });
  const initial = await a.wait((v) => v.room.members.length === 1);
  b.send({ type: 'join', code: initial.room.code, spectator: false });
  await a.wait((v) => v.room.members.length === 2);
  a.send({ type: 'ready', ready: true });
  b.send({ type: 'ready', ready: true });
  await a.wait((v) => v.room.members.every((p) => p.ready));
  a.send({ type: 'start' });
  await a.wait((v) => v.room.phase === 'countdown');
  s.step(3);
  a.send({ type: 'resync' });
  await a.wait((v) => v.room.phase === 'playing');
  await b.wait((v) => v.room.phase === 'playing');
  return { s, port, a, b, room: s.rooms.get(initial.room.code)! };
}
describe('authoritative online rules', () => {
  test('a multi-cell platform cannot cross the build cap or consume resources on rejection', () => {
    let g = onlineCity(42, false);
    const forbidden = new Set(['4,0', '5,0', '4,1', '5,1']);
    const occupied = new Set(g.platforms.map((p) => p.x + ',' + p.z));
    const cells = [];
    for (let z = RULES.min; z <= RULES.max; z++)
      for (let x = RULES.min; x <= RULES.max; x++)
        if (!occupied.has(x + ',' + z) && !forbidden.has(x + ',' + z)) cells.push({ x, z });
    cells.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    g = {
      ...g,
      platforms: [
        ...g.platforms,
        ...cells
          .slice(0, 179 - g.platforms.length - g.buildings.length)
          .map((c) => makePlatform(c, 'platform', 0, 1, false)),
      ],
    };
    const h = {
      ...newHand(42),
      active: { kind: 'platform' as const, shape: 'O' as const, rotation: 0 },
    };
    const cell = { x: 4, z: 0, y: 0 };
    expect(validatePlacement(withHand(g, h), h.active, cell).valid).toBe(true);
    const result = execute(
      g,
      h,
      { type: 'place', hand: 0, cell, rotation: 0, pitch: 0, roll: 0 },
      true,
      false,
    );
    expect(result.error).toBe('buildLimit');
    expect(result.game).toBe(g);
    expect(result.hand).toBe(h);
  });
  test('same seed gives identical supply independent of city actions; hold does not reset timer', () => {
    let a = newHand(123),
      b = newHand(123);
    for (let i = 0; i < 100; i++) {
      expect(a.active).toEqual(b.active);
      a = advanceHand(a);
      b = advanceHand(b);
    }
    const g = onlineCity(123, false),
      h = { ...newHand(123), remaining: 2 };
    const held = execute(g, h, { type: 'hold', hand: h.token }, true, false);
    expect(held.hand.remaining).toBe(2);
    expect(execute(g, held.hand, { type: 'hold', hand: held.hand.token }, true, false).error).toBe(
      'holdUsed',
    );
    expect(publicCity(g).supply).toEqual({ seed: 0, bag: [], draws: 0 });
    expect(publicCity(g).next).toEqual([]);
  });
  test('strict schema rejects forged score, city snapshots, coordinates and prototype-shaped messages', () => {
    expect(
      commandSchema.safeParse({
        type: 'action',
        id: randomUUID(),
        seq: 1,
        action: { type: 'place', hand: 0, rotation: 0, cell: { x: 9999, z: 0 }, score: 99999 },
      }).success,
    ).toBe(false);
    expect(commandSchema.safeParse({ type: 'ready', ready: true, city: {} }).success).toBe(false);
    expect(
      commandSchema.safeParse(JSON.parse('{"type":"ready","ready":true,"__proto__":{}}')).success,
    ).toBe(false);
  });
  test('production configuration fails clearly and development domain is not embedded', () => {
    expect(() => config({ NODE_ENV: 'production' })).toThrow('APP_ORIGIN');
    expect(() => config({ NODE_ENV: 'production', APP_ORIGIN: 'http://example.test' })).toThrow(
      'HTTPS',
    );
    expect(config({ NODE_ENV: 'production', APP_DOMAIN: 'example.test' }).origins).toEqual([
      'https://example.test',
    ]);
  });
  test('equal disaster timelines and redacted seeds; score is finite after simulation', () => {
    let a = onlineCity(88, true),
      b = onlineCity(88, true);
    for (let i = 0; i < 140; i++) {
      a = advanceCity(a, 0.25);
      b = advanceCity(b, 0.25);
    }
    expect(a.disaster?.threat).toEqual(b.disaster?.threat);
    expect(a.disaster?.phase).toBe('forecast');
    expect(publicCity(a).disaster?.seed).toBe(0);
    expect(Number.isFinite(scoreCity(a).total)).toBe(true);
  });
});
describe('real WebSocket server', () => {
  test('server time expiry produces a draw for equal cities and locks final results', async () => {
    const { s, a, b, room } = await match();
    expect(room.rulesVersion).toBe(ONLINE.version);
    room.remaining = 0.25;
    s.step(0.25);
    expect(room.result?.reason).toBe('time');
    expect(room.result?.rulesVersion).toBe(ONLINE.version);
    expect(s.db.history(a.welcome.id)[0].rulesVersion).toBe(ONLINE.version);
    expect(room.result?.winner).toBeNull();
    expect(s.db.history(a.welcome.id)[0].id).toBe(s.db.history(b.welcome.id)[0].id);
    const result = room.result;
    s.step(1);
    expect(room.result).toBe(result);
  });
  test('co-op reaches shared victory through legal construction and real city growth', async () => {
    const { s, a, b, room } = await match('coop');
    for (let i = 0; i < 4; i++) {
      const h = room.players[0].hand,
        g = withHand(room.games[0], h);
      const cells = [];
      for (let z = RULES.min; z <= RULES.max; z++)
        for (let x = RULES.min; x <= RULES.max; x++) cells.push({ x, z, y: 0 });
      cells.sort((u, v) => Math.hypot(u.x, u.z) - Math.hypot(v.x, v.z));
      const cell = cells.find((c) => validatePlacement(g, h.active, c).valid)!;
      expect(cell).toBeDefined();
      const ack = await a.action(
        { type: 'place', hand: h.token, cell, rotation: 0, pitch: 0, roll: 0 },
        randomUUID(),
        i + 1,
      );
      expect(ack.ok).toBe(true);
    }
    for (let i = 0; i < 200 && room.phase !== 'ended'; i++) s.step(0.25);
    expect(room.result?.reason).toBe('cooperativeVictory');
    expect(s.db.history(a.welcome.id)[0]).toEqual(s.db.history(b.welcome.id)[0]);
    expect(room.goalHold).toBeGreaterThanOrEqual(10);
  }, 15000);
  test('real quick matching pairs distinct sessions and rejects invalid origins and oversize frames', async () => {
    const { port } = await service(),
      a = await client(port, 'Queue A'),
      b = await client(port, 'Queue B');
    a.send({ type: 'queue', enabled: true });
    b.send({ type: 'queue', enabled: true });
    const room = await a.wait((v) => v.room.members.length === 2);
    expect((await b.wait((v) => v.room.members.length === 2)).room.code).toBe(room.room.code);
    const rejected = new WebSocket('ws://127.0.0.1:' + port + '/online', {
      origin: 'https://untrusted.example',
    });
    sockets.push(rejected);
    rejected.on('error', () => {});
    const status = await new Promise<number | undefined>((resolve) =>
      rejected.on('unexpected-response', (_, response) => {
        resolve(response.statusCode);
        response.resume();
        rejected.terminate();
      }),
    );
    expect(status).toBe(403);
    const closed = new Promise<number>((resolve) => b.ws.on('close', resolve));
    b.ws.send('x'.repeat(20000));
    expect(await closed).toBe(1009);
  });
  test('two identities, private invite, identical start, own commands, duplicate idempotency and durable final result', async () => {
    const { s, a, b, room } = await match();
    expect(a.welcome.id).not.toBe(b.welcome.id);
    expect(a.state()!.games[0]).toEqual(a.state()!.games[1]);
    expect(a.state()!.room.hand).toEqual(b.state()!.room.hand);
    const before = room.games[0],
      h = a.state()!.room.hand!,
      build = { ...placement(withHand(before, h)), hand: h.token } as Action;
    const id = randomUUID(),
      ack = await a.action(build, id, 1);
    expect(ack.ok).toBe(true);
    expect(room.games[0].buildings.length).toBe(before.buildings.length + 1);
    expect(room.games[1].buildings.length).toBe(before.buildings.length);
    a.send({ type: 'action', match: room.match, id, seq: 1, action: build });
    await waitFor(() => a.messages.filter((m) => m.type === 'ack' && m.id === id).length === 2);
    expect(room.games[0].buildings.length).toBe(before.buildings.length + 1);
    const staleId = randomUUID();
    a.send({ type: 'action', match: randomUUID(), id: staleId, seq: 2, action: build });
    await waitFor(() =>
      a.messages.some((m) => m.type === 'ack' && m.id === staleId && m.code === 'wrongMatch'),
    );
    expect(room.players[0].seq).toBe(1);
    b.send({ type: 'surrender' });
    const ended = await a.wait((v) => v.room.phase === 'ended');
    expect(ended.room.result!.winner).toBe(a.welcome.id);
    expect((await a.action(build, randomUUID(), 2)).code).toBe('notPlaying');
    expect(s.db.history(a.welcome.id)).toHaveLength(1);
    expect(s.db.history(b.welcome.id)[0].id).toBe(ended.room.result!.id);
  });
  test('co-op race has one winner, one charge, preserves rejected hand; host-only demolition', async () => {
    const { a, b, room } = await match('coop');
    const h = a.state()!.room.hand!,
      before = room.games[0],
      build = { ...placement(withHand(before, h)), hand: h.token } as Action;
    const [first, second] = await Promise.all([a.action(build), b.action(build)]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect(room.games[0].buildings.length).toBe(before.buildings.length + 1);
    const rejected = first.ok ? b : a;
    expect(rejected.state()!.room.hand!.token).toBe(0);
    const denied = await b.action(
      {
        type: 'demolish',
        target: { type: 'building', id: String(room.games[0].buildings.at(-1)!.id) },
      },
      randomUUID(),
      2,
    );
    expect(denied.code).toBe('hostOnly');
    await b.wait((v) => v.games[0].buildings.length === room.games[0].buildings.length);
    expect(a.state()!.games[0].city.stocks).toEqual(b.state()!.games[0].city.stocks);
  });
  test('reconnect restores identity, snapshot and dedupe state; spectator cannot mutate and receives no hand', async () => {
    const { s, port, a, b, room } = await match();
    a.ws.close();
    await waitFor(() => !room.players[0].connected);
    s.step(2);
    const remaining = room.remaining;
    const resumed = await client(port, 'Name ignored', a.welcome.token);
    const state = await resumed.wait((v) => v.room.phase === 'playing');
    expect(resumed.welcome.id).toBe(a.welcome.id);
    expect(resumed.welcome.name).toBe('A');
    expect(state.room.remaining).toBeLessThanOrEqual(remaining);
    const watcher = await client(port, 'Watcher');
    watcher.send({ type: 'join', code: room.code, spectator: true });
    expect((await watcher.wait((v) => v.games.length === 2)).room.hand).toBeNull();
    watcher.send({ type: 'surrender' });
    await waitFor(() => watcher.messages.some((m) => m.type === 'error' && m.code === 'readOnly'));
    expect(room.phase).toBe('playing');
    b.ws.close();
    await waitFor(() => !room.players[1].connected);
    s.step(0.25, Date.now() + 61000);
    expect(room.result!.reason).toBe('forfeit');
    expect(room.result!.winner).toBe(a.welcome.id);
  });
  test('ready gate, private room discovery and quick queue cancellation', async () => {
    const { port } = await service(),
      a = await client(port, 'Same'),
      b = await client(port, 'Same');
    expect(a.welcome.id).not.toBe(b.welcome.id);
    a.send({ type: 'queue', enabled: true });
    await waitFor(() => a.messages.some((m) => m.type === 'rooms' && m.queued));
    a.send({ type: 'queue', enabled: false });
    a.send({
      type: 'create',
      options: {
        name: 'Secret',
        mode: 'duel',
        public: false,
        seconds: 600,
        disaster: false,
        spectators: false,
      },
    });
    await a.wait((v) => v.room.members.length === 1);
    a.send({ type: 'start' });
    await waitFor(() => a.messages.some((m) => m.type === 'error' && m.code === 'notReady'));
    b.send({ type: 'list' });
    await new Promise((r) => setTimeout(r, 30));
    expect(b.messages.filter((m) => m.type === 'rooms').at(-1)).toMatchObject({ rooms: [] });
  });
  test('co-op pauses while all offline; server restart is an unranked abort', async () => {
    const { s, a, b, room } = await match('coop');
    a.ws.close();
    b.ws.close();
    await waitFor(() => room.players.every((p) => !p.connected));
    const before = room.remaining;
    s.step(5);
    expect(room.remaining).toBe(before);
    expect(room.paused).toBe(true);
    const directory = mkdtempSync(join(tmpdir(), 'skytopia-online-'));
    try {
      const path = join(directory, 'test.sqlite'),
        db = new Database(path);
      const guest = db.authenticate(undefined, 'Saved')!;
      const result: Result = {
        id: randomUUID(),
        version: 1,
        mode: 'duel',
        reason: 'running',
        winner: null,
        at: new Date().toISOString(),
        players: [{ id: guest.id, name: guest.name, score: scoreCity(room.games[0]) }],
      };
      db.begin(result);
      db.close();
      const reopened = new Database(path);
      expect(reopened.authenticate(guest.token, 'Other')!.id).toBe(guest.id);
      expect(reopened.history(guest.id)[0].reason).toBe('serverRestart');
      reopened.finish({ ...result, reason: 'time', winner: guest.id });
      expect(reopened.history(guest.id)[0].winner).toBeNull();
      reopened.close();
    } finally {
      if (
        dirname(resolve(directory)) !== resolve(tmpdir()) ||
        !basename(directory).startsWith('skytopia-online-')
      )
        throw Error('Unexpected temporary database directory');
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
