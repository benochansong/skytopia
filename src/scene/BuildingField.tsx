import { KINDS, VERTICAL } from '../data/rules';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { BufferGeometry, Group, InstancedMesh, Material, Matrix4, Mesh, Object3D } from 'three';
import { Facility } from './Buildings';
import { useGame } from '../stores/gameStore';
import { cellsOf, key, neighbors, floorOf } from '../game/grid';
import { analyze } from '../game/analysis';
import type { Building, Kind } from '../types/game';
import { visibleBuilding } from '../game/vertical/geometry';
export const INSTANCED_KINDS: Kind[] = [
  ...KINDS.filter(
    (k) =>
      ![
        'platform',
        'metalPlatform',
        'brace',
        'power',
        'liftSmall',
        'liftLarge',
        'home',
        'largeHome',
        'factory',
        'farm',
        'park',
        'ballast',
        'road',
      ].includes(k),
  ),
  'home',
  'largeHome',
  'factory',
  'farm',
  'park',
  'ballast',
  'road',
];
type Part = { geometry: BufferGeometry; material: Material | Material[]; matrix: Matrix4 };
function Instances({ part, buildings }: { part: Part; buildings: Building[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new Object3D(),
      matrix = new Matrix4();
    let i = 0;
    for (const b of buildings)
      for (const c of cellsOf(b, b.origin)) {
        o.position.set(c.x, floorOf(c) * VERTICAL.height + 0.08, c.z);
        o.rotation.set(0, (-b.rotation * Math.PI) / 2, 0);
        o.scale.set(1, 1 + 0.15 * (b.level ?? 0), 1);
        o.updateMatrix();
        matrix.multiplyMatrices(o.matrix, part.matrix);
        ref.current!.setMatrixAt(i++, matrix);
      }
    ref.current!.count = i;
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  }, [part, buildings]);
  return (
    <instancedMesh ref={ref} args={[part.geometry, part.material, 1792]} castShadow receiveShadow />
  );
}
function RepeatedFacility({ kind, buildings }: { kind: Kind; buildings: Building[] }) {
  const template = useRef<Group>(null),
    [parts, setParts] = useState<Part[]>([]);
  useLayoutEffect(() => {
    const root = template.current!;
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert(),
      out: Part[] = [];
    root.traverse((child) => {
      if (child instanceof Mesh)
        out.push({
          geometry: child.geometry,
          material: child.material,
          matrix: new Matrix4().multiplyMatrices(inverse, child.matrixWorld),
        });
    });
    setParts(out);
  }, [kind]);
  return (
    <>
      <group ref={template} visible={false}>
        <Facility kind={kind} />
      </group>
      {parts.map((part, i) => (
        <Instances key={i} part={part} buildings={buildings} />
      ))}
    </>
  );
}
function Roads({ buildings }: { buildings: Building[] }) {
  const ground = useRef<InstancedMesh>(null),
    mark = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const cells = buildings.flatMap((b) => cellsOf(b, b.origin)),
      roads = new Set(cells.map(key)),
      o = new Object3D();
    let i = 0,
      j = 0;
    for (const c of cells) {
      o.position.set(c.x, floorOf(c) * VERTICAL.height + 0.095, c.z);
      o.scale.set(0.92, 0.035, 0.92);
      o.updateMatrix();
      ground.current!.setMatrixAt(i++, o.matrix);
      o.position.y = floorOf(c) * VERTICAL.height + 0.115;
      o.scale.set(0.12, 0.015, 0.12);
      o.updateMatrix();
      mark.current!.setMatrixAt(j++, o.matrix);
      for (const n of neighbors(c))
        if (roads.has(key(n))) {
          o.position.set(
            c.x + (n.x - c.x) * 0.3,
            floorOf(c) * VERTICAL.height + 0.12,
            c.z + (n.z - c.z) * 0.3,
          );
          o.scale.set(n.x === c.x ? 0.045 : 0.3, 0.015, n.z === c.z ? 0.045 : 0.3);
          o.updateMatrix();
          mark.current!.setMatrixAt(j++, o.matrix);
        }
    }
    for (const [ref, count] of [
      [ground, i],
      [mark, j],
    ] as const) {
      ref.current!.count = count;
      ref.current!.instanceMatrix.needsUpdate = true;
      ref.current!.computeBoundingSphere();
    }
  }, [buildings]);
  return (
    <>
      <instancedMesh ref={ground} args={[undefined, undefined, 1792]} receiveShadow>
        <boxGeometry />
        <meshStandardMaterial color="#7b8d8a" roughness={0.78} />
      </instancedMesh>
      <instancedMesh ref={mark} args={[undefined, undefined, 8960]}>
        <boxGeometry />
        <meshStandardMaterial color="#dfd7b2" roughness={0.78} />
      </instancedMesh>
    </>
  );
}
export function BuildingField() {
  const photo = useGame((s) => s.photoMode);
  const buildings = useGame((s) => s.game.buildings),
    game = useGame((s) => s.game),
    lang = useGame((s) => s.settings.language),
    stats = analyze(game);
  const groups = useMemo(
    () =>
      INSTANCED_KINDS.map((kind) => ({
        kind,
        buildings: buildings.filter((b) => b.kind === kind && visibleBuilding(b, game)),
      })),
    [buildings, game.vertical],
  );
  return (
    <>
      {groups.map((g) =>
        g.kind === 'road' ? (
          <Roads key={g.kind} buildings={g.buildings} />
        ) : g.buildings.length ? (
          <RepeatedFacility key={g.kind} {...g} />
        ) : null,
      )}
      {buildings
        .filter(
          (b) =>
            visibleBuilding(b, game) &&
            !photo &&
            !game.city.enabled &&
            INSTANCED_KINDS.includes(b.kind) &&
            b.kind !== 'road' &&
            (!stats.connectedIds.has(b.id) || (stats.powerRatios.get(b.id) ?? 0) < 1),
        )
        .map((b) => (
          <Html
            zIndexRange={[3, 0]}
            key={b.id}
            position={[b.origin.x, b.y * VERTICAL.height + 1.2, b.origin.z]}
            center
            distanceFactor={18}
            style={{ pointerEvents: 'none' }}
          >
            <span
              className="connection-badge"
              title={
                lang === 'ko' ? '도로 연결 또는 전력을 확인하세요.' : 'Check road access and power.'
              }
            >
              {stats.connectedIds.has(b.id) ? 'ϟ !' : '⌁ !'}
            </span>
          </Html>
        ))}
    </>
  );
}
