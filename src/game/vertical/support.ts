import type { Building } from '../../types/game';
import type { City } from '../stability/types';
import { VERTICAL, VERTICAL_DEFS, PHYSICAL, STRUCTURE } from '../../data/rules';
import { endpoints, role } from './geometry';
import { floorOf } from '../grid';
export function memberCapacity(b: Building, city: City, powered = true) {
  const d = VERTICAL_DEFS[b.kind]!,
    [a, z] = endpoints(b, b.origin),
    height = Math.abs(floorOf(a) - floorOf(z));
  let effectiveHeight = height;
  if (role(b) === 'column') {
    let top = Math.max(floorOf(a), floorOf(z));
    for (let i = 0; i < 7; i++) {
      const next = city.buildings.find(
        (o) =>
          o.id !== b.id &&
          o.enabled &&
          o.durability > 0 &&
          role(o) === 'column' &&
          o.origin.x === b.origin.x &&
          o.origin.z === b.origin.z &&
          o.y === top,
      );
      if (!next) break;
      const end = endpoints(next, next.origin)[1];
      top = floorOf(end);
      effectiveHeight = top - Math.min(floorOf(a), floorOf(z));
    }
  }
  const braced = city.buildings.some(
    (o) =>
      o.kind === 'diagonal' &&
      o.enabled &&
      o.durability > 0 &&
      o.y === b.y &&
      Math.hypot(o.origin.x - b.origin.x, o.origin.z - b.origin.z) <= 1.5,
  );
  const buckling =
    role(b) === 'column'
      ? 1 /
        (1 + (VERTICAL.columnBuckling * Math.max(0, effectiveHeight - 1) ** 2) / (braced ? 3 : 1))
      : 1;
  return (
    ((role(b) === 'hanger' ? d.tension : d.compression) / (b.shape === 'columnPair' ? 2 : 1)) *
    ((b.temporary ?? 0) > 0 ? 1.5 : 1) *
    (!powered && ['aetherColumn', 'aetherBridge'].includes(b.kind) ? 0.35 : 1) *
    buckling *
    (braced ? 1.35 : 1) *
    (1 + (b.reinforcement ?? 0) * STRUCTURE.braceCapacity) *
    (0.35 + 0.65 * Math.max(0, b.durability / PHYSICAL[b.kind].hp))
  );
}
