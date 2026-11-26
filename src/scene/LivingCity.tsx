import { useMemo, useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, Object3D, Group } from 'three';
import { useGame } from '../stores/gameStore';
import { cityReport } from '../game/city/report';
import { cityRoutes } from '../game/city/routes';
import { facility } from '../data/cityRules';
import { cellsOf } from '../game/grid';
export function DayLight() {
  const g = useGame((s) => s.game),
    settings = useGame((s) => s.settings),
    day = settings.dayNight ? Math.max(0, Math.sin((g.city.dayTime / 360) * Math.PI * 2)) : 1,
    color = new Color('#263c66').lerp(new Color('#add2e2'), day);
  return (
    <>
      <color attach="background" args={[color]} />
      <fog attach="fog" args={[color, 24, 65]} />
      <hemisphereLight args={['#c4e8ff', '#7f927d', 0.75 + day * 0.95]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[-8, 16, 8]}
        intensity={0.45 + day * 2.05}
        color={day > 0.3 ? '#fff0d2' : '#afc9f5'}
        castShadow={settings.shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-normalBias={0.04}
      />
    </>
  );
}
export function LivingCity() {
  const g = useGame((s) => s.game),
    settings = useGame((s) => s.settings),
    mode = useGame((s) => s.analysisMode),
    citizens = useRef<InstancedMesh>(null),
    vehicles = useRef<InstancedMesh>(null),
    lights = useRef<InstancedMesh>(null),
    warnings = useRef<InstancedMesh>(null),
    smoke = useRef<InstancedMesh>(null),
    markers = useRef<InstancedMesh>(null),
    airship = useRef<Group>(null);
  const routes = useMemo(() => cityRoutes(g), [g.buildings, g.platforms, g.structure.edges]);
  const r = g.city.enabled ? cityReport(g) : null;
  const linePoints = useMemo(() => {
    if (!r) return new Float32Array();
    const edges = mode === 'power' ? r.powerGrid.edges : mode === 'logistics' ? r.roads.edges : [];
    return new Float32Array(edges.flatMap(([a, b]) => [a.x, 0.22, a.z, b.x, 0.22, b.z]));
  }, [r, mode]);
  useFrame(() => {
    if (!g.city.enabled) return;
    const o = new Object3D(),
      time = g.elapsed;
    for (const [mesh, paths, max, speed, scale] of [
      [
        citizens,
        routes.routes,
        Math.min(settings.citizens, Math.floor(g.population / 2)),
        0.35,
        [0.075, 0.18, 0.075],
      ],
      [vehicles, routes.freight, settings.vehicles, 0.5, [0.2, 0.12, 0.12]],
    ] as const) {
      if (!mesh.current) continue;
      const active =
          mesh === vehicles
            ? (r?.foodProduction ?? 0) + (r?.materialsProduction ?? 0) > 0
            : g.city.happiness > 20,
        count = settings.reducedMotion ? 0 : active ? Math.min(max, paths.length) : 0;
      mesh.current.count = count;
      for (let i = 0; i < count; i++) {
        const path = paths[i],
          cycle = (time * speed + i * 0.73) % (2 * (path.length - 1)),
          t = cycle <= path.length - 1 ? cycle : 2 * (path.length - 1) - cycle,
          index = Math.min(path.length - 2, Math.floor(t)),
          a = path[index],
          b = path[index + 1],
          f = t - index;
        o.position.set(a.x + (b.x - a.x) * f + 0.14, 0.2, a.z + (b.z - a.z) * f + 0.14);
        o.scale.set(scale[0], scale[1], scale[2]);
        o.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        o.updateMatrix();
        mesh.current.setMatrixAt(i, o.matrix);
      }
      mesh.current.instanceMatrix.needsUpdate = true;
    }
    if (smoke.current) {
      let count = 0;
      for (const b of g.buildings
        .filter((b) => ['factory', 'workshop', 'manufacturer', 'refinery'].includes(b.kind))
        .slice(0, 16)) {
        const efficiency = r?.operations.get(b.id)?.efficiency ?? 0;
        if (efficiency <= 0.05 || settings.reducedMotion) continue;
        const age = (time * 0.4 + b.id * 0.17) % 1;
        o.position.set(
          b.origin.x + 0.22 + age * 0.15,
          facility(b).height + 0.2 + age * 0.8,
          b.origin.z - 0.18,
        );
        o.scale.setScalar((0.05 + age * 0.12) * efficiency);
        o.rotation.set(0, 0, 0);
        o.updateMatrix();
        smoke.current.setMatrixAt(count++, o.matrix);
      }
      smoke.current.count = count;
      smoke.current.instanceMatrix.needsUpdate = true;
    }
    if (airship.current)
      airship.current.position.set(Math.sin(time * 0.01) * 14, 5, Math.cos(time * 0.01) * 14);
  });
  useLayoutEffect(() => {
    if (!lights.current || !markers.current || !warnings.current || !r) return;
    const o = new Object3D(),
      color = new Color(),
      night = settings.dayNight && g.city.dayTime > 180;
    let count = 0,
      marks = 0,
      warningCount = 0;
    for (const b of g.buildings) {
      const op = r.operations.get(b.id)!;
      if (
        b.kind !== 'road' &&
        ['power', 'road', 'workers', 'input', 'damage', 'paused'].includes(op.status)
      ) {
        o.position.set(b.origin.x, facility(b).height + 0.35, b.origin.z);
        o.scale.setScalar(0.12);
        o.rotation.set(0, 0, 0);
        o.updateMatrix();
        warnings.current.setMatrixAt(warningCount, o.matrix);
        warnings.current.setColorAt(
          warningCount++,
          color.set(
            op.status === 'paused' ? '#8b9f9f' : op.status === 'power' ? '#ffe085' : '#f28d77',
          ),
        );
      }
      if (
        night &&
        b.enabled &&
        op.status !== 'power' &&
        op.road &&
        (facility(b).capacity || facility(b).power)
      ) {
        for (const c of cellsOf(b, b.origin)) {
          o.position.set(c.x, facility(b).height * 0.45, c.z + 0.375);
          o.scale.set(0.5, 0.08, 0.025);
          o.rotation.set(0, 0, 0);
          o.updateMatrix();
          lights.current.setMatrixAt(count++, o.matrix);
        }
      }
      if (
        ['food', 'happiness', 'economy', 'logistics', 'power'].includes(mode) &&
        b.kind !== 'road'
      ) {
        const value =
          mode === 'happiness'
            ? (r.environment.get(b.id) ?? 0) / 25
            : mode === 'food'
              ? op.food
                ? 1
                : op.road && (r.poolStocks.get(op.road)?.food ?? 0) > 0
                  ? 0.5
                  : 0
              : mode === 'economy'
                ? op.efficiency
                : mode === 'power'
                  ? op.demand
                    ? op.power / op.demand
                    : op.power > 0
                      ? 1
                      : 0.5
                  : op.road
                    ? 1
                    : 0;
        for (const c of cellsOf(b, b.origin)) {
          o.position.set(c.x, 0.13, c.z);
          o.scale.set(0.92, 0.025, 0.92);
          o.updateMatrix();
          markers.current.setMatrixAt(marks, o.matrix);
          markers.current.setColorAt(
            marks++,
            color.set(value > 0.7 ? '#70dfb4' : value > 0.2 ? '#ecc46d' : '#ef6c70'),
          );
        }
      }
    }
    warnings.current.count = warningCount;
    warnings.current.instanceMatrix.needsUpdate = true;
    if (warnings.current.instanceColor) warnings.current.instanceColor.needsUpdate = true;
    lights.current.count = count;
    lights.current.instanceMatrix.needsUpdate = true;
    markers.current.count = marks;
    markers.current.instanceMatrix.needsUpdate = true;
    if (markers.current.instanceColor) markers.current.instanceColor.needsUpdate = true;
  }, [g.buildings, g.city.dayTime, settings.dayNight, mode, r]);
  if (!g.city.enabled) return null;
  return (
    <>
      <instancedMesh ref={warnings} args={[undefined, undefined, 256]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={smoke} args={[undefined, undefined, 16]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#acb6bb" transparent opacity={0.45} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={citizens} args={[undefined, undefined, 48]} frustumCulled={false}>
        <boxGeometry />
        <meshStandardMaterial color="#f2cc96" />
      </instancedMesh>
      <instancedMesh ref={vehicles} args={[undefined, undefined, 16]} frustumCulled={false}>
        <boxGeometry />
        <meshStandardMaterial color="#72bad1" />
      </instancedMesh>
      <instancedMesh ref={lights} args={[undefined, undefined, 256]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial color="#ffd68c" />
      </instancedMesh>
      <instancedMesh ref={markers} args={[undefined, undefined, 256]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial transparent opacity={0.7} depthTest={false} />
      </instancedMesh>
      {linePoints.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[linePoints, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={mode === 'power' ? '#ffe89b' : '#66e2dc'} depthTest={false} />
        </lineSegments>
      )}
      {settings.environment && (
        <group ref={airship}>
          <mesh scale={[1.6, 0.5, 0.5]}>
            <sphereGeometry args={[0.55, 12, 8]} />
            <meshStandardMaterial color="#e5d9b4" />
          </mesh>
          <mesh position={[0, -0.4, 0]}>
            <boxGeometry args={[0.5, 0.18, 0.25]} />
            <meshStandardMaterial color="#698b8c" />
          </mesh>
        </group>
      )}
    </>
  );
}
