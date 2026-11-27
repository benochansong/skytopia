import {
  BoxGeometry,
  IcosahedronGeometry,
  BufferAttribute,
  Color,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
function tint(geometry: BufferGeometry, color: string, position: [number, number, number]) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  geometry.dispose();
  const c = new Color(color),
    colors = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.translate(...position);
  return g;
}
function merge(parts: BufferGeometry[]) {
  const result = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return result;
}
// Shared static meshes; route transforms and counts still come from the actual city.
export const citizenGeometry = merge([
  tint(new BoxGeometry(0.65, 0.6, 0.45), '#52677c', [0, 0, 0]),
  tint(new IcosahedronGeometry(0.25, 0), '#e6b591', [0, 0.47, 0]),
  tint(new BoxGeometry(0.22, 0.35, 0.25), '#35485b', [-0.2, -0.45, 0]),
  tint(new BoxGeometry(0.22, 0.35, 0.25), '#35485b', [0.2, -0.45, 0]),
]);
export const vehicleGeometry = merge([
  tint(new BoxGeometry(0.9, 0.5, 0.8), '#e4eaf0', [0, 0, 0]),
  tint(new BoxGeometry(0.5, 0.4, 0.6), '#52677c', [0, 0.4, 0.1]),
  tint(new BoxGeometry(0.55, 0.1, 0.1), '#e8bc67', [0, 0.2, 0.45]),
  ...[-0.45, 0.45].flatMap((x) =>
    [-0.28, 0.28].map((z) => tint(new BoxGeometry(0.15, 0.25, 0.23), '#35485b', [x, -0.25, z])),
  ),
]);
