import { create } from 'zustand';
import { useGame } from '../stores/gameStore';
import { withHand } from '../game/online/match';
import type { Action, Command, Result, RoomView, ServerMessage } from '../game/online/protocol';
import type { Game } from '../types/game';
import { setOnlinePort } from './port';
type State = {
  enabled: boolean;
  status: 'offline' | 'connecting' | 'connected' | 'reconnecting';
  id: string;
  name: string;
  room: RoomView | null;
  games: Game[];
  revision: number;
  rooms: Extract<ServerMessage, { type: 'rooms' }>['rooms'];
  queued: boolean;
  error: string;
  pending: boolean;
  latency: number;
  history: Result[];
  viewing: number;
};
export const useOnline = create<State>(() => ({
  enabled: false,
  status: 'offline',
  id: '',
  name: '',
  room: null,
  games: [],
  revision: 0,
  rooms: [],
  queued: false,
  error: '',
  pending: false,
  latency: 0,
  history: [],
  viewing: -1,
}));
let socket: WebSocket | null = null,
  retry: ReturnType<typeof setTimeout> | undefined,
  heartbeat: ReturnType<typeof setInterval> | undefined;
let stopped = true,
  attempt = 0,
  token = '',
  pending: Extract<Command, { type: 'action' }> | null = null;
let backup: ReturnType<typeof useGame.getState> | null = null;
const storageKey = 'skytopia.online.session.v1';
function endpoint() {
  const value = import.meta.env.VITE_MULTIPLAYER_URL as string | undefined;
  const url = new URL(value || '/online', window.location.href);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (
    !['ws:', 'wss:'].includes(url.protocol) ||
    (location.protocol === 'https:' && url.protocol !== 'wss:')
  )
    throw Error('invalidEndpoint');
  return url.toString();
}
export function send(command: Command) {
  if (
    socket?.readyState !== WebSocket.OPEN ||
    (command.type !== 'auth' && useOnline.getState().status !== 'connected')
  ) {
    useOnline.setState({ error: 'connectionRequired' });
    return false;
  }
  socket.send(JSON.stringify(command));
  return true;
}
export function projectCity() {
  const s = useOnline.getState();
  if (!s.room || !s.games.length) return;
  const ownIndex = s.room.members.findIndex((p) => p.id === s.id);
  const index =
    s.viewing >= 0
      ? Math.min(s.viewing, s.games.length - 1)
      : s.room.options.mode === 'coop'
        ? 0
        : Math.max(0, ownIndex);
  const own = s.viewing < 0 && ownIndex >= 0;
  const old = useGame.getState(),
    g = s.games[index];
  const game = own && s.room.hand ? withHand(g, s.room.hand) : g;
  const sameHand =
    old.game.active.kind === game.active.kind && old.game.active.shape === game.active.shape;
  useGame.setState({
    game: {
      ...game,
      settings: old.settings,
      cursor: old.game.cursor,
      active: sameHand
        ? {
            ...game.active,
            rotation: old.game.active.rotation,
            pitch: old.game.active.pitch,
            roll: old.game.active.roll,
          }
        : game.active,
      vertical: game.vertical
        ? {
            ...game.vertical,
            floor: old.game.vertical?.floor || 0,
            view: old.game.vertical?.view || 'all',
          }
        : undefined,
    },
    screen: 'playing',
  });
}
export function action(input: Action | 'place' | 'hold' | 'recycle') {
  const s = useOnline.getState(),
    r = s.room;
  if (s.status !== 'connected' || !r?.hand || r.phase !== 'playing' || s.viewing >= 0 || pending)
    return;
  const g = useGame.getState().game;
  const a: Action =
    typeof input !== 'string'
      ? input
      : input === 'place'
        ? {
            type: input,
            hand: r.hand.token,
            cell: { ...g.cursor, y: g.vertical?.floor || 0 },
            rotation: g.active.rotation,
            pitch: g.active.pitch || 0,
            roll: g.active.roll || 0,
          }
        : { type: input, hand: r.hand.token };
  pending = {
    type: 'action',
    match: r.match,
    id: crypto.randomUUID(),
    seq: r.lastSeq + 1,
    action: a,
  };
  useOnline.setState({ pending: true, error: '' });
  if (!send(pending)) {
    pending = null;
    useOnline.setState({ pending: false });
  }
}
function connect() {
  if (stopped) return;
  useOnline.setState({ status: attempt ? 'reconnecting' : 'connecting' });
  let current: WebSocket;
  try {
    current = new WebSocket(endpoint());
    socket = current;
  } catch {
    useOnline.setState({ status: 'offline', error: 'invalidEndpoint' });
    return;
  }
  current.onopen = () => {
    current.send(
      JSON.stringify({
        type: 'auth',
        version: 1,
        name: useOnline.getState().name,
        ...(token ? { token } : {}),
      }),
    );
  };
  current.onmessage = (event) => {
    if (socket !== current || stopped) return;
    let message: ServerMessage;
    try {
      message = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      return;
    }
    if (message.type === 'welcome') {
      token = message.token;
      attempt = 0;
      try {
        localStorage.setItem(storageKey, JSON.stringify({ version: 1, token, name: message.name }));
      } catch {
        /* Session remains usable for this tab. */
      }
      useOnline.setState({ id: message.id, name: message.name, status: 'connected', error: '' });
      if (pending) current.send(JSON.stringify(pending));
      send({ type: 'history' });
      return;
    }
    if (message.type === 'state' || message.type === 'patch') {
      const s = useOnline.getState();
      if (message.type === 'patch' && message.base !== s.revision) {
        send({ type: 'resync' });
        return;
      }
      const games =
        message.type === 'state'
          ? message.games
          : message.games.map((g, i) => ({ ...s.games[i], ...g }));
      const changedRoom = s.room?.code !== message.room.code;
      if (changedRoom) {
        pending = null;
        useOnline.setState({ pending: false, viewing: -1 });
      }
      useOnline.setState({
        room: message.room,
        games,
        revision: message.revision,
        ...(message.room.phase === 'ended' ? { error: '', pending: false } : {}),
      });
      projectCity();
      return;
    }
    if (message.type === 'ack') {
      if (pending?.id === message.id) {
        pending = null;
        useOnline.setState({ pending: false, error: message.ok ? '' : message.code });
      }
      return;
    }
    if (message.type === 'error') {
      useOnline.setState({ error: message.code });
      if (message.code === 'invalidSession') {
        stopped = true;
        token = '';
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* optional */
        }
        current.close();
      }
    }
    if (message.type === 'rooms')
      useOnline.setState({ rooms: message.rooms, queued: message.queued });
    if (message.type === 'history') useOnline.setState({ history: message.results });
    if (message.type === 'heartbeat')
      useOnline.setState({ latency: Math.max(0, Date.now() - message.sent) });
    if (message.type === 'left') {
      pending = null;
      useOnline.setState({ room: null, games: [], pending: false, viewing: -1 });
      send({ type: 'history' });
    }
  };
  current.onclose = (event) => {
    if (socket !== current) return;
    if (event.code === 4001) {
      stopped = true;
      useOnline.setState({ error: 'replaced' });
    }
    useOnline.setState({ status: stopped ? 'offline' : 'reconnecting' });
    if (!stopped) retry = setTimeout(connect, Math.min(10000, 700 * 2 ** Math.min(++attempt, 4)));
  };
  current.onerror = () => useOnline.setState({ error: 'connectionRequired' });
}
export function openOnline() {
  if (useOnline.getState().enabled) return;
  backup = useGame.getState();
  setOnlinePort(action);
  useOnline.setState({ enabled: true, error: '' });
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (
      saved?.version === 1 &&
      typeof saved.token === 'string' &&
      saved.token.length < 100 &&
      typeof saved.name === 'string'
    ) {
      token = saved.token;
      useOnline.setState({ name: saved.name.slice(0, 20) });
    }
  } catch {
    /* Invalid online credentials never touch offline saves. */
  }
}
export function login(name: string) {
  if (socket && socket.readyState < WebSocket.CLOSING) return;
  stopped = false;
  attempt = 0;
  useOnline.setState({ name: name.trim().slice(0, 20) || 'Sky Builder' });
  connect();
  clearInterval(heartbeat);
  heartbeat = setInterval(() => {
    if (useOnline.getState().status === 'connected') send({ type: 'heartbeat', sent: Date.now() });
  }, 5000);
}
export function closeOnline() {
  // An active match requires the UI's explicit surrender confirmation first.
  stopped = true;
  clearTimeout(retry);
  clearInterval(heartbeat);
  socket?.close();
  socket = null;
  pending = null;
  setOnlinePort(null);
  if (backup) {
    const settings = useGame.getState().settings;
    useGame.setState({ ...backup, settings, game: { ...backup.game, settings } });
  }
  backup = null;
  useOnline.setState({
    enabled: false,
    status: 'offline',
    room: null,
    games: [],
    pending: false,
    queued: false,
    viewing: -1,
  });
}
export function viewCity(index: number) {
  useOnline.setState({ viewing: index });
  projectCity();
}
