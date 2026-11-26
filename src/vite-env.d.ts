/// <reference types="vite/client" />

interface Window {
  __SKYTOPIA_PERF_RESET__?: boolean;
  __SKYTOPIA_PERF__?: {
    frames: number[];
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  /** Test-mode-only bridge. Vite removes its assignment from production builds. */
  __SKYTOPIA_TEST__?: typeof import('./stores/gameStore').useGame;
}
