import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Color, Group, InstancedMesh, Object3D } from 'three';
import { useGame } from '../stores/gameStore';
import { analyze } from '../game/analysis';
import { key, floorOf } from '../game/grid';
import { platformMaxHP } from '../game/stability/state';
import { STRUCTURE, VERTICAL } from '../data/rules';
import { Facility, Box } from './Buildings';
import type { Cell, Kind } from '../types/game';
import { visibleAt } from '../game/vertical/geometry';
const stressColor = (r: number) =>
  r < 0.4 ? '#64b5e9' : r < 0.7 ? '#73d6ab' : r < 0.9 ? '#e9d26c' : r <= 1 ? '#efaa55' : '#ed6860';
export function PlatformField() {
  const game = useGame((s) => s.game),
    platforms = useMemo(
      () => game.platforms.filter((p) => visibleAt(p.y, game, p.x, p.z)),
      [game.platforms, game.vertical],
    ),
    base = useRef<InstancedMesh>(null),
    surface = useRef<InstancedMesh>(null),
    supports = useRef<InstancedMesh>(null),
    frames = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new Object3D(),
      color = new Color();
    let supportCount = 0,
      frameCount = 0;
    platforms.forEach((p, i) => {
      o.position.set(p.x, p.y * VERTICAL.height - 0.16, p.z);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      base.current!.setMatrixAt(i, o.matrix);
      base.current!.setColorAt(i, color.set(p.material === 'metal' ? '#7d929d' : '#a2ad8e'));
      o.position.y = p.y * VERTICAL.height + 0.015;
      o.updateMatrix();
      surface.current!.setMatrixAt(i, o.matrix);
      surface.current!.setColorAt(
        i,
        color.set(p.material === 'metal' ? '#acbbc0' : (p.x + p.z) % 2 ? '#86af78' : '#95b881'),
      );
      if (!p.anchor && p.y === 0) {
        o.position.y = p.y * VERTICAL.height - 0.5;
        o.rotation.x = Math.PI;
        o.updateMatrix();
        supports.current!.setMatrixAt(supportCount++, o.matrix);
      }
      if (p.material === 'metal' || p.reinforcement) {
        for (const a of [-Math.PI / 4, Math.PI / 4]) {
          o.position.set(p.x, p.y * VERTICAL.height - 0.12, p.z);
          o.rotation.set(0, a, 0);
          o.updateMatrix();
          frames.current!.setMatrixAt(frameCount++, o.matrix);
        }
      }
    });
    for (const [ref, count] of [
      [base, platforms.length],
      [surface, platforms.length],
      [supports, supportCount],
      [frames, frameCount],
    ] as const) {
      ref.current!.count = count;
      ref.current!.instanceMatrix.needsUpdate = true;
      if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
      ref.current!.computeBoundingSphere();
    }
  }, [platforms]);
  return (
    <>
      <instancedMesh ref={base} args={[undefined, undefined, 1792]} castShadow receiveShadow>
        <boxGeometry args={[0.99, 0.3, 0.99]} />
        <meshStandardMaterial roughness={0.8} wireframe={game.vertical?.view === 'blueprint'} />
      </instancedMesh>
      <instancedMesh ref={surface} args={[undefined, undefined, 1792]} receiveShadow>
        <boxGeometry args={[0.965, 0.055, 0.965]} />
        <meshStandardMaterial roughness={0.85} wireframe={game.vertical?.view === 'blueprint'} />
      </instancedMesh>
      <instancedMesh ref={supports} args={[undefined, undefined, 1792]} castShadow>
        <coneGeometry args={[0.68, 0.75, 4]} />
        <meshStandardMaterial color="#778e88" flatShading />
      </instancedMesh>
      <instancedMesh ref={frames} args={[undefined, undefined, 3584]} castShadow>
        <boxGeometry args={[1.25, 0.12, 0.07]} />
        <meshStandardMaterial color="#dfc18a" metalness={0.65} roughness={0.4} />
      </instancedMesh>
    </>
  );
}
function Debris({
  cell,
  kind,
  start,
  variant,
}: {
  cell: Cell;
  kind: Kind | 'tile';
  start: number;
  variant: number;
}) {
  const group = useRef<Group>(null);
  useFrame(() => {
    if (!group.current) return;
    const g = useGame.getState().game,
      age = Math.max(0, g.elapsed - start);
    group.current.visible = age < STRUCTURE.debrisSeconds;
    group.current.position.set(
      cell.x + ((variant % 3) - 1) * age * 0.12,
      floorOf(cell) * VERTICAL.height - age * age * 2.2,
      cell.z,
    );
    group.current.rotation.set(age * 0.35, age * 0.2, age * (variant % 2 ? -0.25 : 0.25));
  });
  return (
    <group ref={group} position={[cell.x, floorOf(cell) * VERTICAL.height, cell.z]}>
      {kind === 'tile' ? (
        <Box size={[0.95, 0.2, 0.95]} color="#738e8c" />
      ) : (
        <Facility kind={kind} />
      )}
    </group>
  );
}
function DamageSignal({ cell, severity }: { cell: Cell; severity: number }) {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    group.current.rotation.z = Math.sin(t * 13) * severity * 0.06;
    group.current.children.forEach((child, i) => {
      const age = (t * 0.8 + i * 0.43) % 1;
      child.position.set(
        (i ? 1 : -1) * (0.1 + age * 0.25),
        0.18 - age * age * 0.55,
        Math.sin(i * 2 + t) * 0.08,
      );
      child.scale.setScalar((1 - age) * severity);
    });
  });
  return (
    <group position={[cell.x, floorOf(cell) * VERTICAL.height + 0.1, cell.z]}>
      <group ref={group}>
        {[0, 1].map((i) => (
          <mesh key={i}>
            <tetrahedronGeometry args={[0.08]} />
            <meshBasicMaterial color={i ? '#ffc879' : '#6c7777'} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
export function StructuralEffects() {
  const g = useGame((s) => s.game),
    mode = useGame((s) => s.analysisMode),
    selected = useGame((s) => s.selected),
    reduced = useGame((s) => s.settings.reducedMotion);
  const r = analyze(g).structural,
    heat = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!heat.current) return;
    const o = new Object3D(),
      color = new Color();
    const shown = g.platforms.filter((p) => visibleAt(p.y, g, p.x, p.z));
    shown.forEach((p, i) => {
      o.position.set(p.x, p.y * VERTICAL.height + 0.09, p.z);
      o.updateMatrix();
      heat.current!.setMatrixAt(i, o.matrix);
      const node = r.nodes.get(key(p));
      const value =
        mode === 'durability' ? 1 - p.durability / platformMaxHP(p) : (node?.ratio ?? 0);
      heat.current!.setColorAt(
        i,
        color.set(mode === 'durability' ? stressColor(value * 1.5) : stressColor(value)),
      );
    });
    heat.current.count = shown.length;
    heat.current.instanceMatrix.needsUpdate = true;
    if (heat.current.instanceColor) heat.current.instanceColor.needsUpdate = true;
    heat.current.computeBoundingSphere();
  }, [g.platforms, g.vertical, r, mode]);
  const lines = useMemo(() => {
    const positions: number[] = [],
      colors: number[] = [];
    for (const e of r.edges.values()) {
      const a = r.nodes.get(e.a)!.platform,
        b = r.nodes.get(e.b)!.platform,
        c = new Color(e.hp <= 0 ? '#ff3d58' : stressColor(e.ratio));
      if (!visibleAt(a.y, g, a.x, a.z) || !visibleAt(b.y, g, b.x, b.z)) continue;
      positions.push(
        a.x,
        a.y * VERTICAL.height + 0.18,
        a.z,
        b.x,
        b.y * VERTICAL.height + 0.18,
        b.z,
      );
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
  }, [r, g.vertical]);
  const debris = g.structure.events
    .filter((e) => e.kind === 'collapse' && g.elapsed - e.time < STRUCTURE.debrisSeconds)
    .flatMap((e) => [
      ...e.platforms.map((p) => ({
        cell: p,
        kind: 'tile' as const,
        start: e.time,
        id: e.id + '-' + p.id,
      })),
      ...e.buildings.map((b) => ({
        cell: b.origin,
        kind: b.kind,
        start: e.time,
        id: e.id + '-b' + b.id,
      })),
    ])
    .slice(-STRUCTURE.maxDebris);
  const selectedNode = selected?.type === 'platform' ? r.nodes.get(selected.id) : null;
  return (
    <group>
      {!reduced
        ? g.platforms
            .filter((p) => visibleAt(p.y, g, p.x, p.z) && p.durability < platformMaxHP(p) * 0.65)
            .slice(0, 16)
            .map((p) => (
              <DamageSignal
                key={'damage-' + p.id}
                cell={p}
                severity={1 - p.durability / platformMaxHP(p)}
              />
            ))
        : null}
      <instancedMesh
        ref={heat}
        visible={mode === 'load' || mode === 'durability'}
        args={[undefined, undefined, 1792]}
      >
        <boxGeometry args={[0.9, 0.015, 0.9]} />
        <meshBasicMaterial transparent opacity={0.55} depthWrite={false} />
      </instancedMesh>
      {mode === 'connections' ||
      g.vertical?.view === 'structure' ||
      g.vertical?.view === 'blueprint' ? (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[lines.positions, 3]} />
            <bufferAttribute attach="attributes-color" args={[lines.colors, 3]} />
          </bufferGeometry>
          <lineBasicMaterial vertexColors transparent opacity={0.9} depthTest={false} />
        </lineSegments>
      ) : null}
      {g.platforms
        .filter((p) => visibleAt(p.y, g, p.x, p.z) && p.durability < platformMaxHP(p) * 0.65)
        .map((p) => (
          <group key={p.id} position={[p.x, p.y * VERTICAL.height + 0.11, p.z]}>
            <Box size={[0.65, 0.012, 0.025]} rotation={[0, 0.6, 0]} color="#563f42" />
            <Box
              position={[0.1, 0.005, 0.16]}
              size={[0.4, 0.012, 0.025]}
              rotation={[0, -0.7, 0]}
              color="#563f42"
            />
            {p.durability < platformMaxHP(p) * 0.3 ? (
              <mesh position={[0, 0.08, 0]}>
                <octahedronGeometry args={[0.06]} />
                <meshBasicMaterial color="#ffb05b" />
              </mesh>
            ) : null}
          </group>
        ))}
      {mode === 'lift'
        ? r.lifts.map((l) => (
            <group key={l.id} position={[l.cell.x, floorOf(l.cell) * VERTICAL.height, l.cell.z]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
                <ringGeometry args={[1.75, 1.8, 32]} />
                <meshBasicMaterial
                  color={l.powered ? '#72e4f6' : '#efb16c'}
                  transparent
                  opacity={0.65}
                />
              </mesh>
              <Box position={[0, 1.2, 0]} size={[0.045, 1.1, 0.045]} color="#7ce7fb" />
              <mesh position={[0, 1.85, 0]}>
                <coneGeometry args={[0.12, 0.25, 5]} />
                <meshBasicMaterial color="#8ef0ff" />
              </mesh>
              <Html
                zIndexRange={[3, 0]}
                position={[0, 2.1, 0]}
                center
                style={{ pointerEvents: 'none' }}
              >
                <span className="connection-badge">
                  {l.output.toFixed(0)} / {l.maximum.toFixed(0)}t
                </span>
              </Html>
            </group>
          ))
        : null}
      {selectedNode ? (
        <Html
          zIndexRange={[3, 0]}
          position={[
            selectedNode.platform.x,
            selectedNode.platform.y * VERTICAL.height + 1,
            selectedNode.platform.z,
          ]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <span className="connection-badge">
            {selectedNode.key} · {selectedNode.load.toFixed(0)}/{selectedNode.capacity.toFixed(0)}t
            · HP {selectedNode.hp.toFixed(0)}
          </span>
        </Html>
      ) : null}
      {!reduced
        ? debris.map((d, i) => (
            <Debris key={d.id} cell={d.cell} kind={d.kind} start={d.start} variant={i} />
          ))
        : null}
      {g.structure.events
        .filter(
          (e) =>
            (e.kind === 'repair' || e.kind === 'reinforce' || e.kind === 'emergency') &&
            g.elapsed - e.time < 1.5,
        )
        .slice(-4)
        .map((e) => (
          <mesh
            key={e.id}
            position={[e.cell.x, floorOf(e.cell) * VERTICAL.height + 0.15, e.cell.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.45, 0.52, 24]} />
            <meshBasicMaterial color="#b4ffe2" transparent opacity={0.7} />
          </mesh>
        ))}
    </group>
  );
}
