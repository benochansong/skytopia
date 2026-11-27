import { WebSocket } from 'ws';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createService } from '../server/service';
import { config } from '../server/config';
import type { Command, ServerMessage, RoomView } from '../src/game/online/protocol';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(check: () => boolean) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > 10000) throw Error('Load client timeout');
    await delay(10);
  }
}
const measurements = [];
for (const matches of [2, 4, 8]) {
  const server = createService({ ...config({}), database: ':memory:', port: 0 }),
    port = await server.listen();
  const clients: {
    ws: WebSocket;
    room?: RoomView;
    ready: boolean;
    bytes: number;
    maxMessage: number;
    messages: number;
    send: (c: Command) => void;
  }[] = [];
  try {
    for (let i = 0; i < matches * 2; i++) {
      const ws = new WebSocket('ws://127.0.0.1:' + port + '/online', {
        origin: 'http://127.0.0.1:5188',
      });
      const client = {
        ws,
        room: undefined as RoomView | undefined,
        ready: false,
        bytes: 0,
        maxMessage: 0,
        messages: 0,
        send: (c: Command) => ws.send(JSON.stringify(c)),
      };
      clients.push(client);
      ws.on('message', (data) => {
        const m = JSON.parse(data.toString()) as ServerMessage;
        const size = Buffer.byteLength(data.toString());
        client.bytes += size;
        client.messages++;
        client.maxMessage = Math.max(client.maxMessage, size);
        if (m.type === 'welcome') client.ready = true;
        if (m.type === 'state' || m.type === 'patch') client.room = m.room;
      });
      await new Promise<void>((resolve) => ws.on('open', resolve));
      client.send({ type: 'auth', name: 'Load ' + i, version: 1 });
      await wait(() => client.ready);
    }
    for (let i = 0; i < matches; i++) {
      const a = clients[i * 2],
        b = clients[i * 2 + 1];
      a.send({
        type: 'create',
        options: {
          name: 'Load match',
          mode: 'duel',
          public: false,
          seconds: 600,
          disaster: false,
          spectators: false,
        },
      });
      await wait(() => !!a.room);
      b.send({ type: 'join', code: a.room!.code, spectator: false });
      await wait(() => a.room?.members.length === 2);
      a.send({ type: 'ready', ready: true });
      b.send({ type: 'ready', ready: true });
      await wait(() => a.room!.members.every((p) => p.ready));
      a.send({ type: 'start' });
    }
    await wait(() => clients.every((c) => c.room?.phase === 'playing'));
    server.metrics.tickMs.length = 0;
    const cpu = process.cpuUsage(),
      start = performance.now(),
      bytes = clients.reduce((n, c) => n + c.bytes, 0);
    await delay(10000);
    const elapsed = performance.now() - start,
      usage = process.cpuUsage(cpu),
      ticks = [...server.metrics.tickMs].sort((a, b) => a - b);
    measurements.push({
      matches,
      players: clients.length,
      cities: matches * 2,
      seconds: elapsed / 1000,
      cpuMs: (usage.user + usage.system) / 1000,
      p50TickMs: ticks[Math.floor(ticks.length * 0.5)],
      p95TickMs: ticks[Math.floor(ticks.length * 0.95)],
      tickSamples: ticks.length,
      outgoingBytesPerSecond: (clients.reduce((n, c) => n + c.bytes, 0) - bytes) / (elapsed / 1000),
      maxMessageBytes: Math.max(...clients.map((c) => c.maxMessage)),
      rssBytes: process.memoryUsage().rss,
      buildingsPerCity: [...server.rooms.values()][0].games[0].buildings.length,
    });
    console.log(JSON.stringify(measurements.at(-1)));
  } finally {
    clients.forEach((c) => c.ws.terminate());
    await server.close();
  }
}
mkdirSync('docs/verification', { recursive: true });
writeFileSync(
  'docs/verification/phase8-load.json',
  JSON.stringify(
    {
      date: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      note: 'Single-process loopback; real WS clients; initial cities; no build spam, TLS, WAN or GPU. Not a production capacity promise.',
      measurements,
    },
    null,
    2,
  ) + '\n',
);
