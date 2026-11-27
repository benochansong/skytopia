import { WorldFacility } from './WorldFacilities';
import { WORLD_KINDS } from '../data/rules';
import { DefenseFacility } from './DefenseFacility';
import { DISASTER_KINDS } from '../data/rules';
import { VERTICAL } from '../data/rules';
import { BLOCKS, PHYSICAL } from '../data/rules';
import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import type { Building, Kind } from '../types/game';
import { cellsOf, key, neighbors, floorOf } from '../game/grid';
import { useGame } from '../stores/gameStore';
type Vec = [number, number, number];
export function Box({
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
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.78}
        emissive={emissive}
        emissiveIntensity={emissive ? 1.2 : 0}
      />
    </mesh>
  );
}
export function Tree({ position = [0, 0, 0], scale = 1 }: { position?: Vec; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <Box position={[0, 0.19, 0]} size={[0.09, 0.4, 0.09]} color="#776349" />
      <mesh position={[0, 0.52, 0]} castShadow>
        <icosahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#529a73" flatShading />
      </mesh>
      <mesh position={[0.06, 0.7, 0]} castShadow>
        <icosahedronGeometry args={[0.23, 0]} />
        <meshStandardMaterial color="#78b884" flatShading />
      </mesh>
    </group>
  );
}
export function Reactor({ core = false, output = 1 }: { core?: boolean; output?: number }) {
  const ring = useRef<Group>(null);
  useFrame((_, dt) => {
    const s = useGame.getState();
    if (
      ring.current &&
      !s.settings.reducedMotion &&
      (s.screen === 'playing' || s.screen === 'menu')
    )
      ring.current.rotation.y +=
        dt * 0.5 * output * (s.screen === 'menu' ? 1 : s.game.labPaused ? 0 : s.game.city.speed);
  });
  return (
    <group scale={core ? 1.35 : 0.85}>
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.38, 0.46, 0.24, 8]} />
        <meshStandardMaterial color="#cfddcc" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.55, 0]} castShadow>
        <octahedronGeometry args={[0.29, 0]} />
        <meshStandardMaterial
          color="#a5ffeb"
          emissive="#2bc8d2"
          emissiveIntensity={0.15 + 1.45 * output}
          metalness={0.25}
          roughness={0.2}
        />
      </mesh>
      <group ref={ring} position={[0, 0.6, 0]}>
        <mesh rotation={[Math.PI / 3, 0, 0]}>
          <torusGeometry args={[0.42, 0.035, 6, 32]} />
          <meshStandardMaterial color="#ccb784" metalness={0.65} roughness={0.3} />
        </mesh>
        <mesh rotation={[-Math.PI / 3, 0, 0]}>
          <torusGeometry args={[0.36, 0.024, 6, 32]} />
          <meshStandardMaterial color="#6fe6e8" emissive="#35a5b5" />
        </mesh>
      </group>
      {[0, 1, 2, 3].map((i) => (
        <Box
          key={i}
          position={[Math.sin((i * Math.PI) / 2) * 0.32, 0.3, Math.cos((i * Math.PI) / 2) * 0.32]}
          size={[0.1, 0.5, 0.1]}
          color="#456b76"
        />
      ))}
    </group>
  );
}
export function Facility({ kind, output = 1 }: { kind: Kind; output?: number }) {
  if (WORLD_KINDS.includes(kind)) return <WorldFacility kind={kind} output={output} />;
  if (DISASTER_KINDS.includes(kind)) return <DefenseFacility kind={kind} />;
  if (
    [
      'apartment',
      'housingEstate',
      'advancedPower',
      'aetherPower',
      'relay',
      'powerLink',
      'battery',
      'greenhouse',
      'hydroponics',
      'workshop',
      'manufacturer',
      'refinery',
      'warehouse',
      'logisticsDepot',
      'granary',
      'aetherStore',
      'plaza',
      'clinic',
      'shop',
    ].includes(kind)
  ) {
    const housing = BLOCKS[kind].capacity > 0,
      food = ['greenhouse', 'hydroponics'].includes(kind),
      industry = ['manufacturer', 'refinery', 'workshop'].includes(kind),
      storage = ['warehouse', 'logisticsDepot', 'granary', 'aetherStore', 'battery'].includes(kind),
      power = ['advancedPower', 'aetherPower', 'relay', 'powerLink'].includes(kind),
      h = PHYSICAL[kind].height * 0.68;
    if (kind === 'plaza')
      return (
        <group>
          <Box size={[0.9, 0.08, 0.9]} color="#ddcba6" />
          <mesh position={[0, 0.23, 0]}>
            <cylinderGeometry args={[0.25, 0.32, 0.3, 12]} />
            <meshStandardMaterial color="#78c9cd" />
          </mesh>
        </group>
      );
    return (
      <group>
        <Box
          position={[0, h / 2, 0]}
          size={[0.78, h, 0.72]}
          color={
            housing
              ? '#e3d3b0'
              : food
                ? '#8bb6a0'
                : industry
                  ? '#789797'
                  : storage
                    ? '#c5b18b'
                    : power
                      ? '#557f8b'
                      : kind === 'clinic'
                        ? '#e4e9db'
                        : '#d0a682'
          }
        />
        <Box
          position={[0, h + 0.04, 0]}
          size={[0.86, 0.09, 0.8]}
          color={food ? '#b0e5d3' : power ? '#79d5d0' : kind === 'shop' ? '#cc8a64' : '#617e7a'}
        />
        {housing ? (
          <>
            <Box position={[0, h * 0.38, 0.37]} size={[0.58, 0.1, 0.025]} color="#93bfca" />
            <Box position={[0, h * 0.72, 0.37]} size={[0.58, 0.1, 0.025]} color="#93bfca" />
          </>
        ) : food ? (
          <>
            <Box position={[-0.2, h + 0.12, 0]} size={[0.04, 0.16, 0.75]} color="#e4e6d2" />
            <Box position={[0.2, h + 0.12, 0]} size={[0.04, 0.16, 0.75]} color="#e4e6d2" />
          </>
        ) : industry ? (
          <Box position={[0.22, h + 0.2, -0.18]} size={[0.16, 0.4, 0.16]} color="#6b777a" />
        ) : storage ? (
          <Box position={[0, h * 0.4, 0.37]} size={[0.45, h * 0.65, 0.02]} color="#787d74" />
        ) : power ? (
          <mesh position={[0, h + 0.22, 0]}>
            <octahedronGeometry args={[0.2, 0]} />
            <meshStandardMaterial color="#8bf0e6" />
          </mesh>
        ) : kind === 'clinic' ? (
          <>
            <Box position={[0, h * 0.6, 0.37]} size={[0.4, 0.1, 0.03]} color="#cf6a64" />
            <Box position={[0, h * 0.6, 0.38]} size={[0.1, 0.4, 0.03]} color="#cf6a64" />
          </>
        ) : null}
      </group>
    );
  }
  if (kind === 'largeHome')
    return (
      <group>
        <group scale={[0.95, 1.4, 0.95]}>
          <Facility kind="home" />
        </group>
        <Box position={[0, 0.5, 0.33]} size={[0.76, 0.08, 0.09]} color="#b09b73" />
        <Box position={[0, 0.85, 0.33]} size={[0.76, 0.08, 0.09]} color="#b09b73" />
      </group>
    );
  if (kind === 'factory')
    return (
      <group>
        <Box position={[0, 0.35, 0]} size={[0.83, 0.7, 0.78]} color="#ad8d79" />
        <Box position={[0, 0.73, 0]} size={[0.9, 0.08, 0.85]} color="#5c7079" />
        {[-0.23, 0.23].map((x) => (
          <group key={x}>
            <Box position={[x, 1, -0.18]} size={[0.16, 0.6, 0.16]} color="#73848c" />
            <Box
              position={[x, 0.38, 0.4]}
              size={[0.18, 0.25, 0.02]}
              color="#f1be74"
              emissive="#9b6829"
            />
          </group>
        ))}
        <Box position={[0, 0.15, 0.43]} size={[0.3, 0.28, 0.04]} color="#536773" />
      </group>
    );
  if (kind === 'liftSmall' || kind === 'liftLarge')
    return (
      <group>
        <Reactor output={output} />
        <mesh position={[0, -0.3, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[kind === 'liftLarge' ? 0.4 : 0.28, 0.8, 8]} />
          <meshStandardMaterial
            color="#69d9f5"
            emissive="#35bde2"
            emissiveIntensity={output * 1.5}
            transparent
            opacity={0.15 + output * 0.4}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42, 0.04, 6, 20]} />
          <meshStandardMaterial
            color={kind === 'liftLarge' ? '#b5a7df' : '#84bbc8'}
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>
      </group>
    );
  if (kind === 'ballast')
    return (
      <group>
        <Box position={[0, 0.24, 0]} size={[0.7, 0.48, 0.7]} color="#73778a" />
        <Box position={[0, 0.51, 0]} size={[0.75, 0.06, 0.75]} color="#b1a69b" />
        {[-0.29, 0.29].map((x) => (
          <Box key={x} position={[x, 0.24, 0.36]} size={[0.055, 0.5, 0.03]} color="#ceb88c" />
        ))}
      </group>
    );
  if (kind === 'home')
    return (
      <group>
        <Box position={[0, 0.31, 0]} size={[0.67, 0.6, 0.62]} color="#f1e4c6" />
        <Box position={[0, 0.05, 0]} size={[0.78, 0.1, 0.74]} color="#a3a994" />
        <mesh position={[0, 0.73, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[0.55, 0.4, 4]} />
          <meshStandardMaterial color="#547e8a" flatShading />
        </mesh>
        <Box position={[-0.21, 0.77, -0.15]} size={[0.1, 0.31, 0.12]} color="#e2d5b6" />
        {[-0.2, 0.2].map((x) => (
          <Box
            key={x}
            position={[x, 0.38, 0.316]}
            size={[0.13, 0.19, 0.018]}
            color="#ffe6a0"
            emissive="#c99048"
          />
        ))}
        <Box position={[0, 0.19, 0.32]} size={[0.13, 0.3, 0.02]} color="#796c56" />
        <Box
          position={[0.339, 0.38, 0]}
          size={[0.015, 0.17, 0.18]}
          color="#ffdb8c"
          emissive="#b98e52"
        />
        <Box position={[0, 0.07, 0.4]} size={[0.3, 0.08, 0.2]} color="#d6d7bd" />
        <Tree position={[-0.35, 0, -0.3]} scale={0.45} />
      </group>
    );
  if (kind === 'power') return <Reactor />;
  if (kind === 'farm')
    return (
      <group>
        <Box position={[0, 0.04, 0]} size={[0.86, 0.08, 0.86]} color="#8a7852" />
        {[-0.28, 0, 0.28].map((x) => (
          <group key={x}>
            {[-0.28, -0.07, 0.14, 0.34].map((z) => (
              <mesh key={z} position={[x, 0.14, z]} castShadow>
                <coneGeometry args={[0.075, 0.2, 5]} />
                <meshStandardMaterial color="#b2cb58" />
              </mesh>
            ))}
          </group>
        ))}
        <Box
          position={[0, 0.4, -0.25]}
          size={[0.75, 0.06, 0.35]}
          color="#a7d8c9"
          rotation={[0.25, 0, 0]}
        />
        {[-0.33, 0.33].map((x) => (
          <Box key={x} position={[x, 0.23, -0.28]} size={[0.035, 0.4, 0.035]} color="#e2dac2" />
        ))}
      </group>
    );
  if (kind === 'park')
    return (
      <group>
        <Box position={[0, 0.02, 0]} size={[0.9, 0.04, 0.9]} color="#99bf78" />
        <Tree position={[-0.2, 0, -0.1]} scale={0.95} />
        <Tree position={[0.24, 0, -0.25]} scale={0.65} />
        <Box position={[0.2, 0.16, 0.25]} size={[0.4, 0.06, 0.17]} color="#b48b60" />
        <Box position={[0.2, 0.27, 0.32]} size={[0.4, 0.18, 0.04]} color="#b48b60" />
        {[0.08, 0.33].map((x) => (
          <Box key={x} position={[x, 0.08, 0.25]} size={[0.04, 0.16, 0.1]} color="#526b61" />
        ))}
        <Box position={[-0.07, 0.04, 0.3]} size={[0.13, 0.025, 0.5]} color="#dedabd" />
      </group>
    );
  return null;
}
export const BuildingModel = memo(function BuildingModel({
  building: b,
  connected,
  powered,
  roads,
  output = 1,
}: {
  building: Building;
  connected: boolean;
  powered: boolean;
  roads: Set<string>;
  output?: number;
}) {
  const language = useGame((s) => s.settings.language),
    cityEnabled = useGame((s) => s.game.city.enabled);
  const photo = useGame((s) => s.photoMode);
  const cells = cellsOf(b, b.origin);
  return (
    <group>
      {cells.map((c) => (
        <group key={key(c)} position={[c.x, floorOf(c) * VERTICAL.height + 0.08, c.z]}>
          {b.kind === 'road' ? (
            <group>
              <Box position={[0, 0.015, 0]} size={[0.92, 0.035, 0.92]} color="#7b8d8a" />
              <Box position={[0, 0.035, 0]} size={[0.12, 0.015, 0.12]} color="#e0d6ae" />
              {neighbors(c).map((n, i) =>
                roads.has(key(n)) ? (
                  <Box
                    key={i}
                    position={[(n.x - c.x) * 0.3, 0.04, (n.z - c.z) * 0.3]}
                    size={[n.x === c.x ? 0.045 : 0.3, 0.015, n.z === c.z ? 0.045 : 0.3]}
                    color="#dfd7b2"
                  />
                ) : null,
              )}
            </group>
          ) : (
            <group
              rotation={[0, (-b.rotation * Math.PI) / 2, 0]}
              scale={[1, 1 + 0.15 * (b.level ?? 0), 1]}
            >
              <Facility kind={b.kind} output={output} />
            </group>
          )}
        </group>
      ))}
      {!photo && !cityEnabled && (!connected || !powered) && b.kind !== 'road' ? (
        <Html
          zIndexRange={[3, 0]}
          position={[b.origin.x, b.y * VERTICAL.height + 1.2, b.origin.z]}
          center
          distanceFactor={18}
          style={{ pointerEvents: 'none' }}
        >
          <span
            className="connection-badge"
            title={
              !connected
                ? language === 'ko'
                  ? '도로 연결 필요'
                  : 'Road connection needed'
                : language === 'ko'
                  ? '전력 부족'
                  : 'Insufficient power'
            }
          >
            {!connected ? '⌁ !' : 'ϟ !'}
          </span>
        </Html>
      ) : null}
    </group>
  );
});
