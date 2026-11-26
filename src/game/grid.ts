import { SHAPES, RULES, VERTICAL } from '../data/rules';
import type { Cell, Piece } from '../types/game';
export const floorOf = (c: Cell) => c.y ?? 0;
// Preserve zero-floor IDs so legacy support/event references remain valid.
export const key = (c: Cell) => (floorOf(c) ? `${c.x},${floorOf(c)},${c.z}` : `${c.x},${c.z}`);
export const atFloor = (x: number, z: number, y = 0): Cell => (y ? { x, z, y } : { x, z });
export const parseKey = (id: string): Cell => {
  const a = id.split(',').map(Number);
  return a.length === 3 ? atFloor(a[0], a[2], a[1]) : atFloor(a[0], a[1]);
};
export const neighbors = (c: Cell): Cell[] => [
  atFloor(c.x + 1, c.z, floorOf(c)),
  atFloor(c.x - 1, c.z, floorOf(c)),
  atFloor(c.x, c.z + 1, floorOf(c)),
  atFloor(c.x, c.z - 1, floorOf(c)),
];
export function rotate(c: Cell, rotation: number): Cell {
  let { x, z } = c;
  for (let i = 0; i < ((rotation % 4) + 4) % 4; i++) [x, z] = [-z, x];
  return atFloor(x || 0, z || 0, floorOf(c));
}
export function transform(c: Cell, p: Pick<Piece, 'rotation' | 'pitch' | 'roll'>): Cell {
  let x = c.x,
    y = floorOf(c),
    z = c.z;
  for (let i = 0; i < (p.pitch ?? 0); i++) [y, z] = [-z, y];
  for (let i = 0; i < (p.roll ?? 0); i++) [x, y] = [-y, x];
  return rotate(atFloor(x, z, y), p.rotation);
}
export const cellsOf = (p: Piece, origin: Cell = { x: 0, z: 0 }) =>
  SHAPES[p.shape].map((c) => {
    const r = transform(c, p);
    return atFloor(r.x + origin.x, r.z + origin.z, floorOf(r) + floorOf(origin));
  });
export const inBounds = (c: Cell) =>
  c.x >= RULES.min &&
  c.x <= RULES.max &&
  c.z >= RULES.min &&
  c.z <= RULES.max &&
  floorOf(c) >= VERTICAL.min &&
  floorOf(c) <= VERTICAL.max;
export function cameraMove(dx: number, dz: number, azimuth: number): Cell {
  return rotate({ x: dx, z: dz }, -Math.round(azimuth / (Math.PI / 2)));
}
