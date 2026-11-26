import { aetherFactor } from '../disasters/effects';
import { facility } from '../../data/cityRules';
import { PHYSICAL, STRUCTURE, isLift, VERTICAL } from '../../data/rules';
import type { City, LiftOutput, Network } from './types';
import { footprintCenter } from './state';
import { cellsOf, key } from '../grid';
export function calculateLift(city: City, network: Network) {
  const core =
    STRUCTURE.coreLift *
    Math.max(0, (city.structure?.coreDurability ?? STRUCTURE.coreHP) / STRUCTURE.coreHP) *
    (city.platforms.some((p) => p.x === 0 && p.z === 0 && p.y === 0 && p.durability > 0) ? 1 : 0);
  let total = core,
    maximum = core,
    mx = 0,
    mz = 0,
    my = 0;
  const lifts: LiftOutput[] = [];
  for (const b of city.buildings.filter((b) => isLift(b.kind))) {
    const def = PHYSICAL[b.kind],
      health = Math.max(0, Math.min(1, b.durability / def.hp)),
      state = city.structure?.lifts[b.id];
    const desired = b.enabled ? (network.powerRatios.get(b.id) ?? 0) : 0;
    const factor = b.enabled ? (state?.factor ?? desired) : 0,
      max = facility(b).lift * health;
    const output = max * factor * aetherFactor(city, b),
      cell = footprintCenter(b);
    total += output;
    maximum += max;
    mx += output * cell.x;
    mz += output * cell.z;
    my += output * b.y * VERTICAL.height;
    lifts.push({
      id: b.id,
      cell,
      cells: cellsOf(b, b.origin).map(key),
      output,
      maximum: max,
      desired,
      factor,
      powered: desired >= 1,
      connected: network.operational.has(b.id),
    });
  }
  const emergency = city.structure?.emergency;
  if (
    emergency &&
    emergency.remaining > 0 &&
    city.platforms.some((p) => p.durability > 0 && key(p) === key(emergency.cell))
  ) {
    total += STRUCTURE.emergencyLift;
    maximum += STRUCTURE.emergencyLift;
    mx += STRUCTURE.emergencyLift * emergency.cell.x;
    mz += STRUCTURE.emergencyLift * emergency.cell.z;
    my += STRUCTURE.emergencyLift * (emergency.cell.y ?? 0) * VERTICAL.height;
    lifts.push({
      id: -1,
      cell: emergency.cell,
      cells: [key(emergency.cell)],
      output: STRUCTURE.emergencyLift,
      maximum: STRUCTURE.emergencyLift,
      desired: 1,
      factor: 1,
      powered: true,
      connected: true,
    });
  }
  return {
    total,
    maximum,
    center: { x: total ? mx / total : 0, y: total ? my / total : 0, z: total ? mz / total : 0 },
    lifts,
  };
}
