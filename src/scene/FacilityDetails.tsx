import { useLayoutEffect, useRef } from 'react';
import { InstancedMesh, Object3D } from 'three';
import { useGame } from '../stores/gameStore';
import { cellsOf, floorOf } from '../game/grid';
import { visibleBuilding } from '../game/vertical/geometry';
import { PHYSICAL, VERTICAL, facility } from '../data/rules';
import { ART } from './art';
import { PRIMARY_KINDS } from './PrimaryFacilities';

export function FacilityDetails() {
  const game = useGame((s) => s.game),
    quality = useGame((s) => s.settings.quality);
  const rails = useRef<InstancedMesh>(null),
    cracks = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new Object3D();
    let railCount = 0,
      crackCount = 0;
    for (const b of game.buildings) {
      if (!visibleBuilding(b, game) || b.kind === 'road') continue;
      for (const c of cellsOf(b, b.origin)) {
        const h = facility(b).height,
          base = floorOf(c) * VERTICAL.height + 0.08;
        if ((b.level ?? 0) > 0 && quality !== 'low' && PRIMARY_KINDS.includes(b.kind)) {
          for (let level = 0; level < (b.level ?? 0); level++) {
            o.position.set(c.x, base + h * (0.55 + level * 0.15), c.z + 0.43);
            o.rotation.set(0, 0, 0);
            o.scale.set(0.8, 0.025, 0.035);
            o.updateMatrix();
            rails.current!.setMatrixAt(railCount++, o.matrix);
          }
        }
        if (b.durability / PHYSICAL[b.kind].hp < 0.65) {
          o.position.set(c.x + 0.12, base + h * 0.4, c.z + 0.44);
          o.rotation.set(0, 0, 0.4);
          o.scale.set(0.025, h * 0.3, 0.012);
          o.updateMatrix();
          cracks.current!.setMatrixAt(crackCount++, o.matrix);
        }
      }
    }
    for (const [ref, count] of [
      [rails, railCount],
      [cracks, crackCount],
    ] as const) {
      ref.current!.count = count;
      ref.current!.instanceMatrix.needsUpdate = true;
      ref.current!.computeBoundingSphere();
    }
  }, [game.buildings, game.vertical, quality]);
  return (
    <>
      <instancedMesh ref={rails} args={[undefined, undefined, 3584]}>
        <boxGeometry />
        <meshStandardMaterial color={ART.gold} metalness={0.5} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={cracks} args={[undefined, undefined, 1792]}>
        <boxGeometry />
        <meshStandardMaterial color="#4b4141" roughness={1} />
      </instancedMesh>
    </>
  );
}
