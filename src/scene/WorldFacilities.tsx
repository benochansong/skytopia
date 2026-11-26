import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Kind } from '../types/game';
import type { ShipType } from '../types/world';
import { useGame } from '../stores/gameStore';
import { portRanks } from '../game/world/definitions';
import { Box } from './Buildings';
export function WorldFacility({ kind, output }: { kind: Kind; output: number }) {
  const rings = useRef<Group>(null),
    port = portRanks[kind] ?? 0;
  useFrame((_, dt) => {
    if (
      rings.current &&
      output > 0 &&
      !useGame.getState().settings.reducedMotion &&
      useGame.getState().screen === 'playing'
    )
      rings.current.rotation.y += dt * 0.25;
  });
  if (kind === 'nexus' || kind === 'distributedLiftCore')
    return (
      <group>
        <Box position={[0, 0.2, 0]} size={[0.85, 0.4, 0.85]} color="#485b70" />
        <mesh
          position={[0, kind === 'nexus' ? 1.7 : 0.8, 0]}
          scale={kind === 'nexus' ? [0.4, 1.35, 0.4] : [0.28, 0.5, 0.28]}
        >
          <octahedronGeometry />
          <meshStandardMaterial
            color="#a4f4ed"
            emissive="#53c5d5"
            emissiveIntensity={output * 0.8}
          />
        </mesh>
        <group ref={rings} position={[0, kind === 'nexus' ? 1.7 : 0.8, 0]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} rotation={[0.6 + i * 0.7, 0, 0.3 * i]}>
              <torusGeometry args={[kind === 'nexus' ? 0.65 : 0.42, 0.035, 6, 28]} />
              <meshStandardMaterial
                color={i % 2 ? '#dbc492' : '#8abed4'}
                metalness={0.5}
                roughness={0.35}
              />
            </mesh>
          ))}
        </group>
        {kind === 'nexus' &&
          [-1, 1].map((x) => (
            <Box key={x} position={[x * 0.35, 0.8, 0]} size={[0.12, 1.6, 0.16]} color="#b3c3bf" />
          ))}
      </group>
    );
  if (port)
    return (
      <group>
        <Box position={[0, 0.12, 0]} size={[0.95, 0.24, 0.95]} color="#a8bcb8" />
        <Box
          position={[0.2, 0.42, 0.15]}
          size={[0.42, 0.5, 0.55]}
          color={kind === 'explorationPort' ? '#a9b9d8' : '#86a6ac'}
        />
        <Box position={[-0.3, 0.75, 0.2]} size={[0.1, 1.3, 0.1]} color="#d6c590" />
        <Box position={[-0.1, 1.3, 0.05]} size={[0.65, 0.08, 0.1]} color="#dfd5b2" />
        <Box position={[0, 0.25, -0.35]} size={[0.8, 0.035, 0.22]} color="#d8d3ad" />
        {Array.from({ length: port }, (_, i) => (
          <mesh key={i} position={[-0.25 + i * 0.25, 0.29, -0.35]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.06, 0.075, 16]} />
            <meshStandardMaterial
              color="#f1ebc2"
              emissive="#77b9b8"
              emissiveIntensity={output * 0.8}
            />
          </mesh>
        ))}
      </group>
    );
  const lab = ['researchLab', 'artifactAnalysis', 'worldObservatory'].includes(kind),
    industrial = [
      'metalRefinery',
      'advancedAetherRefinery',
      'shipyard',
      'shipMaintenance',
    ].includes(kind);
  return (
    <group>
      <Box position={[0, 0.15, 0]} size={[0.9, 0.3, 0.9]} color="#708e98" />
      <Box
        position={[0, 0.5, 0.1]}
        size={[0.72, 0.65, 0.62]}
        color={lab ? '#a5b8d0' : industrial ? '#b2a78b' : '#a7c5bb'}
      />
      {lab ? (
        <mesh position={[0, 1, 0]}>
          <sphereGeometry args={[0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#80d8df" metalness={0.25} roughness={0.3} />
        </mesh>
      ) : (
        <Box position={[0.24, 0.95, 0.2]} size={[0.18, 0.65, 0.18]} color="#4c6876" />
      )}
      <Box
        position={[0, 0.5, -0.23]}
        size={[0.5, 0.12, 0.03]}
        color="#a5e7e4"
        emissive={output > 0.1 ? '#498b9e' : undefined}
      />
      {kind === 'skybridgeAnchor' && (
        <Box position={[0, 1.1, 0]} size={[0.12, 1.8, 0.12]} color="#d4bd88" />
      )}
    </group>
  );
}
function Airship({ type }: { type: ShipType }) {
  const cargo = type === 'heavyCargo' || type === 'lightCargo',
    large = type === 'heavyCargo',
    color =
      type === 'rescue'
        ? '#eaa58e'
        : type === 'research'
          ? '#baa6dd'
          : type === 'colony'
            ? '#a9ccac'
            : '#d5c9a5';
  return (
    <group scale={large ? 1.15 : 0.75}>
      <mesh scale={[cargo ? 0.5 : 0.35, 0.35, type === 'scout' ? 0.65 : 0.9]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color={color} roughness={0.65} />
      </mesh>
      <Box position={[0, -0.35, 0]} size={[cargo ? 0.6 : 0.3, 0.2, 0.6]} color="#4c687b" />
      {cargo &&
        [-0.22, 0.22].map((x) => (
          <Box key={x} position={[x, -0.53, 0]} size={[0.2, 0.2, 0.5]} color="#ad9475" />
        ))}
      {type === 'rescue' && (
        <>
          <Box position={[0, 0.35, 0]} size={[0.12, 0.02, 0.4]} color="#f4eee0" />
          <Box position={[0, 0.35, 0]} size={[0.35, 0.02, 0.1]} color="#f4eee0" />
        </>
      )}
      {type === 'research' && (
        <mesh position={[0, 0.5, 0]}>
          <octahedronGeometry args={[0.15]} />
          <meshStandardMaterial color="#b5f1ec" emissive="#68b5cb" />
        </mesh>
      )}
      {type === 'explorer' && (
        <Box position={[0, -0.6, 0]} size={[0.07, 0.4, 0.07]} color="#d3c6a1" />
      )}
      {type === 'colony' && (
        <Box position={[0, -0.5, 0.1]} size={[0.45, 0.3, 0.45]} color="#e5d9b4" />
      )}
      {[-1, 1].map((x) => (
        <Box key={x} position={[x * 0.4, 0, 0.55]} size={[0.5, 0.04, 0.3]} color="#637f8b" />
      ))}
    </group>
  );
}
export function WorldShips() {
  const w = useGame((s) => s.game.world),
    buildings = useGame((s) => s.game.buildings);
  if (!w) return null;
  const port = buildings.find((b) => portRanks[b.kind]);
  if (!port) return null;
  const ships = w.ships
    .filter(
      (s) =>
        (s.location === w.active && !s.trip) ||
        (s.trip && (s.trip.from === w.active || s.trip.to === w.active)),
    )
    .slice(0, 8);
  return (
    <group>
      {ships.map((s, i) => {
        const t = s.trip,
          departing = t?.from === w.active;
        const progress = t ? Math.min(1, t.progress / Math.max(1, t.distance)) : 0;
        const local = t
          ? departing
            ? t.returning
              ? 1 - progress
              : progress
            : t.returning
              ? progress
              : 1 - progress
          : 0;
        if (t && local > 0.18 && !['loading', 'departing', 'unloading'].includes(s.state))
          return null;
        return (
          <group
            key={s.id}
            position={[
              port.origin.x + 1 + i * 0.25,
              port.y * 3 + 1.7 + local * 10,
              port.origin.z - 1.5 - local * 35 - i * 0.6,
            ]}
          >
            <Airship type={s.type} />
          </group>
        );
      })}
    </group>
  );
}
