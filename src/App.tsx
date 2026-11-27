import WorldUI from './components/WorldUI';
import { useOnline } from './multiplayer/client';
import { Component, Suspense, lazy, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useGame } from './stores/gameStore';
import { HUD, Menu, Overlay } from './components/Interface';
import Runtime from './components/Runtime';
import { TEXT } from './locales/text';
const CampaignScreens = lazy(() => import('./components/CampaignUI'));
const CampaignOverlay = lazy(() =>
  import('./components/CampaignUI').then((m) => ({ default: m.CampaignOverlay })),
);
const World = lazy(() => import('./scene/World'));
const OnlineUI = lazy(() => import('./multiplayer/OnlineUI'));
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
  const online = useOnline((s) => s.enabled);
  const campaign = useGame((s) => s.game.campaign);
  const worldMap = useGame(
    (s) =>
      !!s.game.world &&
      s.game.world.view === 'map' &&
      ['playing', 'paused', 'settings', 'victory'].includes(s.screen),
  );
  const screen = useGame((s) => s.screen),
    language = useGame((s) => s.settings.language),
    reduced = useGame((s) => s.settings.reducedMotion),
    returnScreen = useGame((s) => s.returnScreen);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const menu =
    screen === 'menu' || ((screen === 'settings' || screen === 'about') && returnScreen === 'menu');
  const map = ['campaign', 'profile', 'challenges'].includes(screen);
  if (online)
    return (
      <main className={`game-app ${reduced ? 'reduced-motion' : ''}`}>
        <Runtime />
        <SceneBoundary>
          <Suspense fallback={<div className="loading-scene">SKY RIVALS…</div>}>
            <OnlineUI />
          </Suspense>
        </SceneBoundary>
      </main>
    );
  return (
    <main className={`game-app ${reduced ? 'reduced-motion' : ''}`}>
      <Runtime />
      {!map && !worldMap && (
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
      )}
      {worldMap ? (
        <WorldUI />
      ) : map || screen === 'opening' ? (
        <Suspense fallback={<div className="loading-scene">SKY CAMPAIGN…</div>}>
          <CampaignScreens />
        </Suspense>
      ) : menu ? (
        <Menu />
      ) : (
        <HUD />
      )}
      {campaign && ['playing', 'paused', 'victory', 'gameover'].includes(screen) ? (
        <Suspense fallback={null}>
          <CampaignOverlay key={campaign.stage + ':' + campaign.seed} />
        </Suspense>
      ) : !map && screen !== 'opening' ? (
        <Overlay />
      ) : null}
    </main>
  );
}
