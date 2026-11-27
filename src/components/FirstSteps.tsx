import { useState } from 'react';
import { useGame } from '../stores/gameStore';
import { onlineActive } from '../multiplayer/port';
import { analyze } from '../game/analysis';
import { BLOCKS } from '../data/rules';

/** Context only: no rewards, gates or simulation state are controlled by this guide. */
export function FirstSteps() {
  const g = useGame((s) => s.game),
    settings = useGame((s) => s.settings),
    freeMode = useGame((s) => s.freeMode),
    screen = useGame((s) => s.screen);
  const [hidden, setHidden] = useState(false);
  if (
    onlineActive() ||
    screen !== 'playing' ||
    !settings.onboarding ||
    g.campaign?.dialogue ||
    g.campaign?.intro ||
    (g.campaign && g.campaign.stage !== 1) ||
    g.mode === 'lab' ||
    g.mode === 'training' ||
    (g.mode === 'citylab' && !freeMode) ||
    g.world ||
    g.disaster ||
    g.elapsed > 600
  )
    return null;
  const ko = settings.language === 'ko',
    a = analyze(g);
  const built = g.buildings.filter((b) => !b.initial);
  const message = !built.length
    ? [
        'WASD로 위치를 정하고 Q/E로 회전한 뒤 Space로 첫 건물을 놓으세요. 초록 테두리는 배치 가능을 뜻합니다.',
        'Move with WASD, rotate with Q/E and place your first building with Space. A green outline means it fits.',
      ]
    : a.disconnected > 0
      ? [
          '연결되지 않은 건물이 있습니다. 시설 옆에 도로를 이어 코어 도로와 연결하세요.',
          'A building is disconnected. Join the road beside it to the core road network.',
        ]
      : a.demand > a.power
        ? [
            '전력 수요가 공급보다 큽니다. 발전기의 도로·전력 연결과 가동 상태를 확인하세요.',
            'Demand exceeds supply. Check generator connections and operation.',
          ]
        : !built.some((b) => BLOCKS[b.kind].capacity > 0)
          ? [
              '도로 옆에 주거를 놓으면 주민이 정착할 수 있습니다. 전력과 여유 공간도 확인하세요.',
              'Place housing beside a road so residents can settle. Check power and room to grow.',
            ]
          : [
              '다음 목표: 플랫폼으로 공간을 넓히고 주거·농장·발전기를 균형 있게 배치하세요. 위험 구역은 도시 도구에서 찾을 수 있습니다.',
              'Next: expand with platforms and balance homes, farms and power. Find risk areas in City tools.',
            ];
  return (
    <aside className="first-steps panel" aria-label={ko ? '첫 건설 안내' : 'First building guide'}>
      {!hidden && (
        <>
          <strong>{ko ? '첫 10분 · 다음 한 걸음' : 'First ten minutes · next step'}</strong>
          <p>{message[ko ? 0 : 1]}</p>
        </>
      )}
      <button onClick={() => setHidden(!hidden)}>
        {hidden ? (ko ? '안내 다시 보기' : 'Replay guide') : ko ? '안내 접기' : 'Hide guide'}
      </button>
    </aside>
  );
}
