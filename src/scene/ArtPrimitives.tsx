import { BoxGeometry, MeshStandardMaterial } from 'three';
type Vec = [number, number, number];
// Bounded by authored palette. Shared resources live for the renderer's module lifetime.
const box = new BoxGeometry();
const materials = new Map<string, MeshStandardMaterial>();
function material(color: string, emissive?: string) {
  const key = `${color}:${emissive ?? ''}`;
  let value = materials.get(key);
  if (!value) {
    value = new MeshStandardMaterial({
      color,
      roughness: 0.72,
      emissive: emissive ?? '#000000',
      emissiveIntensity: emissive ? 0.7 : 0,
    });
    materials.set(key, value);
  }
  return value;
}
export function ArtBox({
  position = [0, 0, 0],
  size = [1, 1, 1],
  color,
  emissive,
  rotation = [0, 0, 0],
}: {
  position?: Vec;
  size?: Vec;
  color: string;
  emissive?: string;
  rotation?: Vec;
}) {
  return (
    <mesh
      geometry={box}
      material={material(color, emissive)}
      position={position}
      scale={size}
      rotation={rotation}
      dispose={null}
      castShadow
      receiveShadow
    />
  );
}
