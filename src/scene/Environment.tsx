import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, Group, InstancedMesh, Object3D } from 'three';
import { useGame } from '../stores/gameStore';
import { useVisual } from '../stores/visualStore';
import { ART, QUALITY, REGION_ART, photoDay } from './art';
import { CHAPTERS, stage } from '../game/campaign/definitions';
import { key } from '../game/grid';

export function environmentLook(
  g: ReturnType<typeof useGame.getState>['game'],
  settings: ReturnType<typeof useGame.getState>['settings'],
  preset: Parameters<typeof photoDay>[0] = 'live',
) {
  const override = photoDay(preset),
    time = override ?? (settings.dayNight ? g.city.dayTime : 90);
  const day = Math.max(0, Math.sin((time / 360) * Math.PI * 2));
  const region = REGION_ART[g.worldContext?.region ?? 'firstSky'];
  const sky = g.campaign
    ? (CHAPTERS[stage(g.campaign.stage).chapter - 1].sky ?? region.sky)
    : region.sky;
  const clouds = preset === 'live' ? (g.disaster?.weather.clouds ?? 0) : 0;
  const dusk = (time > 120 && time < 190) || time < 40;
  const zenith = new Color(ART.night).lerp(new Color(sky), day);
  const horizon = new Color('#344a73').lerp(
    new Color(dusk ? '#f0c3a0' : '#b6dced'),
    Math.max(day, dusk ? 0.65 : 0),
  );
  zenith.lerp(new Color('#667b91'), clouds * 0.55);
  horizon.lerp(new Color('#8b9da9'), clouds * 0.65);
  return { day, time, clouds, zenith, horizon, region, dusk };
}

export function SkyDome() {
  const g = useGame((s) => s.game),
    settings = useGame((s) => s.settings),
    photo = useGame((s) => s.photoMode),
    preset = useVisual((s) => s.preset);
  const look = environmentLook(g, settings, photo ? preset : 'live');
  const uniforms = useMemo(
    () => ({ topColor: { value: new Color() }, bottomColor: { value: new Color() } }),
    [],
  );
  uniforms.topColor.value.copy(look.zenith);
  uniforms.bottomColor.value.copy(look.horizon);
  const stars = useMemo(
    () =>
      new Float32Array(
        Array.from({ length: 240 }, (_, i) => {
          const a = i * 2.399,
            y = 12 + ((i * 17) % 40),
            r = Math.sqrt(75 * 75 - y * y);
          return [Math.sin(a) * r, y, Math.cos(a) * r];
        }).flat(),
      ),
    [],
  );
  if (photo && preset === 'blueprint') return null;
  return (
    <>
      <mesh renderOrder={-10}>
        <sphereGeometry args={[90, 24, 12]} />
        <shaderMaterial
          side={BackSide}
          depthWrite={false}
          uniforms={uniforms}
          vertexShader="varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}"
          fragmentShader={`uniform vec3 topColor;uniform vec3 bottomColor;varying vec3 vPosition;
          void main(){float h=smoothstep(-0.8,0.65,normalize(vPosition).y);gl_FragColor=vec4(mix(bottomColor,topColor,h),1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`}
        />
      </mesh>
      {look.day < 0.15 && (
        <>
          <points>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[stars, 3]} />
            </bufferGeometry>
            <pointsMaterial
              color="#d3e9ff"
              size={0.16}
              sizeAttenuation
              transparent
              opacity={1 - look.day * 5}
              depthWrite={false}
            />
          </points>
          <mesh position={[-35, 36, -40]}>
            <sphereGeometry args={[1.5, 12, 8]} />
            <meshBasicMaterial color="#e7e9ce" />
          </mesh>
        </>
      )}
    </>
  );
}

export function Foundation() {
  const platforms = useGame((s) => s.game.platforms),
    region = useGame((s) => s.game.worldContext?.region ?? 'firstSky'),
    quality = useGame((s) => s.settings.quality);
  const rocks = useRef<InstancedMesh>(null),
    veins = useRef<InstancedMesh>(null),
    waterfall = useRef<Group>(null);
  const ground = useMemo(
    () => platforms.filter((p) => p.y === 0 && p.material !== 'metal'),
    [platforms],
  );
  const edges = useMemo(() => {
    const set = new Set(ground.map(key));
    return ground.filter((p) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([x, z]) => !set.has(key({ x: p.x + x, z: p.z + z }))),
    );
  }, [ground]);
  useLayoutEffect(() => {
    const o = new Object3D();
    let j = 0;
    ground.forEach((p, i) => {
      const depth = p.anchor
        ? 1.3 +
          Math.max(0, 2.3 - Math.hypot(p.x + 0.5, p.z + 0.5) * 0.5) +
          Math.abs(Math.sin(p.x * 7 + p.z * 13)) * 0.4
        : 0.65;
      o.position.set(p.x, -0.35 - depth, p.z);
      o.scale.set(0.65, depth, 0.65);
      o.rotation.set(0, i * 1.7, 0.12);
      o.updateMatrix();
      rocks.current!.setMatrixAt(i, o.matrix);
      if (i % 4 === 0 && QUALITY[quality].detail > 0) {
        o.position.y -= 0.3;
        o.scale.set(0.1, depth * 0.7, 0.12);
        o.updateMatrix();
        veins.current!.setMatrixAt(j++, o.matrix);
      }
    });
    for (const [ref, count] of [
      [rocks, ground.length],
      [veins, j],
    ] as const) {
      ref.current!.count = count;
      ref.current!.instanceMatrix.needsUpdate = true;
      ref.current!.computeBoundingSphere();
    }
  }, [ground, quality]);
  useFrame(({ clock }) => {
    if (waterfall.current && !useGame.getState().settings.reducedMotion)
      waterfall.current.scale.x = 1 + Math.sin(clock.elapsedTime * 1.5) * 0.06;
  });
  const water = edges.find((p) => p.anchor && p.z > 0);
  return (
    <>
      <instancedMesh ref={rocks} args={[undefined, undefined, 1792]} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={REGION_ART[region].rock} roughness={0.95} flatShading />
      </instancedMesh>
      <instancedMesh ref={veins} args={[undefined, undefined, 1792]}>
        <octahedronGeometry />
        <meshStandardMaterial
          color={ART.aether}
          emissive={ART.aether}
          emissiveIntensity={0.5}
          roughness={0.4}
        />
      </instancedMesh>
      {water && QUALITY[quality].detail > 0 && (
        <group ref={waterfall} position={[water.x, -2.4, water.z + 0.4]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[(i - 1) * 0.11, -i * 0.1, 0]}>
              <planeGeometry args={[0.1, 4.5 - i * 0.3]} />
              <meshBasicMaterial
                color={i === 1 ? '#e6ffff' : '#7fdbed'}
                transparent
                opacity={0.35}
                depthWrite={false}
                side={2}
              />
            </mesh>
          ))}
        </group>
      )}
    </>
  );
}

export function Scenery() {
  const settings = useGame((s) => s.settings),
    photo = useGame((s) => s.photoMode),
    density = useVisual((s) => s.clouds);
  const ref = useRef<InstancedMesh>(null),
    count = Math.round(
      QUALITY[settings.quality].clouds * (photo ? density : settings.cloudDensity),
    );
  useLayoutEffect(() => {
    const o = new Object3D();
    for (let i = 0; i < count * 4; i++) {
      const group = Math.floor(i / 4),
        part = i % 4,
        a = group * 2.399;
      o.position.set(
        Math.sin(a) * (18 + (group % 3) * 5) + part * 1.2,
        -5 + (group % 3) * 3.5 + Math.sin(part) * 0.25,
        Math.cos(a) * (18 + (group % 3) * 5),
      );
      o.scale.set(2.5, 0.7 + (part % 2) * 0.3, 1.5);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
    }
    ref.current!.count = count * 4;
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  }, [count]);
  useFrame(({ clock }) => {
    if (ref.current && !settings.reducedMotion)
      ref.current.position.x = Math.sin(clock.elapsedTime * 0.025) * 1.5;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 112]}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color={ART.cloud} roughness={1} flatShading />
    </instancedMesh>
  );
}
