import { GhostFacility } from './GhostFacility';
import { PRIMARY_KINDS } from './PrimaryFacilities';
import { PhotoCapture } from './PhotoCapture';
import { Foundation, Scenery, SkyDome } from './Environment';
import { QUALITY } from './art';
import { STRUCTURE } from '../data/rules';
import { WorldShips } from './WorldFacilities';
import { DisasterEffects } from './DisasterEffects';
import { DayLight, LivingCity } from './LivingCity';
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Group, MOUSE, Vector3 } from 'three';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { useGame } from '../stores/gameStore';
import { analyze } from '../game/analysis';
import { cellsOf, key, floorOf } from '../game/grid';
import { validatePlacement } from '../game/placement';
import { BLOCKS, VERTICAL, PHYSICAL, RULES } from '../data/rules';
import { useOnline } from '../multiplayer/client';
import { Box, BuildingModel, Reactor, Tree } from './Buildings';
import { BuildingField, INSTANCED_KINDS } from './BuildingField';
import { PerformanceProbe } from './PerformanceProbe';
import { PlatformField, StructuralEffects } from './StructuralEffects';
import { visibleBuilding } from '../game/vertical/geometry';
import { VerticalStructures } from './VerticalStructures';
import { VERTICAL_KINDS } from '../data/rules';
import { operatingNetwork } from '../game/city/operations';
function Camera() {
  const sensitivity = useGame((s) => s.settings.cameraSensitivity),
    zoom = useGame((s) => s.settings.zoomSensitivity);
  const activeCity = useGame((s) => s.game.world?.active);
  const cinematic = useGame(
    (s) =>
      s.screen === 'opening' ||
      (!!s.game.campaign && (!!s.game.campaign.dialogue || s.screen === 'victory')),
  );
  const controls = useRef<OrbitImpl>(null);
  const { camera } = useThree();
  const mode = useGame((s) => s.cameraMode),
    reset = useGame((s) => s.cameraReset);
  const focus = useGame((s) => s.cameraFocus);
  const vertical = useGame((s) => s.game.vertical);
  const screen = useGame((s) => s.screen),
    reduced = useGame((s) => s.settings.reducedMotion);
  useEffect(() => {
    camera.position.set(
      ...((mode === 'top'
        ? [0, 24, 0.01]
        : mode === 'front'
          ? [0, 4, 24]
          : mode === 'side'
            ? [24, 4, 0]
            : mode === 'below'
              ? [10, -12, 15]
              : [11.5, 12, 15]) as [number, number, number]),
    );
    controls.current?.target.set(-0.5, -0.3, -0.5);
    if (focus) {
      camera.position.add(new Vector3(focus.x, floorOf(focus) * VERTICAL.height, focus.z));
      controls.current?.target.set(focus.x, floorOf(focus) * VERTICAL.height, focus.z);
    }
    const g = useGame.getState().game;
    const saved = g.world?.cities.find((c) => c.id === activeCity)?.camera;
    if (saved && mode === 'free' && !focus) {
      camera.position.set(...saved.position);
      controls.current?.target.set(...saved.target);
    }
    controls.current?.update();
  }, [camera, mode, reset, focus, activeCity]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      rotateSpeed={sensitivity}
      zoomSpeed={zoom}
      minDistance={9}
      maxDistance={48}
      maxPolarAngle={vertical ? Math.PI * 0.92 : Math.PI * 0.38}
      minPolarAngle={0.03}
      screenSpacePanning={false}
      mouseButtons={{ LEFT: undefined, RIGHT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN }}
      enableRotate={mode === 'free' || mode === 'floor'}
      autoRotate={(screen === 'menu' || cinematic) && !reduced}
      autoRotateSpeed={0.2}
      onEnd={() => {
        const state = useGame.getState(),
          w = state.game.world;
        if (!w || !controls.current) return;
        const snapshot = {
          position: camera.position.toArray() as [number, number, number],
          target: controls.current.target.toArray() as [number, number, number],
        };
        useGame.setState({
          game: {
            ...state.game,
            world: {
              ...w,
              cities: w.cities.map((c) => (c.id === w.active ? { ...c, camera: snapshot } : c)),
            },
          },
        });
      }}
      onChange={() => {
        if (!controls.current) return;
        const c = controls.current;
        c.target.x = Math.max(RULES.min, Math.min(RULES.max, c.target.x));
        c.target.z = Math.max(RULES.min, Math.min(RULES.max, c.target.z));
        c.target.y = Math.max(vertical ? -6 : -0.3, Math.min(vertical ? 12 : 0.3, c.target.y));
        useGame.setState({ azimuth: c.getAzimuthalAngle() });
      }}
    />
  );
}
function Ghost() {
  const resources = useGame((s) => s.game.resources),
    city = useGame((s) => s.game.city);
  const active = useGame((s) => s.game.active),
    cursor = useGame((s) => s.game.cursor);
  const platforms = useGame((s) => s.game.platforms),
    buildings = useGame((s) => s.game.buildings);
  const structure = useGame((s) => s.game.structure),
    reserved = useGame((s) => s.game.reservedActive);
  const falling = useRef<Group>(null);
  const validity = useMemo(
    () => validatePlacement(useGame.getState().game),
    [active, cursor, platforms, buildings, structure, reserved, resources, city],
  );
  useFrame((_, dt) => {
    if (falling.current) {
      const s = useGame.getState();
      const target =
        floorOf(s.game.cursor) * VERTICAL.height +
        (s.game.mode !== 'mission' || s.game.reservedActive
          ? 2.1
          : 0.3 + (s.game.remaining / 20) * 3.5);
      falling.current.position.y += (target - falling.current.position.y) * Math.min(1, dt * 10);
    }
  });
  const color =
    !validity.valid || validity.risk === 3
      ? '#f17670'
      : validity.risk === 2
        ? '#ff9d50'
        : validity.warning
          ? '#f5ca77'
          : '#80f1c2';
  return (
    <group>
      {validity.cells.map((c) => (
        <group key={key(c)} position={[c.x, floorOf(c) * VERTICAL.height + 0.11, c.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.9, 0.9]} />
            <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} />
          </mesh>
          <Box position={[0, 0.02, 0]} size={[0.12, 0.025, 0.12]} color={color} />
        </group>
      ))}
      <group ref={falling} position={[cursor.x, 3.8, cursor.z]}>
        {cellsOf(active).map((c) => (
          <group key={key(c)} position={[c.x, floorOf(c) * VERTICAL.height, c.z]}>
            {PRIMARY_KINDS.includes(active.kind) ? (
              <group
                position={[0, -PHYSICAL[active.kind].height / 2, 0]}
                rotation={[0, (-active.rotation * Math.PI) / 2, 0]}
              >
                <GhostFacility kind={active.kind} color={color} />
              </group>
            ) : (
              <mesh>
                <boxGeometry
                  args={[
                    0.81,
                    active.kind === 'platform' ? 0.12 : PHYSICAL[active.kind].height,
                    0.81,
                  ]}
                />
                <meshStandardMaterial
                  color={BLOCKS[active.kind].color}
                  transparent
                  opacity={0.5}
                  roughness={0.3}
                  metalness={0.1}
                  depthWrite={false}
                />
              </mesh>
            )}
            <mesh>
              <boxGeometry
                args={[
                  0.84,
                  active.kind === 'platform' ? 0.15 : PHYSICAL[active.kind].height + 0.03,
                  0.84,
                ]}
              />
              <meshBasicMaterial color={color} wireframe transparent opacity={0.65} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
function PlacementEffect() {
  const serial = useGame((s) => s.placementSerial),
    pos = useGame((s) => s.lastPlaced);
  const wave = useRef<Group>(null),
    age = useRef(2);
  useEffect(() => {
    age.current = 0;
  }, [serial]);
  useFrame((_, dt) => {
    age.current += dt;
    if (wave.current) {
      wave.current.visible =
        age.current < 0.8 && serial > 0 && !useGame.getState().settings.reducedMotion;
      wave.current.scale.setScalar(0.3 + age.current * 1.8);
      wave.current.position.y = 0.1 + age.current * 0.5;
    }
  });
  return (
    <group position={[pos.x, floorOf(pos) * VERTICAL.height, pos.z]}>
      <group ref={wave}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.49, 32]} />
          <meshBasicMaterial color="#b1ffde" transparent opacity={0.6} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[Math.sin(i * 1.57) * 0.4, i * 0.1, Math.cos(i * 1.57) * 0.4]}>
            <octahedronGeometry args={[0.035]} />
            <meshBasicMaterial color="#d2ffe6" />
          </mesh>
        ))}
      </group>
    </group>
  );
}
function City() {
  const photo = useGame((s) => s.photoMode);
  const canBuild = useOnline(
    (s) => !s.enabled || (!!s.room?.hand && s.viewing < 0 && s.room.phase === 'playing'),
  );
  const vertical = useGame((s) => s.game.vertical);
  const floorY = (vertical?.floor ?? 0) * VERTICAL.height;
  const platforms = useGame((s) => s.game.platforms),
    buildings = useGame((s) => s.game.buildings);
  const screen = useGame((s) => s.screen),
    balance = useGame((s) => s.balanceVisible);
  const structure = useGame((s) => s.game.structure),
    difficulty = useGame((s) => s.game.difficulty),
    analysisMode = useGame((s) => s.analysisMode);
  const city = useGame((s) => s.game.city),
    population = useGame((s) => s.game.population);
  const disaster = useGame((s) => s.game.disaster);
  const worldContext = useGame((s) => s.game.worldContext);
  const root = useRef<Group>(null);
  const lastAim = useRef<{ x: number; y: number } | null>(null);
  const fallAge = useRef(0);
  const stats = useMemo(
    () =>
      analyze({
        platforms,
        buildings,
        structure,
        difficulty,
        city,
        population,
        disaster,
        worldContext,
      }),
    [platforms, buildings, structure, difficulty, city, population, disaster, worldContext],
  );
  const balanceDirection = useMemo(
    () =>
      new Vector3(
        stats.center.x - stats.structural.centerLift.x,
        0,
        stats.center.z - stats.structural.centerLift.z,
      ).normalize(),
    [stats.center.x, stats.center.z, stats.structural.centerLift.x, stats.structural.centerLift.z],
  );
  const operations = city.enabled ? operatingNetwork(useGame.getState().game).operations : null;
  const allRoads = useMemo(
    () =>
      new Set(
        buildings.filter((b) => b.kind === 'road').flatMap((b) => cellsOf(b, b.origin).map(key)),
      ),
    [buildings],
  );
  const playing =
    !photo &&
    screen !== 'menu' &&
    screen !== 'about' &&
    !(screen === 'settings' && useGame.getState().returnScreen === 'menu');
  useFrame((_, dt) => {
    if (!root.current) return;
    const multiplier = Math.PI / 180;
    const blend = useGame.getState().settings.reducedMotion ? 1 : Math.min(dt * 3, 1);
    root.current.rotation.z +=
      (-stats.structural.tilt.z * multiplier - root.current.rotation.z) * blend;
    root.current.rotation.x +=
      (-stats.structural.tilt.x * multiplier - root.current.rotation.x) * blend;
    if (structure.loss && !useGame.getState().settings.reducedMotion) {
      fallAge.current += dt;
      root.current.position.y = -Math.min(40, fallAge.current * fallAge.current * 0.7);
    } else {
      fallAge.current = 0;
      const current = useGame.getState();
      root.current.position.y =
        !current.settings.reducedMotion && current.game.disaster?.phase === 'active'
          ? Math.sin(current.game.elapsed * 6) * current.settings.cameraShake * 0.06
          : 0;
    }
  });
  function aim(e: ThreeEvent<PointerEvent | MouseEvent>, place = false) {
    if (!root.current || useGame.getState().screen !== 'playing') return;
    e.stopPropagation();
    // Some browsers replay pointermove before click while camera damping continues.
    // A stationary pointer must not silently move the preview to a different tile.
    if (!place) {
      if (lastAim.current?.x === e.clientX && lastAim.current?.y === e.clientY) return;
      lastAim.current = { x: e.clientX, y: e.clientY };
    }
    const p = root.current.worldToLocal(e.point.clone());
    const c = { x: Math.round(p.x), z: Math.round(p.z), y: vertical?.floor ?? 0 };
    // Commit the visible preview even while camera damping / island tilt is moving.
    if (place) useGame.getState().place(useGame.getState().toolMode === 'inspect' ? c : undefined);
    else useGame.getState().aim(c);
  }
  return (
    <group ref={root}>
      <Foundation />
      <PlatformField />
      <group position={[0, 0.08, 0]}>
        <Reactor
          core
          output={Math.max(0, Math.min(1, structure.coreDurability / STRUCTURE.coreHP))}
        />
      </group>
      <BuildingField />
      <LivingCity />
      <VerticalStructures />
      <DisasterEffects />
      {buildings
        .filter(
          (b) =>
            !INSTANCED_KINDS.includes(b.kind) &&
            !VERTICAL_KINDS.includes(b.kind) &&
            visibleBuilding(b, useGame.getState().game),
        )
        .map((b) => (
          <BuildingModel
            key={b.id}
            building={b}
            connected={stats.connectedIds.has(b.id)}
            powered={(stats.powerRatios.get(b.id) ?? 0) >= 1}
            output={
              b.enabled
                ? (stats.structural.lifts.find((l) => l.id === b.id)?.factor ??
                  (operations
                    ? (operations.get(b.id)?.efficiency ?? 0)
                    : Math.min(1, b.durability / PHYSICAL[b.kind].hp)))
                : 0
            }
            roads={allRoads}
          />
        ))}
      {[
        [-3.3, -2.9],
        [2.45, 1.6],
        [-2.4, 2.45],
        [2.5, -2.7],
        [-3.35, 0.6],
      ]
        .filter(([x, z]) =>
          platforms.some((p) => p.y === 0 && Math.abs(p.x - x) < 0.6 && Math.abs(p.z - z) < 0.6),
        )
        .map(([x, z], i) => (
          <Tree key={i} position={[x, 0.03, z]} scale={0.6 + (i % 2) * 0.3} />
        ))}
      {playing ? (
        <>
          <mesh
            position={[-0.5, floorY + 0.07, -0.5]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerMove={(e) => aim(e)}
            onClick={(e) => {
              if (e.button === 0 && e.delta < 4) aim(e, true);
            }}
          >
            <planeGeometry args={[16, 16]} />
            <meshBasicMaterial visible={false} />
          </mesh>
          <gridHelper
            args={[16, 16, '#d5d9bc', '#bed0bc']}
            position={[-0.5, floorY + 0.075, -0.5]}
            material-transparent
            material-opacity={0.18}
          />
          {canBuild && <Ghost />}
          <PlacementEffect />
          <StructuralEffects />
          {balance || analysisMode === 'center' ? (
            <group>
              {Math.hypot(stats.center.x, stats.center.z) > 0.05 ? (
                <arrowHelper
                  args={[
                    balanceDirection,
                    new Vector3(stats.structural.centerLift.x, 0.2, stats.structural.centerLift.z),
                    stats.structural.separation,
                    0xe4c18b,
                    0.15,
                    0.1,
                  ]}
                />
              ) : null}
              <mesh
                position={[stats.center.x, (stats.center.y ?? 0) + 0.2, stats.center.z]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry args={[0.13, 0.19, 24]} />
                <meshBasicMaterial color="#ffcd79" depthTest={false} />
              </mesh>
              <mesh
                position={[
                  stats.structural.centerLift.x,
                  stats.structural.centerLift.y + 0.19,
                  stats.structural.centerLift.z,
                ]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry args={[0.47, 0.49, 32]} />
                <meshBasicMaterial color="#9fffee" depthTest={false} />
              </mesh>
            </group>
          ) : null}
        </>
      ) : null}
    </group>
  );
}
export default function World() {
  const quality = useGame((s) => s.settings.quality);
  const shadows = useGame((s) => s.settings.shadows),
    environment = useGame((s) => s.settings.environment);
  return (
    <div
      className="world"
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={(e) => {
        if (e.buttons === 2) useGame.getState().tutorialEvent('orbit');
      }}
      onWheel={() => useGame.getState().tutorialEvent('zoom')}
    >
      <Canvas
        shadows={shadows && QUALITY[quality].shadow > 0}
        dpr={[1, QUALITY[quality].dpr]}
        camera={{ position: [11.5, 12, 15], fov: 38, near: 0.1, far: 150 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ scene }) => {
          scene.userData.name = 'Skytopia';
        }}
      >
        <DayLight />
        <SkyDome />
        {import.meta.env.DEV && import.meta.env.MODE === 'test' ? <PerformanceProbe /> : null}
        {environment && <Scenery />}
        <City />
        <WorldShips />
        <Camera />
        <PhotoCapture />
      </Canvas>
      <div className="sky-vignette" />
    </div>
  );
}
