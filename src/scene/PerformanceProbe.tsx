import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
// Mounted only in Vite test mode. Records actual previous-frame WebGL counters.
export function PerformanceProbe() {
  const gl = useThree((s) => s.gl),
    samples = useRef<number[]>([]);
  useFrame((_, dt) => {
    if (window.__SKYTOPIA_PERF_RESET__) {
      samples.current = [];
      window.__SKYTOPIA_PERF_RESET__ = false;
    }
    samples.current.push(dt * 1000);
    if (samples.current.length > 300) samples.current.shift();
    window.__SKYTOPIA_PERF__ = {
      frames: [...samples.current],
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    };
  });
  return null;
}
