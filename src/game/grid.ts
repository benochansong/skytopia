import { SHAPES, RULES } from '../data/rules';
import type { Cell, Piece } from '../types/game';
export const key = (c: Cell) => `${c.x},${c.z}`;
export const neighbors = (c: Cell): Cell[] => [
  { x: c.x + 1, z: c.z },
  { x: c.x - 1, z: c.z },
  { x: c.x, z: c.z + 1 },
  { x: c.x, z: c.z - 1 },
];
export function rotate(c: Cell, rotation: number): Cell {
  let { x, z } = c;
  for (let i = 0; i < ((rotation % 4) + 4) % 4; i++) [x, z] = [-z, x];
  return { x: x || 0, z: z || 0 };
}
export const cellsOf = (p: Piece, origin: Cell = { x: 0, z: 0 }) =>
  SHAPES[p.shape].map((c) => {
    const r = rotate(c, p.rotation);
    return { x: r.x + origin.x, z: r.z + origin.z };
  });
export const inBounds = (c: Cell) =>
  c.x >= RULES.min && c.x <= RULES.max && c.z >= RULES.min && c.z <= RULES.max;
export function cameraMove(dx: number, dz: number, azimuth: number): Cell {
  return rotate({ x: dx, z: dz }, -Math.round(azimuth / (Math.PI / 2)));
}
