import type { Kind } from '../types/game';
import { PHYSICAL } from '../data/rules';
import { ART } from './art';
import { ArtBox as Box } from './ArtPrimitives';
export const PRIMARY_KINDS: Kind[] = [
  'home',
  'largeHome',
  'apartment',
  'housingEstate',
  'factory',
  'workshop',
  'manufacturer',
  'refinery',
  'farm',
  'greenhouse',
  'hydroponics',
];
export function LowFacility({ kind }: { kind: Kind }) {
  const h = PHYSICAL[kind].height,
    farm = ['farm', 'greenhouse', 'hydroponics'].includes(kind),
    industry = ['factory', 'workshop', 'manufacturer', 'refinery'].includes(kind);
  return (
    <group>
      <Box
        position={[0, h * (farm ? 0.12 : 0.35), 0]}
        size={[0.8, h * (farm ? 0.24 : 0.7), 0.8]}
        color={farm ? ART.leaf : industry ? ART.industry : ART.stone}
      />
      {!farm &&
        (industry ? (
          <Box position={[0.23, h * 0.72, -0.2]} size={[0.15, h * 0.5, 0.16]} color={ART.metal} />
        ) : (
          <mesh position={[0, h * 0.84, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[0.56, h * 0.25, 4]} />
            <meshStandardMaterial color={ART.roof} roughness={0.7} />
          </mesh>
        ))}
    </group>
  );
}
export function PrimaryFacility({ kind, output }: { kind: Kind; output: number }) {
  const h = PHYSICAL[kind].height;
  const housing = ['home', 'largeHome', 'apartment', 'housingEstate'].includes(kind);
  const farm = ['farm', 'greenhouse', 'hydroponics'].includes(kind);
  const light = output > 0.05 ? ART.gold : undefined;
  if (housing) {
    const floors = kind === 'home' ? 1 : kind === 'largeHome' ? 2 : 3;
    return (
      <group>
        <Box position={[0, h * 0.04, 0]} size={[0.87, h * 0.08, 0.85]} color={ART.metal} />
        <Box position={[0, h * 0.39, 0]} size={[0.7, h * 0.7, 0.68]} color={ART.stone} />
        <Box position={[0, h * 0.76, 0]} size={[0.83, h * 0.06, 0.8]} color={ART.gold} />
        <mesh position={[0, h * 0.86, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[0.57, h * 0.22, 4]} />
          <meshStandardMaterial color={ART.roof} roughness={0.55} flatShading />
        </mesh>
        {Array.from({ length: floors }, (_, i) => (
          <group key={i} position={[0, h * (0.24 + (i * 0.45) / floors), 0]}>
            {[-0.2, 0.2].map((x) => (
              <Box
                key={x}
                position={[x, 0, 0.349]}
                size={[0.15, h * 0.12, 0.015]}
                color={output > 0 ? '#ffe7b2' : ART.glass}
                emissive={light}
              />
            ))}
            <Box position={[0, -h * 0.08, 0.37]} size={[0.78, 0.035, 0.16]} color={ART.stone} />
            <Box position={[0, 0, 0.44]} size={[0.78, 0.025, 0.025]} color={ART.gold} />
          </group>
        ))}
        <Box position={[0, h * 0.16, 0.35]} size={[0.12, h * 0.22, 0.03]} color={ART.metal} />
        <Box position={[-0.3, h * 0.09, -0.38]} size={[0.22, 0.08, 0.12]} color={ART.leaf} />
        <Box position={[0.3, h * 0.09, -0.38]} size={[0.22, 0.08, 0.12]} color={ART.leaf} />
      </group>
    );
  }
  if (farm)
    return (
      <group>
        <Box position={[0, h * 0.04, 0]} size={[0.9, h * 0.08, 0.9]} color={ART.stone} />
        {[-0.28, 0, 0.28].map((x) => (
          <group key={x}>
            <Box position={[x, h * 0.13, 0]} size={[0.21, h * 0.12, 0.76]} color={ART.industry} />
            <Box
              position={[x, h * 0.23, 0]}
              size={[0.16, h * 0.12, 0.68]}
              color={kind === 'hydroponics' ? '#94ccac' : ART.leaf}
            />
            <Box
              position={[x + 0.1, h * 0.2, 0]}
              size={[0.025, 0.025, 0.72]}
              color={ART.aether}
              emissive={output > 0 ? ART.aether : undefined}
            />
          </group>
        ))}
        {kind !== 'farm' && (
          <>
            <Box
              position={[0, h * 0.73, 0]}
              size={[0.9, 0.045, 0.88]}
              color={ART.glass}
              rotation={[0, 0, 0.08]}
            />
            {[-0.4, 0.4].map((x) => (
              <Box
                key={x}
                position={[x, h * 0.4, 0]}
                size={[0.035, h * 0.68, 0.85]}
                color={ART.stone}
              />
            ))}
            <Box position={[0, h * 0.87, -0.3]} size={[0.3, h * 0.13, 0.22]} color={ART.roof} />
          </>
        )}
      </group>
    );
  return (
    <group>
      <Box position={[0, h * 0.04, 0]} size={[0.92, h * 0.08, 0.88]} color={ART.metal} />
      <Box position={[-0.06, h * 0.33, 0.05]} size={[0.72, h * 0.54, 0.72]} color={ART.industry} />
      <Box position={[-0.06, h * 0.62, 0.05]} size={[0.8, 0.06, 0.8]} color={ART.stone} />
      <Box position={[0, h * 0.3, 0.42]} size={[0.38, h * 0.32, 0.035]} color={ART.metal} />
      {[-0.27, 0.27].map((x, i) => (
        <group key={x}>
          <Box
            position={[x, h * (0.58 + i * 0.04), -0.22]}
            size={[0.14, h * (0.64 + i * 0.08), 0.16]}
            color={ART.metal}
          />
          <Box
            position={[x, h * (0.86 + i * 0.08), -0.22]}
            size={[0.18, 0.04, 0.2]}
            color={ART.gold}
          />
          <Box
            position={[x, h * 0.48, 0.416]}
            size={[0.15, h * 0.12, 0.02]}
            color={ART.glass}
            emissive={light}
          />
        </group>
      ))}
      <Box
        position={[0, h * 0.66, 0.08]}
        size={[0.6, 0.04, 0.05]}
        color={ART.aether}
        emissive={output > 0 ? ART.aether : undefined}
      />
    </group>
  );
}
