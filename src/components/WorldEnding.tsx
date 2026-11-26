import { useEffect, useState } from 'react';
import { useGame } from '../stores/gameStore';
import { attachWorld, syncWorld } from '../game/world/state';
const scenes = [
  [
    '첫 번째 섬',
    'The first island',
    '엘레나: 이 작은 코어 위에서 우리는 다시 시작했습니다.',
    'Elena: On this small core, we began again.',
  ],
  [
    '살아있는 도시',
    'A living city',
    '마야: 집과 식량, 전력과 사람들. 서로를 지탱하는 것이 도시입니다.',
    'Maya: Homes, food, power and people. A city sustains its neighbors.',
  ],
  [
    '폭풍을 넘어',
    'Beyond the storm',
    '엘레나: 안전은 한 번의 완성이 아닙니다. 매일 돌보는 약속입니다.',
    'Elena: Safety is not a single achievement. It is a promise renewed every day.',
  ],
  [
    '연결된 하늘',
    'Connected skies',
    '오리온: 항로가 이어지는 곳마다, 또 하나의 고향이 있습니다.',
    'Orion: Wherever a sky route leads, another home awaits.',
  ],
  [
    'SKYTOPIA',
    'SKYTOPIA',
    '카엘: 하늘은 더 이상 피난처만이 아닙니다. 우리가 함께 만든 문명입니다.',
    'Kael: The sky is more than a refuge now. It is the civilization we built together.',
  ],
];
function moveEnding(scene: number) {
  const state = useGame.getState(),
    g = state.game;
  if (!g.world) return;
  const w = syncWorld(g);
  w.ending = { ...w.ending, scene: Math.min(5, scene), seen: scene >= 5 };
  if (scene < 5) {
    w.view = scene === 3 ? 'map' : 'city';
    w.active = scene === 1 ? (w.cities[1]?.id ?? w.capital) : w.capital;
  }
  const game = attachWorld(g, w),
    nexus = game.buildings.find((b) => b.kind === 'nexus');
  useGame.setState({
    game,
    cameraMode: 'free',
    cameraReset: state.cameraReset + 1,
    cameraFocus: scene === 4 && nexus ? nexus.origin : scene === 0 ? { x: 0, y: 0, z: 0 } : null,
  });
  state.save(true);
}
export default function WorldEnding() {
  const g = useGame((s) => s.game),
    ko = useGame((s) => s.settings.language) === 'ko',
    scene = g.world!.ending.scene,
    [paused, setPaused] = useState(false);
  useEffect(() => {
    moveEnding(scene);
  }, [scene]);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => moveEnding(scene + 1), 6500);
    return () => clearTimeout(timer);
  }, [scene, paused]);
  const row = scenes[Math.min(4, scene)];
  return (
    <div
      className="world-ending panel"
      role="region"
      aria-label={ko ? '문명 완성 연출' : 'Civilization ending'}
    >
      <small>BEYOND THE CLOUDS · {scene + 1}/5</small>
      <h1>{row[ko ? 0 : 1]}</h1>
      <p>{row[ko ? 2 : 3]}</p>
      <small>
        {ko
          ? '현재 월드의 도시와 항로를 보여줍니다. 게임 시간은 정지되어 있습니다.'
          : 'Showing your current cities and routes. Simulation time is paused.'}
      </small>
      <div className="world-buttons">
        <button onClick={() => setPaused(!paused)}>
          {paused ? (ko ? '재생' : 'Play') : ko ? '연출 일시정지' : 'Pause tour'}
        </button>
        <button onClick={() => moveEnding(scene + 1)}>{ko ? '다음 장면' : 'Next scene'}</button>
        <button onClick={() => moveEnding(5)}>{ko ? '연출 건너뛰기' : 'Skip ending'}</button>
      </div>
    </div>
  );
}
