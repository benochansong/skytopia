import { useLayoutEffect, useRef } from 'react';
import { Group, Mesh, Material, MeshStandardMaterial } from 'three';
import { Facility } from './Buildings';
import type { Kind } from '../types/game';
export function GhostFacility({ kind, color }: { kind: Kind; color: string }) {
  const ref = useRef<Group>(null);
  useLayoutEffect(() => {
    const changed: { mesh: Mesh; original: Material | Material[]; copies: Material[] }[] = [];
    ref.current!.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const original = node.material,
        list = Array.isArray(original) ? original : [original];
      const copies = list.map((m) => {
        const copy = m.clone();
        copy.transparent = true;
        copy.opacity = 0.38;
        copy.depthWrite = false;
        if (copy instanceof MeshStandardMaterial) {
          copy.color.set(color);
          copy.emissive.set('#000000');
        }
        return copy;
      });
      node.material = Array.isArray(original) ? copies : copies[0];
      node.castShadow = false;
      changed.push({ mesh: node, original, copies });
    });
    return () =>
      changed.forEach(({ mesh, original, copies }) => {
        mesh.material = original;
        copies.forEach((m) => m.dispose());
      });
  }, [kind, color]);
  return (
    <group ref={ref}>
      <Facility kind={kind} output={0} />
    </group>
  );
}
