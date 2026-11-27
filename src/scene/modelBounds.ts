import type { Box3 } from 'three';
export function modelFits(bounds: Box3, height: number) {
  const values = [...bounds.min.toArray(), ...bounds.max.toArray()];
  return (
    !bounds.isEmpty() &&
    values.every(Number.isFinite) &&
    bounds.min.x >= -0.49 &&
    bounds.max.x <= 0.49 &&
    bounds.min.z >= -0.49 &&
    bounds.max.z <= 0.49 &&
    bounds.min.y >= -0.01 &&
    bounds.max.y <= height
  );
}
