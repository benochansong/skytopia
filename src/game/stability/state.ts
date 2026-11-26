import { BLOCKS, PHYSICAL, STRUCTURE } from '../../data/rules';
import type { Cell, Kind, Platform, Piece, Building, StructureState } from '../../types/game';
import { cellsOf, key, parseKey, floorOf } from '../grid';
export const edgeKey = (a: string, b: string) => [a, b].sort().join('|');
export const fromKey = parseKey;
export const platformDefinition = (p: Platform) =>
  PHYSICAL[p.kind ?? (p.material === 'metal' ? 'metalPlatform' : 'platform')];
export const platformMaxHP = (p: Platform) =>
  platformDefinition(p).hp + p.reinforcement * STRUCTURE.braceHP;
export function freshStructure(): StructureState {
  return {
    edges: {},
    lifts: {},
    coreDurability: STRUCTURE.coreHP,
    accumulator: 0,
    grace: 10,
    criticalTime: 0,
    pending: [],
    events: [],
    nextEventId: 1,
    emergency: { cell: { x: 0, z: 0 }, remaining: 0, cooldown: 0 },
    repairs: [],
    repairsDone: 0,
    reinforcementsDone: 0,
    collapsedCount: 0,
    maxCitySize: 41,
    loss: null,
  };
}
export function makePlatform(
  c: Cell,
  kind: Kind = 'platform',
  id = 0,
  count = 1,
  anchor = false,
): Platform {
  return {
    ...c,
    id: `p${id}:${key(c)}`,
    y: floorOf(c),
    ...(kind !== 'platform' && kind !== 'metalPlatform' ? { kind } : {}),
    variant: kind === 'metalPlatform' ? 'metal' : 'grass',
    material: kind === 'metalPlatform' ? 'metal' : 'basic',
    mass: BLOCKS[kind].mass / count,
    durability: PHYSICAL[kind].hp,
    reinforcement: 0,
    anchor,
  };
}
export function makeBuilding(piece: Piece, origin: Cell, id: number, initial = false): Building {
  return {
    ...piece,
    origin: { ...origin },
    id,
    y: floorOf(origin),
    initial,
    durability: PHYSICAL[piece.kind].hp,
    enabled: true,
  };
}
export function footprintCenter(b: Building): Cell {
  const cells = cellsOf(b, b.origin);
  return {
    ...(b.y ? { y: b.y } : {}),
    x: cells.reduce((s, c) => s + c.x, 0) / cells.length,
    z: cells.reduce((s, c) => s + c.z, 0) / cells.length,
  };
}
