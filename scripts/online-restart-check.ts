import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import assert from 'node:assert/strict';
import type { Command, ServerMessage, RoomView } from '../src/game/online/protocol';
const directory = resolve('test-results/online-restart-' + Date.now());
mkdirSync(directory, { recursive: true });
const database = resolve(directory, 'game.sqlite');
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > 10000) throw Error('Restart test timeout');
    await pause(10);
  }
}
const children: ReturnType<typeof spawn>[] = [],
  sockets: WebSocket[] = [];
async function server() {
  const child = spawn(process.execPath, ['dist-server/index.mjs'], {
    windowsHide: true,
    env: {
      ...process.env,
      PORT: '0',
      HOST: '127.0.0.1',
      APP_ORIGIN: 'http://127.0.0.1:5188',
      DATABASE_PATH: database,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout!.on('data', (d) => (output += String(d)));
  child.stderr!.on('data', () => {});
  await until(() => /listening on port (\d+)/.test(output));
  return { child, port: Number(output.match(/listening on port (\d+)/)![1]) };
}
async function connect(port: number, token?: string) {
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/online', {
    origin: 'http://127.0.0.1:5188',
  });
  sockets.push(ws);
  const messages: ServerMessage[] = [];
  let room: RoomView | undefined;
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString()) as ServerMessage;
    messages.push(m);
    if (m.type === 'state' || m.type === 'patch') room = m.room;
  });
  ws.on('error', () => {});
  await new Promise<void>((r) => ws.on('open', r));
  const send = (c: Command) => ws.send(JSON.stringify(c));
  send({ type: 'auth', name: 'Restart check', version: 1, ...(token ? { token } : {}) });
  await until(() => messages.some((m) => m.type === 'welcome'));
  return {
    send,
    room: () => room,
    messages,
    welcome: messages.find((m) => m.type === 'welcome') as Extract<
      ServerMessage,
      { type: 'welcome' }
    >,
  };
}
try {
  const first = await server(),
    a = await connect(first.port),
    b = await connect(first.port);
  a.send({
    type: 'create',
    options: {
      name: 'Crash verification',
      mode: 'duel',
      public: false,
      seconds: 600,
      disaster: false,
      spectators: false,
    },
  });
  await until(() => !!a.room());
  b.send({ type: 'join', code: a.room()!.code, spectator: false });
  await until(() => a.room()!.members.length === 2);
  a.send({ type: 'ready', ready: true });
  b.send({ type: 'ready', ready: true });
  await until(() => a.room()!.members.every((p) => p.ready));
  a.send({ type: 'start' });
  await until(() => a.room()!.phase === 'playing');
  const exited = new Promise<void>((r) => first.child.once('exit', () => r()));
  first.child.kill('SIGKILL');
  await exited;
  const second = await server(),
    resumed = await connect(second.port, a.welcome.token);
  assert.equal(resumed.welcome.id, a.welcome.id);
  resumed.send({ type: 'history' });
  await until(() => resumed.messages.some((m) => m.type === 'history'));
  const history = resumed.messages.find((m) => m.type === 'history') as Extract<
    ServerMessage,
    { type: 'history' }
  >;
  assert.equal(history.results.length, 1);
  assert.equal(history.results[0].reason, 'serverRestart');
  assert.equal(history.results[0].winner, null);
  const health = await fetch('http://127.0.0.1:' + second.port + '/health');
  assert.equal(health.status, 200);
  const metrics = await fetch('http://127.0.0.1:' + second.port + '/metrics');
  assert.equal(metrics.status, 404);
  const result = {
    at: new Date().toISOString(),
    compiledServer: true,
    twoRealSockets: true,
    forcedProcessTermination: true,
    guestIdentityRetained: true,
    singleAbortedResult: true,
    noWinner: true,
    health: health.status,
    unauthenticatedMetrics: metrics.status,
  };
  mkdirSync('docs/verification', { recursive: true });
  writeFileSync('docs/verification/phase8-restart.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  sockets.forEach((ws) => ws.terminate());
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}
