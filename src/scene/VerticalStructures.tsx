import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Quaternion, Vector3 } from 'three';
import { useGame } from '../stores/gameStore';
import { BLOCKS, VERTICAL, VERTICAL_KINDS } from '../data/rules';
import { endpoints, isLink, role, visibleBuilding, segments } from '../game/vertical/geometry';
import { floorOf, cellsOf } from '../game/grid';
import { analyze } from '../game/analysis';
import type { Building } from '../types/game';
import { Box, Facility, Tree } from './Buildings';
type Point = [number, number, number];
function Bar({
  a,
  b,
  width = 0.1,
  color = '#b5c1ba',
  wire = false,
}: {
  a: Point;
  b: Point;
  width?: number;
  color?: string;
  wire?: boolean;
}) {
  const from = new Vector3(...a),
    to = new Vector3(...b),
    delta = to.clone().sub(from),
    q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.clone().normalize());
  return (
    <mesh position={from.add(to).multiplyScalar(0.5)} quaternion={q} castShadow>
      <boxGeometry args={[width, delta.length(), width]} />
      <meshStandardMaterial color={color} metalness={0.5} roughness={0.45} wireframe={wire} />
    </mesh>
  );
}
function Member({ b, powered, wire }: { b: Building; powered: boolean; wire: boolean }) {
  const cab = useRef<Group>(null),
    [a, c] = endpoints(b, b.origin),
    start: Point = [a.x, floorOf(a) * VERTICAL.height + 0.1, a.z],
    end: Point = [c.x, floorOf(c) * VERTICAL.height + 0.1, c.z],
    r = role(b),
    color =
      b.durability < 60 ? '#ef8170' : (b.temporary ?? 0) > 0 ? '#9effba' : BLOCKS[b.kind].color;
  useFrame(() => {
    if (cab.current) {
      const s = useGame.getState();
      const t = powered && !s.settings.reducedMotion ? (Math.sin(s.game.elapsed * 0.7) + 1) / 2 : 0;
      cab.current.position.set(start[0], start[1] + 0.3 + (end[1] - start[1] - 0.7) * t, start[2]);
    }
  });
  if (b.shape === 'columnPair')
    return (
      <>
        {segments(b, b.origin).map(([origin], i) => (
          <Member key={i} b={{ ...b, origin, shape: 'single' }} powered={powered} wire={wire} />
        ))}
      </>
    );
  if (b.shape === 'arch') {
    const points = cellsOf(b, b.origin).map(
      (c) => [c.x, floorOf(c) * VERTICAL.height + 0.1, c.z] as Point,
    );
    return (
      <>
        {points.slice(1).map((p, i) => (
          <Bar key={i} a={points[i]} b={p} color={color} wire={wire} />
        ))}
      </>
    );
  }
  if (r === 'bridge') {
    const dx = end[0] - start[0],
      dz = end[2] - start[2],
      len = Math.hypot(dx, dz),
      angle = -Math.atan2(dz, dx);
    return (
      <group position={start} rotation={[0, angle, 0]}>
        <Box position={[len / 2, 0, 0]} size={[len, 0.16, 0.8]} color={color} />
        {[-0.38, 0.38].map((z) => (
          <group key={z}>
            <Bar a={[0, 0.55, z]} b={[len, 0.55, z]} color={color} wire={wire} />
            {[0, 1, 2, 3].map((x) => (
              <Bar key={x} a={[x, 0, z]} b={[x, 0.55, z]} width={0.06} />
            ))}
            {['archBridge', 'suspensionBridge', 'reinforcedBridge'].includes(b.kind) &&
              [0, 1, 2].map((x) => (
                <Bar key={x} a={[x, 0.55, z]} b={[x + 1, x === 1 ? 1.1 : 0.55, z]} color={color} />
              ))}
          </group>
        ))}
      </group>
    );
  }
  if (b.kind === 'stairs')
    return (
      <group position={start}>
        {Array.from({ length: 16 }, (_, i) => (
          <group
            key={i}
            rotation={[0, (i * Math.PI) / 8, 0]}
            position={[0, (i * (end[1] - start[1])) / 16, 0]}
          >
            <Box position={[0.19, 0, 0]} size={[0.45, 0.08, 0.2]} color={color} />
            <Box position={[0.4, 0.2, 0]} size={[0.03, 0.4, 0.03]} color="#e3d8ad" />
          </group>
        ))}
        <Bar a={[0, 0, 0]} b={[0, end[1] - start[1], 0]} width={0.08} />
      </group>
    );
  if (r === 'transport')
    return (
      <group>
        {[-0.3, 0.3].map((x) => (
          <Bar
            key={x}
            a={[start[0] + x, start[1], start[2]]}
            b={[end[0] + x, end[1], end[2]]}
            width={0.065}
            color={color}
            wire={wire}
          />
        ))}
        <group ref={cab}>
          <Box size={[0.5, 0.55, 0.5]} color={powered ? '#b9ebdf' : '#797b7f'} />
          <Box position={[0, 0, 0.26]} size={[0.35, 0.3, 0.02]} color="#516f80" />
        </group>
      </group>
    );
  return (
    <group>
      <Bar
        a={start}
        b={end}
        width={
          r === 'hanger' ? 0.08 : r === 'power' ? 0.07 : b.kind === 'industrialColumn' ? 0.38 : 0.2
        }
        color={color}
        wire={wire}
      />
      {['truss', 'reinforcedColumn', 'industrialColumn'].includes(b.kind) &&
        [-0.19, 0.19].map((offset) => (
          <Bar
            key={offset}
            a={[start[0] + offset, start[1], start[2]]}
            b={[end[0] - offset, end[1], end[2]]}
            width={0.06}
            color="#e4c48e"
            wire={wire}
          />
        ))}
      {[start, end].map((p, i) => (
        <Box key={i} position={p} size={[0.45, 0.12, 0.45]} color={color} />
      ))}
    </group>
  );
}
export function VerticalStructures() {
  const g = useGame((s) => s.game),
    stats = analyze(g);
  return (
    <>
      {g.buildings
        .filter((b) => VERTICAL_KINDS.includes(b.kind) && visibleBuilding(b, g))
        .map((b) => (
          <group
            key={b.id}
            onClick={(e) => {
              if (useGame.getState().toolMode === 'inspect') {
                e.stopPropagation();
                useGame.getState().selectTarget({ type: 'building', id: String(b.id) });
              }
            }}
          >
            {isLink(b) ? (
              <Member
                b={b}
                powered={(stats.powerRatios.get(b.id) ?? 0) >= 1}
                wire={g.vertical?.view === 'blueprint'}
              />
            ) : (
              <group position={[b.origin.x, b.y * VERTICAL.height + 0.08, b.origin.z]}>
                {b.kind === 'skyGarden' ? (
                  <>
                    <Box size={[0.92, 0.16, 0.92]} color="#c9c4aa" />
                    <Tree position={[0, 0.08, 0]} scale={1.2} />
                  </>
                ) : b.kind === 'towerHome' ? (
                  <>
                    <Box position={[0, 2.4, 0]} size={[0.78, 4.8, 0.78]} color="#dbcead" />
                    {Array.from({ length: 8 }, (_, i) => (
                      <Box
                        key={i}
                        position={[0, 0.4 + i * 0.55, 0.4]}
                        size={[0.55, 0.23, 0.03]}
                        color="#6eacb7"
                      />
                    ))}
                    <Box position={[0, 4.83, 0]} size={[0.9, 0.12, 0.9]} color="#698f91" />
                  </>
                ) : b.kind === 'observatory' ? (
                  <>
                    <Box position={[0, 0.35, 0]} size={[0.8, 0.7, 0.8]} color="#d5c8af" />
                    <mesh position={[0, 0.8, 0]}>
                      <sphereGeometry args={[0.43, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                      <meshStandardMaterial color="#80a9b5" metalness={0.5} roughness={0.4} />
                    </mesh>
                  </>
                ) : (
                  <Facility kind={b.kind} />
                )}
              </group>
            )}
          </group>
        ))}
    </>
  );
}
