import { useEffect, useState } from 'react';
import { useGame } from '../stores/gameStore';
import { analyze } from '../game/analysis';
import { diagnostics } from '../stores/diagnostics';
import { onlineActive } from '../multiplayer/port';
import { BLOCKS, PHYSICAL } from '../data/rules';
import { cellsOf } from '../game/grid';
import { constructionCost } from '../game/city/actions';
import { projectPlacement } from '../game/building';
import { validatePlacement } from '../game/placement';
import './playtools.css';

const feedback: Record<string, [string, string]> = {
  built: ['건축 완료', 'Construction complete'],
  connection: ['연결 복구', 'Connection restored'],
  power: ['전력 균형 회복', 'Power balance restored'],
  balance: ['안정도 개선', 'Stability improved'],
  expansion: ['새로운 건축 공간', 'Room to grow'],
  recycleCooldown: ['재활용은 3초 간격으로 가능합니다', 'Recycle is available every 3 seconds'],
  undoExpired: ['도시가 이미 변했습니다 · 실행 취소 불가', 'City has changed · cannot undo'],
  undone: ['최근 배치를 취소했습니다', 'Last placement undone'],
};
export function ControlSettings() {
  const s = useGame((x) => x.settings),
    ko = s.language === 'ko',
    set = useGame((x) => x.configure);
  return (
    <fieldset className="control-settings">
      <legend>{ko ? '건축 조작' : 'Building controls'}</legend>
      <label>
        {ko ? '보조 수준' : 'Assistance'}
        <select
          aria-label={ko ? '보조 수준' : 'Assistance'}
          value={s.assistance}
          onChange={(e) => set({ assistance: e.target.value as typeof s.assistance })}
        >
          <option value="guided">{ko ? '안내형' : 'Guided'}</option>
          <option value="normal">{ko ? '일반형' : 'Normal'}</option>
          <option value="expert">{ko ? '전문가형' : 'Expert'}</option>
        </select>
      </label>
      {(['smartSnap', 'rotationAssist'] as const).map((k, i) => (
        <label key={k}>
          {
            (ko
              ? ['스마트 스냅 · 한 칸', '회전 보정 · 한 칸']
              : ['Smart snap · one cell', 'Rotation assist · one cell'])[i]
          }
          <input type="checkbox" checked={s[k]} onChange={(e) => set({ [k]: e.target.checked })} />
        </label>
      ))}
      {(['repeatDelay', 'repeatInterval', 'cameraSensitivity', 'zoomSensitivity'] as const).map(
        (k, i) => (
          <label key={k}>
            {
              (ko
                ? ['키 반복 대기', '키 반복 간격', '카메라 감도', '확대 감도']
                : [
                    'Key repeat delay',
                    'Key repeat interval',
                    'Camera sensitivity',
                    'Zoom sensitivity',
                  ])[i]
            }
            <span>
              {s[k]}
              {i < 2 ? ' ms' : '×'}
            </span>
            <input
              type="range"
              min={[120, 50, 0.3, 0.3][i]}
              max={[600, 250, 2, 2][i]}
              step={i < 2 ? 10 : 0.1}
              value={s[k]}
              onChange={(e) => set({ [k]: Number(e.target.value) })}
            />
          </label>
        ),
      )}
      <small>
        {ko
          ? '온라인에서는 건축 보조와 무관하게 동일한 서버 판정·공급·시간이 적용됩니다.'
          : 'Online assistance never changes server validity, supply or time.'}
      </small>
    </fieldset>
  );
}
export function PlacementInsight() {
  const g = useGame((s) => s.game),
    settings = useGame((s) => s.settings),
    ko = settings.language === 'ko';
  const [open, setOpen] = useState(false);
  const cost = g.city.enabled ? constructionCost(g, g.active.kind) : null;
  const v = validatePlacement(g);
  const projected =
    (open || settings.assistance === 'guided') && v.valid ? analyze(projectPlacement(g)) : null;
  if (settings.assistance === 'expert') return null;
  return (
    <div className="placement-insight">
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        {ko ? '배치 영향' : 'Placement impact'} {open ? '−' : '+'}
      </button>
      <span>
        {cellsOf(g.active).length} {ko ? '칸' : 'cells'} · {BLOCKS[g.active.kind].mass} t
      </span>
      {cost && (
        <span>
          {ko ? '비용' : 'Cost'}{' '}
          {Object.entries(cost)
            .filter(([, n]) => Number(n) > 0)
            .map(
              ([k, n]) =>
                `${k === 'materials' ? (ko ? '자재' : 'materials') : k === 'credits' ? (ko ? '크레딧' : 'credits') : k === 'aether' ? (ko ? '에테르' : 'aether') : k} ${n}`,
            )
            .join(' · ')}
        </span>
      )}
      {projected && (
        <span>
          {ko ? '예상' : 'Projected'} · {ko ? '안정' : 'Stability'}{' '}
          {Math.round(projected.stability)}% · {ko ? '전력' : 'Power'} {projected.power.toFixed(0)}/
          {projected.demand.toFixed(0)} · {ko ? '수용' : 'Housing'} {projected.capacity}
        </span>
      )}
      {open && (
        <small>
          {ko
            ? '현재 상태 기준 예상값입니다. 가동·주민 정착 후 달라질 수 있습니다.'
            : 'Prediction from current state; operation and settlement can change it.'}{' '}
          {PHYSICAL[g.active.kind].height.toFixed(1)}m
        </small>
      )}
    </div>
  );
}
export default function PlayTools() {
  const s = useGame(),
    ko = s.settings.language === 'ko';
  const [shown, setShown] = useState('');
  const [capture, setCapture] = useState('');
  useEffect(() => {
    setShown(s.feedback);
    const id = setTimeout(() => setShown(''), Math.max(0, s.feedbackUntil - performance.now()));
    return () => clearTimeout(id);
  }, [s.feedback, s.feedbackUntil]);
  useEffect(() => {
    const done = (e: Event) =>
      setCapture(
        (e as CustomEvent<boolean>).detail
          ? ko
            ? '사진 저장 완료'
            : 'Photo saved'
          : ko
            ? '사진 저장 실패'
            : 'Capture failed',
      );
    window.addEventListener('skytopia:captured', done);
    return () => window.removeEventListener('skytopia:captured', done);
  }, [ko]);
  if (
    !['playing', 'paused', 'victory', 'gameover'].includes(s.screen) ||
    s.game.world?.view === 'map'
  )
    return null;
  if (s.photoMode)
    return (
      <div className="photo-tools panel" aria-label={ko ? '사진 모드' : 'Photo mode'}>
        <strong>SKYTOPIA / PHOTO</strong>
        <span>
          {onlineActive()
            ? ko
              ? '온라인 시간은 계속 흐릅니다'
              : 'Online time continues'
            : ko
              ? '도시 시간 정지'
              : 'City time paused'}
        </span>
        <button onClick={() => s.camera()}>{ko ? '전체 보기' : 'Reset view'}</button>
        <button onClick={() => window.dispatchEvent(new Event('skytopia:capture'))}>
          {ko ? '사진 저장' : 'Save photo'}
        </button>
        <button onClick={s.togglePhoto}>{ko ? '돌아가기 · Esc' : 'Return · Esc'}</button>
        <small role="status">{capture}</small>
      </div>
    );
  return (
    <>
      <div className={`play-tools panel ${onlineActive() ? 'online-tools' : ''}`}>
        <button onClick={s.togglePhoto}>{ko ? '사진 모드' : 'Photo mode'}</button>
        <details className="city-tools-menu">
          <summary>{ko ? '도시 도구' : 'City tools'}</summary>
          <div>
            <button onClick={() => s.focus(s.lastPlaced)}>{ko ? '최근 건축' : 'Last build'}</button>
            <button
              onClick={() => {
                const a = analyze(s.game);
                s.focus(a.structural.worst?.cell ?? s.game.cursor);
              }}
            >
              {ko ? '위험 구역' : 'Risk area'}
            </button>
            {!onlineActive() &&
              !s.game.campaign &&
              !s.game.world &&
              !s.game.disaster &&
              s.game.difficulty !== 'hard' && (
                <button
                  title={
                    ko
                      ? '다음 시뮬레이션 갱신 전만 가능 · Ctrl+Z'
                      : 'Only before the next simulation step · Ctrl+Z'
                  }
                  onClick={s.undo}
                >
                  {ko ? '실행 취소' : 'Undo'}
                </button>
              )}
            {import.meta.env.DEV && (
              <button
                onClick={() => {
                  const a = document.createElement('a');
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(diagnostics(), null, 2)], {
                      type: 'application/json',
                    }),
                  );
                  a.href = url;
                  a.download = 'skytopia-local-diagnostics.json';
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                DEV ↓
              </button>
            )}
          </div>
        </details>
      </div>
      {shown && (
        <div className="build-feedback" role="status">
          {feedback[shown]?.[ko ? 0 : 1] ?? ''}
        </div>
      )}
    </>
  );
}
