import type { Building, Cell, Game, Piece } from '../../types/game';
import { VERTICAL, VERTICAL_DEFS, PHYSICAL } from '../../data/rules';
import { cellsOf, floorOf, key, atFloor, transform } from '../grid';
export const role = (p: Piece) => VERTICAL_DEFS[p.kind]?.role;
export const isLink = (p: Piece) =>
  ['column', 'beam', 'hanger', 'bridge', 'transport', 'power', 'brace'].includes(role(p) ?? '');
export function endpoints(p: Piece, origin: Cell): [Cell, Cell] {
  const d = VERTICAL_DEFS[p.kind];
  let delta: Cell = { x: 0, z: 0, y: d?.role === 'column' ? 1 : (d?.span ?? 1) };
  if (d?.role === 'brace') delta = { x: 1, z: 0, y: 1 };
  if (d?.role === 'hanger') delta = { x: 0, z: 0, y: -1 };
  if (d?.role === 'bridge') delta = { x: 3, z: 0 };
  if (d?.role === 'beam') delta = { x: p.shape === 'arch' ? 2 : p.shape === 'I' ? 2 : 1, z: 0 };
  if (p.shape === 'verticalI') delta = { x: 0, z: 0, y: 2 };
  const r = transform(delta, p);
  return [origin, atFloor(origin.x + r.x, origin.z + r.z, floorOf(origin) + floorOf(r))];
}
export function segments(p: Piece, origin: Cell): [Cell, Cell][] {
  const first = endpoints(p, origin);
  if (p.shape !== 'columnPair') return [first];
  const offset = transform({ x: 1, z: 0 }, p);
  return [
    first,
    endpoints(
      { ...p, shape: 'single' },
      atFloor(origin.x + offset.x, origin.z + offset.z, floorOf(origin) + floorOf(offset)),
    ),
  ];
}
export function volume(p: Piece, origin: Cell): Cell[] {
  if (isLink(p)) {
    if (p.shape === 'arch' || p.shape === 'columnPair') return cellsOf(p, origin);
    const [a, b] = endpoints(p, origin),
      n = Math.max(Math.abs(a.x - b.x), Math.abs(floorOf(a) - floorOf(b)), Math.abs(a.z - b.z));
    // End platforms may occupy the terminal plane; the member fills its intervening volume.
    return Array.from({ length: Math.max(1, n) }, (_, i) =>
      atFloor(
        Math.round(a.x + ((b.x - a.x) * i) / n),
        Math.round(a.z + ((b.z - a.z) * i) / n),
        Math.floor(floorOf(a) + ((floorOf(b) - floorOf(a)) * i) / n),
      ),
    );
  }
  const height = Math.max(1, Math.ceil(PHYSICAL[p.kind].height / VERTICAL.height));
  return cellsOf(p, origin).flatMap((c) =>
    Array.from({ length: height }, (_, i) => atFloor(c.x, c.z, floorOf(c) + i)),
  );
}
export function visibleAt(y: number, g: Game, x = 0, z = 0) {
  const v = g.vertical;
  if (!v) return true;
  return v.view === 'active'
    ? y <= v.floor
    : v.view === 'lower'
      ? y <= 0
      : v.view === 'cutaway'
        ? !(y > v.floor && x + z > 0)
        : true;
}
export function footprint(b: Building) {
  return isLink(b) ? segments(b, b.origin).flat() : cellsOf(b, b.origin);
}
export const hasVertical = (g: Pick<Game, 'platforms' | 'buildings'>) =>
  g.platforms.some((p) => p.y !== 0) || g.buildings.some((b) => b.y !== 0 || isLink(b));
export const hasPlatform = (g: Pick<Game, 'platforms'>, c: Cell) =>
  g.platforms.some((p) => key(p) === key(c) && p.durability > 0);

export const visibleBuilding = (b: Building, g: Game) =>
  visibleAt(b.y, g, b.origin.x, b.origin.z) &&
  (!(g.vertical?.view === 'structure' || g.vertical?.view === 'blueprint') || isLink(b));
