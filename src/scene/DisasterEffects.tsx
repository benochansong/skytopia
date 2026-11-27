import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, Object3D } from 'three';
import { useGame } from '../stores/gameStore';
import { PHYSICAL, PROTECTION } from '../data/rules';
import { defenseReady, weatherLoads, aetherFactor } from '../game/disasters/effects';
import { visibleAt } from '../game/vertical/geometry';
import { operatingNetwork } from '../game/city/operations';
import { key } from '../game/grid';
import { targetInfo } from '../game/repair/maintenance';
export function DisasterEffects() {
  const photo = useGame((s) => s.photoMode);
  const g = useGame((s) => s.game),
    settings = useGame((s) => s.settings),
    rain = useRef<InstancedMesh>(null),
    dummy = useMemo(() => new Object3D(), []),
    d = g.disaster;
  useFrame(() => {
    if (!rain.current || !d) return;
    const count = Math.floor(settings.stormParticles * d.weather.rain),
      t = settings.reducedMotion ? 0 : g.elapsed;
    rain.current.count = count;
    for (let i = 0; i < count; i++) {
      const x = ((i * 7.31 + t * d.weather.wind * 0.03) % 24) - 12,
        z = ((i * 3.77) % 24) - 12,
        y = 14 - ((i * 0.71 + t * 7) % 18);
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, -d.weather.wind * 0.004);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      rain.current.setMatrixAt(i, dummy.matrix);
    }
    rain.current.instanceMatrix.needsUpdate = true;
  });
  const lines = useMemo(() => {
    if (!d || photo) return new Float32Array();
    const values: number[] = [];
    if (d.view === 'wind' || d.view === 'risk') {
      const loads = weatherLoads(g),
        angle = (d.weather.direction * Math.PI) / 180;
      for (const b of g.buildings) {
        const f = loads.forces.get(b.id) ?? 0;
        if (f < 0.05 || !visibleAt(b.y, g, b.origin.x, b.origin.z)) continue;
        const y = b.y * 3 + PHYSICAL[b.kind].height + 0.3,
          len = Math.min(2, 0.2 + f * 0.1);
        values.push(
          b.origin.x,
          y,
          b.origin.z,
          b.origin.x + Math.sin(angle) * len,
          y,
          b.origin.z + Math.cos(angle) * len,
        );
      }
    }
    if (d.view === 'evacuation') {
      const net = operatingNetwork(g),
        groups = new Set(
          g.buildings
            .filter((b) => b.kind === 'shelter' && defenseReady(g, b))
            .map((b) => net.road.attachments.get(b.id)),
        );
      const cells = new Set(
        [...groups].flatMap((group) => (group ? [...(net.road.groups.get(group) ?? [])] : [])),
      );
      for (const [a, b] of net.road.edges)
        if (cells.has(key(a)) && cells.has(key(b)))
          values.push(a.x, (a.y ?? 0) * 3 + 0.35, a.z, b.x, (b.y ?? 0) * 3 + 0.35, b.z);
    }
    return new Float32Array(values);
  }, [g, d, photo]);
  if (!d) return null;
  return (
    <group raycast={() => {}}>
      <instancedMesh
        ref={rain}
        args={[undefined, undefined, 200]}
        frustumCulled={false}
        raycast={() => {}}
      >
        <boxGeometry args={[0.012, 0.3, 0.012]} />
        <meshBasicMaterial color="#b3d9ed" transparent opacity={0.45} />
      </instancedMesh>
      {lines.length > 0 && (
        <lineSegments raycast={() => {}}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[lines, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={d.view === 'evacuation' ? '#91e6bf' : '#efba77'} />
        </lineSegments>
      )}
      {g.buildings
        .filter(
          (b) =>
            ['shieldSmall', 'shieldLarge'].includes(b.kind) &&
            defenseReady(g, b) &&
            (d.shields[b.id] ?? 0) > 0 &&
            visibleAt(b.y, g, b.origin.x, b.origin.z),
        )
        .map((b) => (
          <mesh
            key={'shield' + b.id}
            position={[b.origin.x, b.y * 3 + 0.3, b.origin.z]}
            scale={[1, 1.5, 1]}
            raycast={() => {}}
          >
            <sphereGeometry args={[PROTECTION[b.kind]!.radius, 20, 12]} />
            <meshBasicMaterial
              color="#83cfe9"
              transparent
              opacity={d.view === 'shield' ? 0.12 : d.phase === 'active' ? 0.045 : 0.018}
              wireframe={d.view === 'shield'}
              depthWrite={false}
            />
          </mesh>
        ))}
      {!photo &&
        d.view === 'shield' &&
        g.buildings
          .filter(
            (b) =>
              ['lightningRod', 'lightningTower', 'stabilizer', 'climateControl'].includes(b.kind) &&
              defenseReady(g, b) &&
              visibleAt(b.y, g, b.origin.x, b.origin.z),
          )
          .map((b) => (
            <mesh
              key={'range' + b.id}
              position={[b.origin.x, b.y * 3 + 0.12, b.origin.z]}
              rotation={[-Math.PI / 2, 0, 0]}
              raycast={() => {}}
            >
              <ringGeometry
                args={[PROTECTION[b.kind]!.radius - 0.06, PROTECTION[b.kind]!.radius, 40]}
              />
              <meshBasicMaterial
                color={
                  b.kind === 'stabilizer'
                    ? '#bd9fea'
                    : b.kind === 'climateControl'
                      ? '#95cfa5'
                      : '#e6d292'
                }
                transparent
                opacity={0.65}
                depthWrite={false}
              />
            </mesh>
          ))}
      {d.threat?.impacts
        .filter((e) => !d.applied.includes(e.id) && e.kind === 'meteor')
        .slice(0, 4)
        .map((e) => {
          const before =
              d.phase === 'forecast' ? d.threat!.warning - d.clock + e.at : e.at - d.clock,
            progress = Math.max(0, Math.min(1, 1 - before / 8));
          return (
            <group key={e.id}>
              <mesh
                position={[e.cell.x, (e.cell.y ?? 0) * 3 + 0.2, e.cell.z]}
                visible={!photo}
                rotation={[-Math.PI / 2, 0, 0]}
                raycast={() => {}}
              >
                <ringGeometry args={[Math.max(0.25, e.radius - 0.08), e.radius + 0.08, 32]} />
                <meshBasicMaterial color="#f1ac7f" transparent opacity={0.8} depthWrite={false} />
              </mesh>
              {progress > 0 && (
                <group
                  position={[
                    e.cell.x + 8 * (1 - progress),
                    (e.cell.y ?? 0) * 3 + 18 * (1 - progress) + 0.4,
                    e.cell.z - 4 * (1 - progress),
                  ]}
                >
                  <mesh>
                    <icosahedronGeometry args={[0.25, 0]} />
                    <meshStandardMaterial
                      color="#e9a66c"
                      emissive="#d75d3d"
                      emissiveIntensity={1}
                    />
                  </mesh>
                  <mesh position={[0.5, 1, -0.25]} rotation={[0, 0, -0.45]}>
                    <coneGeometry args={[0.18, 2, 7]} />
                    <meshBasicMaterial color="#f2d6a0" transparent opacity={0.4} />
                  </mesh>
                </group>
              )}
            </group>
          );
        })}
      {d.effects.map((e) => (
        <group
          key={e.id}
          position={[e.cell.x, (e.cell.y ?? 0) * 3 + 0.5, e.cell.z]}
          raycast={() => {}}
        >
          {e.kind === 'lightning' ? (
            <mesh position={[0, 4, 0]}>
              <cylinderGeometry args={[0.035, 0.07, 8, 5]} />
              <meshBasicMaterial
                color={settings.reducedFlashes ? '#abb4d5' : '#edf3ff'}
                transparent
                opacity={settings.reducedFlashes ? 0.25 : Math.max(0.1, 1 - e.age / 2.5)}
              />
            </mesh>
          ) : (
            <mesh rotation={[-Math.PI / 2, 0, 0]} scale={1 + e.age}>
              <ringGeometry args={[0.4, 0.48, 24]} />
              <meshBasicMaterial
                color={e.kind === 'shield' ? '#8ae0e8' : '#e6b384'}
                transparent
                opacity={Math.max(0, 0.7 - e.age * 0.25)}
              />
            </mesh>
          )}
        </group>
      ))}
      {!photo &&
        ['damage', 'recovery', 'aether'].includes(d.view) &&
        g.buildings
          .filter((b) =>
            d.view === 'aether'
              ? aetherFactor(g, b) < 0.99
              : b.durability < PHYSICAL[b.kind].hp * 0.95,
          )
          .slice(0, 100)
          .map((b) => (
            <mesh
              key={'risk' + b.id}
              position={[b.origin.x, b.y * 3 + PHYSICAL[b.kind].height + 0.25, b.origin.z]}
              raycast={() => {}}
            >
              <octahedronGeometry args={[0.13 * settings.warningScale, 0]} />
              <meshBasicMaterial color={d.view === 'aether' ? '#bb9fe5' : '#eb9c76'} />
            </mesh>
          ))}
      {g.structure.repairs.slice(0, 3).map((job, i) => {
        const target = targetInfo(g, job.target);
        return target ? (
          <group
            key={job.target.type + job.target.id}
            position={[
              target.cell.x + 0.4 * Math.sin(g.elapsed + i),
              (target.cell.y ?? 0) * 3 + 1.4,
              target.cell.z,
            ]}
            raycast={() => {}}
          >
            <mesh>
              <boxGeometry args={[0.24, 0.1, 0.24]} />
              <meshStandardMaterial color="#a5d8c9" emissive="#458e8f" emissiveIntensity={0.3} />
            </mesh>
            <mesh position={[0, -0.25, 0]}>
              <coneGeometry args={[0.14, 0.4, 8]} />
              <meshBasicMaterial color="#9ae3bd" transparent opacity={0.25} />
            </mesh>
          </group>
        ) : null;
      })}
    </group>
  );
}
