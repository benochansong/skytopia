import { temporarySupport } from '../game/vertical/emergency';
import { orderBuilding, orderCost } from '../game/city/actions';
import { canPay } from '../game/city/inventory';
import { canUse } from '../game/campaign/runtime';
import { EMERGENCY_KINDS } from '../game/repair/maintenance';
import type { Kind } from '../types/game';
import { useState } from 'react';
import { useGame } from '../stores/gameStore';
import { Dialog } from './Interface';
import { BLOCKS, VERTICAL_KINDS, PHYSICAL } from '../data/rules';
import { analyze } from '../game/analysis';
import { floorRange } from '../game/vertical/placement';
import { endpoints, isLink } from '../game/vertical/geometry';
import { edgeKey } from '../game/stability/state';
import { key } from '../game/grid';
import type { View3D } from '../types/vertical';
export function VerticalEntry() {
  const ko = useGame((s) => s.settings.language) === 'ko',
    saved = useGame((s) => s.hasVerticalSave);
  return (
    <div className="vertical-menu">
      <button onClick={() => useGame.getState().startVertical()}>
        {ko ? '수직 건설 실험실' : 'Vertical Lab'}
      </button>
      <button disabled={!saved} onClick={() => useGame.getState().startVertical(undefined, true)}>
        {ko ? '수직 실험 이어하기' : 'Resume vertical lab'}
      </button>
    </div>
  );
}
export function VerticalControls() {
  const g = useGame((s) => s.game),
    lang = useGame((s) => s.settings.language),
    selected = useGame((s) => s.selected),
    [open, setOpen] = useState(false);
  if (!g.vertical) return null;
  const text = (ko: string, en: string) => (lang === 'ko' ? ko : en),
    v = g.vertical,
    [min, max] = floorRange(g),
    stats = analyze(g),
    member =
      selected?.type === 'building'
        ? g.buildings.find((b) => String(b.id) === selected.id)
        : undefined,
    edge =
      member && isLink(member)
        ? stats.structural.edges.get(
            edgeKey(...(endpoints(member, member.origin).map(key) as [string, string])),
          )
        : undefined;
  const views: [View3D, string, string][] = [
    ['all', '모든 층', 'All floors'],
    ['active', '현재 층 이하', 'Active floor'],
    ['cutaway', '단면 보기', 'Cutaway'],
    ['structure', '구조 보기', 'Structural'],
    ['lower', '하부 보기', 'Lower deck'],
    ['blueprint', '설계도', 'Blueprint'],
  ];
  return (
    <>
      <section className="vertical-controls panel" aria-label={text('층 선택', 'Floor selection')}>
        <div className="section-label">
          VERTICAL CIVILIZATION{' '}
          <strong>
            {v.floor > 0 ? '+' : ''}
            {v.floor}F
          </strong>
        </div>
        <div className="floor-buttons">
          {Array.from({ length: 7 }, (_, i) => i - 2).map((y) => (
            <button
              key={y}
              disabled={y < min || y > max}
              aria-pressed={y === v.floor}
              onClick={() => useGame.getState().setFloor(y)}
            >
              {y > 0 ? '+' : ''}
              {y}F
            </button>
          ))}
        </div>
        <div className="vertical-row">
          <select
            aria-label={text('층별 보기', 'Floor view')}
            value={v.view}
            onChange={(e) => useGame.getState().setView(e.target.value as View3D)}
          >
            {views.map(([id, ko, en]) => (
              <option key={id} value={id}>
                {text(ko, en)}
              </option>
            ))}
          </select>
          <button onClick={() => setOpen(true)}>{text('입체 공방', 'Workshop')}</button>
        </div>
        <small>
          {text('PgUp/PgDn 층 · R/F 구조재 축 회전', 'PgUp/PgDn floors · R/F member axes')}
        </small>
      </section>
      {open && (
        <Dialog
          title={text('수직 건축 공방', 'Vertical workshop')}
          wide
          onClose={() => setOpen(false)}
        >
          <p>
            {text(
              '기둥을 0층에 놓고 같은 위치의 +1층에 플랫폼을 설치하세요. 계단은 이동, 수직 중계기는 전력, 화물 승강기는 생산 효율을 연결합니다.',
              'Place a column on floor 0, then a deck at the same position on +1. Stairs carry people, vertical relays carry power, cargo lifts improve throughput.',
            )}
          </p>
          <p>
            {text(
              '일반 미션은 무작위 공급을 유지합니다. 구조재의 직접 선택은 비용을 내는 긴급 설계도이며 주거·정원은 공급 또는 주문을 사용합니다.',
              'Missions retain random supply. Direct structural selection is a paid emergency blueprint; homes and gardens use supply or orders.',
            )}
          </p>
          <div className="vertical-catalog">
            {[
              ...VERTICAL_KINDS,
              'road',
              'home',
              'power',
              'farm',
              'factory',
              'liftSmall',
              'liftLarge',
            ].map((k) => (
              <button
                key={k}
                disabled={
                  !canUse(g, k as Kind) ||
                  (!['lab', 'citylab'].includes(g.mode) &&
                    !EMERGENCY_KINDS.includes(k as Kind) &&
                    (!VERTICAL_KINDS.includes(k as Kind) ||
                      ['towerHome', 'skyGarden', 'observatory'].includes(k)))
                }
                onClick={() => {
                  useGame.getState().blueprint(k as keyof typeof BLOCKS);
                  setOpen(false);
                }}
              >
                <span>{BLOCKS[k as keyof typeof BLOCKS][lang]}</span>
                <small>
                  {PHYSICAL[k as keyof typeof PHYSICAL].cost} ◈ ·{' '}
                  {BLOCKS[k as keyof typeof BLOCKS].mass}t
                </small>
              </button>
            ))}
          </div>
          {['lab', 'citylab'].includes(g.mode) && (
            <label>
              {text('블록 형태', 'Block shape')}
              <select
                value={g.active.shape}
                onChange={(e) => {
                  const shape = e.target.value as typeof g.active.shape;
                  useGame
                    .getState()
                    .cityAction((game) => ({ ...game, active: { ...game.active, shape } }));
                }}
              >
                {BLOCKS[g.active.kind].shapes.map((shape) => (
                  <option key={shape} value={shape}>
                    {shape}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="vertical-row">
            {(['free', 'top', 'front', 'side', 'below', 'floor'] as const).map((mode, i) => (
              <button
                key={mode}
                onClick={() => {
                  useGame.getState().camera(mode);
                  setOpen(false);
                }}
              >
                {text(['자유', '평면', '정면', '측면', '하부', '현재 층'][i], mode)}
              </button>
            ))}
          </div>
          {['beam', 'truss'].includes(g.active.kind) && (
            <div className="vertical-row">
              <button onClick={() => useGame.getState().rotateAxis('pitch')}>R · X 90°</button>
              <button onClick={() => useGame.getState().rotateAxis('roll')}>F · Z 90°</button>
            </div>
          )}
          <div className="vertical-row">
            {(['towerHome', 'skyGarden', 'observatory'] as Kind[]).map((kind) => (
              <button
                key={kind}
                disabled={
                  !canUse(g, kind) || g.city.orderCooldown > 0 || !canPay(g, orderCost(kind))
                }
                onClick={() => useGame.getState().cityAction((game) => orderBuilding(game, kind))}
              >
                {text('주문: ', 'Order: ')}
                {BLOCKS[kind][lang]}
              </button>
            ))}
          </div>
          <button
            disabled={!member || !isLink(member) || v.emergencyCooldown > 0}
            onClick={() => {
              if (selected)
                useGame.getState().cityAction((game) => temporarySupport(game, selected));
            }}
          >
            {text('선택 구조재 임시 지지 · 20초', 'Temporary support · 20 seconds')}{' '}
            {v.emergencyCooldown > 0 ? '(' + Math.ceil(v.emergencyCooldown) + 's)' : ''}
          </button>
          <h3>{text('층별 구조', 'Floor structure')}</h3>
          <table>
            <thead>
              <tr>
                {[
                  text('층', 'Floor'),
                  text('플랫폼', 'Decks'),
                  text('자체 질량', 'Own mass'),
                  text('위험 지점', 'Risks'),
                ].map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 7 }, (_, i) => i - 2).map((y) => {
                const nodes = [...stats.structural.nodes.values()].filter(
                  (n) => n.platform.y === y,
                );
                return (
                  <tr key={y}>
                    <td>{y}F</td>
                    <td>{nodes.length}</td>
                    <td>{nodes.reduce((n, p) => n + p.mass, 0).toFixed(1)}t</td>
                    <td>{nodes.filter((n) => n.ratio > 1 || !n.supported).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p>
            {text('무게중심 높이', 'Mass center height')}: {stats.center.y?.toFixed(2)}m ·{' '}
            {text('부양 중심', 'Lift center')}: {stats.structural.centerLift.y.toFixed(2)}m
          </p>
          {member && edge && (
            <p>
              {BLOCKS[member.kind][lang]}: {edge.load.toFixed(1)} / {edge.capacity.toFixed(1)}t ·{' '}
              {text('내구도', 'Durability')} {member.durability.toFixed(0)} ·{' '}
              {edge.ratio > 1
                ? text('⚠ 추가 기둥 또는 보강이 필요합니다.', '⚠ Add a column or reinforcement.')
                : text('지지 여유 있음', 'Support available')}
            </p>
          )}
          {g.mode === 'citylab' && !g.world && !g.campaign && !g.disaster && (
            <>
              <h3>VERTICAL LAB</h3>
              <div className="vertical-row">
                {(['A', 'B', 'C', 'D', 'E'] as const).map((example, i) => (
                  <button
                    key={example}
                    onClick={() => {
                      useGame.getState().startVertical(example);
                      setOpen(false);
                    }}
                  >
                    {example} ·{' '}
                    {text(
                      ['높은 탑', '하중 분산', '교량', '하부 산업', '연쇄 붕괴'][i],
                      ['Tower', 'Load sharing', 'Bridge', 'Lower industry', 'Cascade'][i],
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  useGame.getState().startVertical(v.example);
                  setOpen(false);
                }}
              >
                {text('예제 초기화', 'Reset example')}
              </button>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
