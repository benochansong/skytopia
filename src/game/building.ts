import { isPlatform } from '../data/rules';
import type { Cell, Game, Piece } from '../types/game';
import { cellsOf, key, rotate } from './grid';
import { makeBuilding, makePlatform, edgeKey } from './stability/state';
import { reinforce } from './repair/maintenance';
export function braceTarget(g: Game, p: Piece, cursor: Cell) {
  const direction = rotate({ x: 1, z: 0 }, p.rotation),
    other = { x: cursor.x + direction.x, z: cursor.z + direction.z, y: cursor.y ?? 0 };
  return g.platforms.some((v) => key(v) === key(other))
    ? { type: 'edge' as const, id: edgeKey(key(cursor), key(other)) }
    : { type: 'platform' as const, id: key(cursor) };
}
export function projectPlacement(g: Game, p: Piece = g.active, cursor: Cell = g.cursor): Game {
  if (p.kind === 'brace') return reinforce(g, braceTarget(g, p, cursor), true);
  const cells = cellsOf(p, cursor);
  if (isPlatform(p.kind))
    return {
      ...g,
      platforms: [
        ...g.platforms,
        ...cells.map((c) => makePlatform(c, p.kind, g.nextId, cells.length)),
      ],
    };
  return { ...g, buildings: [...g.buildings, makeBuilding(p, cursor, g.nextId)] };
}
