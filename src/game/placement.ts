import type { Game, Piece, Cell, Placement, PlacementReason } from '../types/game';
import { cellsOf, inBounds, key, neighbors } from './grid';
import { analyze } from './analysis';
import { BLOCKS } from '../data/rules';
export function validatePlacement(
  g: Game,
  p: Piece = g.active,
  cursor: Cell = g.cursor,
  warnings = true,
): Placement {
  const cells = cellsOf(p, cursor);
  const result = (valid: boolean, reason: PlacementReason, warning = false) => ({
    valid,
    reason,
    warning,
    cells,
  });
  if (cells.some((c) => !inBounds(c))) return result(false, 'bounds');
  if (cells.some((c) => c.x === 0 && c.z === 0)) return result(false, 'core');
  const platforms = new Set(g.platforms.map(key));
  const occupied = new Set(g.buildings.flatMap((b) => cellsOf(b, b.origin).map(key)));
  if (p.kind === 'platform') {
    if (cells.some((c) => platforms.has(key(c)))) return result(false, 'overlap');
    if (!cells.some((c) => neighbors(c).some((n) => platforms.has(key(n)))))
      return result(false, 'disconnectedPlatform');
  } else {
    if (cells.some((c) => occupied.has(key(c)))) return result(false, 'overlap');
    if (cells.some((c) => !platforms.has(key(c)))) return result(false, 'missingPlatform');
  }
  if (warnings) {
    const projected =
      p.kind === 'platform'
        ? {
            ...g,
            platforms: [
              ...g.platforms,
              ...cells.map((c) => ({
                ...c,
                y: 0 as const,
                variant: 'grass' as const,
                mass: BLOCKS.platform.mass / cells.length,
                durability: 100,
              })),
            ],
          }
        : {
            ...g,
            buildings: [
              ...g.buildings,
              { ...p, id: g.nextId, origin: cursor, y: 0 as const, initial: false },
            ],
          };
    const s = analyze(projected);
    if (s.stability < 70) return result(true, 'balanceWarning', true);
    if (p.kind !== 'platform' && !s.connectedIds.has(g.nextId))
      return result(true, 'connectionWarning', true);
  }
  return result(true, 'ready');
}
