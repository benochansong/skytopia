import { KINDS, VERTICAL } from '../data/rules';
import { useLayoutEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { BufferGeometry, Group, InstancedMesh, Material, Matrix4, Mesh, Object3D } from 'three';
import { Facility } from './Buildings';
import { useGame } from '../stores/gameStore';
import { cellsOf, key, neighbors, floorOf } from '../game/grid';
import { analyze } from '../game/analysis';
import type { Building, Kind } from '../types/game';
import { visibleBuilding } from '../game/vertical/geometry';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { operatingNetwork } from '../game/city/operations';
import { BLOCKS } from '../data/rules';
import { useVisual } from '../stores/visualStore';
import { photoDay } from './art';
import { useFacilityAsset } from './assets';
import { LowFacility, PRIMARY_KINDS } from './PrimaryFacilities';
import { useFrame } from '@react-three/fiber';
import { FacilityDetails } from './FacilityDetails';
export const INSTANCED_KINDS: Kind[] = [
  ...KINDS.filter(
    (k) =>
      ![
        'platform',
        'metalPlatform',
        'brace',
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
type Part = {
  geometry: BufferGeometry;
  material: Material | Material[];
  matrix: Matrix4;
  castShadow: boolean;
  receiveShadow: boolean;
};
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
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, 1792]}
      dispose={null}
      castShadow={part.castShadow}
      receiveShadow={part.receiveShadow}
    />
  );
}
function RepeatedFacility({
  kind,
  buildings,
  output,
  simple,
}: {
  kind: Kind;
  buildings: Building[];
  output: number;
  simple: boolean;
}) {
  const model = useFacilityAsset(kind);
  const template = useRef<Group>(null),
    [parts, setParts] = useState<Part[]>([]);
  useLayoutEffect(() => {
    const root = template.current!;
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert(),
      out: Part[] = [];
    const buckets = new Map<
      string,
      {
        material: Material;
        geometries: BufferGeometry[];
        castShadow: boolean;
        receiveShadow: boolean;
      }
    >();
    root.traverse((child) => {
      if (!(child instanceof Mesh) || Array.isArray(child.material)) return;
      const signature =
        `${child.castShadow}:${child.receiveShadow}:` +
        JSON.stringify(child.material.toJSON(), (key, value) =>
          ['uuid', 'metadata'].includes(key) ? undefined : value,
        );
      const bucket: {
        material: Material;
        geometries: BufferGeometry[];
        castShadow: boolean;
        receiveShadow: boolean;
      } = buckets.get(signature) ?? {
        material: child.material,
        geometries: [],
        castShadow: child.castShadow,
        receiveShadow: child.receiveShadow,
      };
      const geometry = child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone();
      geometry.applyMatrix4(new Matrix4().multiplyMatrices(inverse, child.matrixWorld));
      bucket.geometries.push(geometry);
      buckets.set(signature, bucket);
    });
    for (const bucket of buckets.values()) {
      const merged = mergeGeometries(bucket.geometries, false);
      if (merged)
        out.push({
          geometry: merged,
          material: bucket.material,
          matrix: new Matrix4(),
          castShadow: bucket.castShadow,
          receiveShadow: bucket.receiveShadow,
        });
      bucket.geometries.forEach((geometry) => geometry.dispose());
    }
    setParts(out);
    return () => out.forEach((part) => part.geometry.dispose());
  }, [kind, output, model, simple]);
  return (
    <>
      <group ref={template} visible={false}>
        {simple && PRIMARY_KINDS.includes(kind) ? (
          <LowFacility kind={kind} />
        ) : model ? (
          <primitive object={model} dispose={null} />
        ) : (
          <Facility kind={kind} output={output} />
        )}
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
  const quality = useGame((s) => s.settings.quality),
    selected = useGame((s) => s.selected);
  const [far, setFar] = useState(false),
    lastLod = useRef(0);
  useFrame(({ camera, clock }) => {
    if (clock.elapsedTime - lastLod.current > 0.5) {
      lastLod.current = clock.elapsedTime;
      const next = camera.position.length() > 38;
      setFar((current) => (current === next ? current : next));
    }
  });
  const photo = useGame((s) => s.photoMode);
  const preset = useVisual((s) => s.preset),
    dayNight = useGame((s) => s.settings.dayNight);
  const buildings = useGame((s) => s.game.buildings),
    game = useGame((s) => s.game),
    lang = useGame((s) => s.settings.language),
    stats = analyze(game);
  const operations = game.city.enabled ? operatingNetwork(game).operations : null;
  const time = photo ? (photoDay(preset) ?? game.city.dayTime) : game.city.dayTime;
  const night = ((photo && preset !== 'live') || dayNight) && time > 180;
  const groups = INSTANCED_KINDS.flatMap((kind) =>
    (kind === 'road' ? [0] : [0, 1]).map((output) => ({
      kind,
      output,
      buildings: buildings.filter((b) => {
        if (b.kind !== kind || !visibleBuilding(b, game)) return false;
        if (kind === 'road') return true;
        const active =
          b.enabled &&
          (b.kind === 'liftSmall' || b.kind === 'liftLarge'
            ? (stats.structural.lifts.find((l) => l.id === b.id)?.factor ?? 0) > 0
            : operations
              ? (operations.get(b.id)?.efficiency ?? 0) > 0
              : b.durability > 0 && (stats.powerRatios.get(b.id) ?? 1) > 0);
        const lit =
          active &&
          (BLOCKS[kind].capacity === 0 ||
            (night && (!game.city.enabled || (game.city.residents[b.id] ?? 0) > 0)));
        return Number(lit) === output;
      }),
    })),
  );
  return (
    <>
      {groups.map((g) =>
        g.kind === 'road' ? (
          <Roads key={`${g.kind}-${g.output}`} buildings={g.buildings} />
        ) : g.buildings.length ? (
          <RepeatedFacility
            key={`${g.kind}-${g.output}`}
            {...g}
            simple={!selected && (quality === 'low' || far)}
          />
        ) : null,
      )}
      <FacilityDetails />
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
