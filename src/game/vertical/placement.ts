import type { Game, Piece, Cell, PlacementReason } from '../../types/game';
import { VERTICAL, VERTICAL_KINDS, isPlatform } from '../../data/rules';
import { volume, segments, isLink, hasPlatform, role } from './geometry';
import { cellsOf, floorOf, inBounds, key, neighbors } from '../grid';
import { projectPlacement } from '../building';
import { buildGraph } from '../stability/structuralGraph';
export function floorRange(g: Game) {
  const id = g.campaign?.continued ? undefined : g.campaign?.stage;
  return !g.vertical
    ? [0, 0]
    : id && id < 16
      ? [0, 0]
      : id === 16
        ? [0, 1]
        : id === 17 || id === 18
          ? [0, 2]
          : [VERTICAL.min, VERTICAL.max];
}
export function verticalPlacement(g: Game, p: Piece, c: Cell): PlacementReason | null {
  const [min, max] = floorRange(g),
    cells = isPlatform(p.kind) ? cellsOf(p, c) : volume(p, c);
  if (
    (!g.vertical && VERTICAL_KINDS.includes(p.kind)) ||
    cells.some((v) => floorOf(v) < min || floorOf(v) > max)
  )
    return 'verticalLocked';
  if (cells.some((v) => !inBounds(v))) return 'bounds';
  if (cells.some((v) => floorOf(v) < 0 && Math.abs(v.x) <= 2 && Math.abs(v.z) <= 2))
    return 'rockVolume';
  if ((p.pitch || p.roll) && !['beam', 'truss'].includes(p.kind)) return 'invalidEndpoint';
  if (cells.some((v) => v.x === 0 && v.z === 0)) return 'core';
  const occupied = new Set(g.buildings.flatMap((b) => volume(b, b.origin).map(key)));
  if (cells.some((v) => occupied.has(key(v))) && p.kind !== 'brace') return 'volumeOverlap';
  // A platform is a floor plane, not a license to intersect a tall facility.
  if (
    !isPlatform(p.kind) &&
    cells.some((v) => floorOf(v) !== floorOf(c) && hasPlatform(g, v)) &&
    !isLink(p)
  )
    return 'volumeOverlap';
  if (isLink(p)) {
    for (const [a, b] of segments(p, c)) {
      if (!inBounds(a) || !inBounds(b) || floorOf(b) < min || floorOf(b) > max) return 'bounds';
      if (!hasPlatform(g, a)) return 'noSupport';
      if (
        ['beam', 'bridge', 'transport', 'power', 'brace'].includes(role(p)!) &&
        !hasPlatform(g, b)
      )
        return 'invalidEndpoint';
      if (role(p) === 'bridge' && cells.slice(1).some((v) => hasPlatform(g, v)))
        return 'volumeOverlap';
    }
    return null;
  }
  if (isPlatform(p.kind) && cells.some((v) => floorOf(v) !== 0)) {
    const projected = projectPlacement(g, p, c),
      graph = buildGraph(projected);
    for (const v of cells) {
      const comp = graph.components[graph.componentOf.get(key(v))!];
      if (!comp?.anchored) return 'noSupport';
      const q = [{ v, d: 0 }],
        seen = new Set<string>();
      let supported = false;
      for (let i = 0; i < q.length; i++) {
        const { v: n, d } = q[i],
          k = key(n);
        if (seen.has(k) || d > VERTICAL.maxCantilever) continue;
        seen.add(k);
        if ([...graph.members.keys()].some((e) => e.split('|').includes(k))) {
          supported = true;
          break;
        }
        for (const v of neighbors(n)) if (graph.nodes.has(key(v))) q.push({ v, d: d + 1 });
      }
      if (!supported) return 'noSupport';
    }
  }
  // Lower deliveries use an underside drone route; ordinary upper/ground deliveries descend.
  if (floorOf(c) >= 0 && !isPlatform(p.kind)) {
    const footprint = new Set(cells.map((v) => v.x + ',' + v.z));
    if (
      g.platforms.some(
        (v) => v.y > Math.max(...cells.map(floorOf)) && footprint.has(v.x + ',' + v.z),
      )
    )
      return 'descentBlocked';
  }
  return null;
}
