import { Component, Suspense, lazy, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useGame } from './stores/gameStore';
import { HUD, Menu, Overlay } from './components/Interface';
import Runtime from './components/Runtime';
import { TEXT } from './locales/text';
const World = lazy(() => import('./scene/World'));
class SceneBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <div className="scene-error" role="alert">
          <p>{TEXT[useGame.getState().settings.language].webgl}</p>
          <button onClick={() => location.reload()}>
            {TEXT[useGame.getState().settings.language].reload}
          </button>
        </div>
      );
    return this.props.children;
  }
}
export default function App() {
  const screen = useGame((s) => s.screen),
    language = useGame((s) => s.settings.language),
    reduced = useGame((s) => s.settings.reducedMotion),
    returnScreen = useGame((s) => s.returnScreen);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const menu =
    screen === 'menu' || ((screen === 'settings' || screen === 'about') && returnScreen === 'menu');
  return (
    <main className={`game-app ${reduced ? 'reduced-motion' : ''}`}>
      <Runtime />
      <SceneBoundary>
        <Suspense
          fallback={
            <div className="loading-scene">
              SKYTOPIA <span>Preparing the sky…</span>
            </div>
          }
        >
          <World />
        </Suspense>
      </SceneBoundary>
      {menu ? <Menu /> : <HUD />}
      <Overlay />
    </main>
  );
}
