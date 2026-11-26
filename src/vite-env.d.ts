/// <reference types="vite/client" />

interface Window {
  /** Test-mode-only bridge. Vite removes its assignment from production builds. */
  __SKYTOPIA_TEST__?: typeof import('./stores/gameStore').useGame;
}
