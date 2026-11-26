import { BLOCKS } from '../data/rules';
import type { Kind } from '../types/game';
export function DefenseFacility({ kind }: { kind: Kind }) {
  const color = BLOCKS[kind].color,
    wind = kind.toLowerCase().includes('windbreak'),
    rod = kind.toLowerCase().includes('lightning'),
    tower = ['weatherTower', 'weatherStation', 'stabilizer'].includes(kind),
    shield = kind.startsWith('shield');
  return (
    <group>
      <mesh position={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[0.85, 0.24, 0.85]} />
        <meshStandardMaterial color="#c1c8bb" />
      </mesh>
      {wind ? (
        <>
          {[0, 0.3, 0.6, 0.9].map((y) => (
            <mesh key={y} position={[0, 0.35 + y, 0]} castShadow>
              <boxGeometry args={[0.12, 0.22, 0.9]} />
              <meshStandardMaterial color={color} />
            </mesh>
          ))}
        </>
      ) : rod ? (
        <>
          <mesh position={[0, 1.3, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.08, 2.5, 6]} />
            <meshStandardMaterial color="#bbc9cf" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, 2.5, 0]}>
            <sphereGeometry args={[0.1, 8, 6]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </>
      ) : tower || shield ? (
        <>
          <mesh position={[0, 0.7, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.32, 1.2, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 1.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.36, 0.065, 6, 16]} />
            <meshStandardMaterial color="#dbe0c4" metalness={0.4} />
          </mesh>
          <mesh position={[0, 1.4, 0]}>
            <icosahedronGeometry args={[0.18, 0]} />
            <meshStandardMaterial
              color={shield ? '#93cae7' : color}
              emissive="#1c5365"
              emissiveIntensity={0.25}
            />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.76, 0.7, 0.72]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 0.9, 0]} castShadow>
            <boxGeometry args={[0.88, 0.12, 0.83]} />
            <meshStandardMaterial color="#667e85" />
          </mesh>
          {[-0.22, 0, 0.22].map((x) => (
            <mesh key={x} position={[x, 0.5, 0.37]}>
              <boxGeometry args={[0.12, 0.18, 0.025]} />
              <meshStandardMaterial color="#c3e6dd" />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}
