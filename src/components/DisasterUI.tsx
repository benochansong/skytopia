import { growthTarget, loadSurvivalBest } from '../game/disasters/survival';
import { useState } from 'react';
import { useGame } from '../stores/gameStore';
import { Dialog } from './Interface';
import { BLOCKS, DISASTER_KINDS } from '../data/rules';
import { hazardText, policyText, freshDisaster } from '../game/disasters/state';
import { HAZARDS, POLICIES } from '../types/disaster';
import type { DisasterView, Hazard } from '../types/disaster';
import { forecast } from '../game/disasters/scheduler';
import {
  claimWave,
  emergencyOrder,
  setPolicy,
  changeDisasterSetting,
} from '../game/disasters/manager';
import { rebuild } from '../game/disasters/recovery';
import { returnResidents } from '../game/disasters/evacuation';
import { defenseReady, evacuatedTotal } from '../game/disasters/effects';
import { resilience } from '../game/disasters/report';
import { emergencyPower, orderCost } from '../game/city/actions';
import { canPay } from '../game/city/inventory';
import { canUse } from '../game/campaign/runtime';
export function DisasterEntry() {
  const s = useGame(),
    ko = s.settings.language === 'ko';
  const best = loadSurvivalBest();
  return (
    <div className="disaster-menu">
      <button onClick={() => s.startDisaster('lab')}>{ko ? '재난 실험실' : 'Disaster Lab'}</button>
      <button disabled={!s.hasDisasterSave} onClick={() => s.startDisaster('lab', 'A', true)}>
        {ko ? '재난 실험 이어하기' : 'Resume disaster lab'}
      </button>
      <button onClick={() => s.startDisaster('survival')}>
        {ko ? '생존 모드' : 'Survival mode'}
        {best ? ` · BEST ${best.score}` : ''}
      </button>
      <button disabled={!s.hasSurvivalSave} onClick={() => s.startDisaster('survival', 'A', true)}>
        {ko ? '생존 이어하기' : 'Resume survival'}
      </button>
    </div>
  );
}
export function DisasterControls() {
  const g = useGame((s) => s.game),
    lang = useGame((s) => s.settings.language),
    free = useGame((s) => s.freeMode),
    selected = useGame((s) => s.selected),
    [open, setOpen] = useState(false);
  const d = g.disaster,
    ko = lang === 'ko',
    text = (a: string, b: string) => (ko ? a : b),
    index = ko ? 0 : 1;
  const action = useGame.getState().cityAction;
  if (!d) {
    return free ? (
      <button
        className="weather-enable panel"
        onClick={() => {
          action((g) => ({ ...g, disaster: { ...freshDisaster('free'), setting: 'off' } }));
          setOpen(true);
        }}
      >
        {text('기상·재난 설정', 'Weather and disaster settings')}
      </button>
    ) : null;
  }
  const precision = g.buildings.some((b) => b.kind === 'weatherTower' && defenseReady(g, b)),
    observed =
      precision || g.buildings.some((b) => b.kind === 'weatherStation' && defenseReady(g, b));
  const r = resilience(g),
    t = d.threat,
    remaining = t
      ? Math.max(
          0,
          (d.phase === 'forecast' ? t.warning : d.phase === 'active' ? t.duration : t.recovery) -
            d.clock,
        )
      : 0;
  const views: [DisasterView, string, string][] = [
    ['off', '분석 끄기', 'Analysis off'],
    ['wind', '풍하중', 'Wind load'],
    ['risk', '폭풍 위험', 'Storm risk'],
    ['impact', '운석 충돌', 'Meteor impact'],
    ['shield', '방어 범위', 'Shield coverage'],
    ['aether', '에테르 안정', 'Aether stability'],
    ['evacuation', '대피 경로', 'Evacuation routes'],
    ['damage', '재난 피해', 'Disaster damage'],
    ['recovery', '복구 우선순위', 'Recovery priority'],
  ];
  const patchConfig = (patch: Partial<typeof d.config>) =>
    action((g) => ({
      ...g,
      disaster: { ...g.disaster!, config: { ...g.disaster!.config, ...patch } },
    }));
  return (
    <>
      <section
        className={'disaster-controls panel ' + (d.phase === 'active' ? 'hazard-active' : '')}
        aria-label={text('기상과 재난', 'Weather and disasters')}
      >
        <div>
          <strong>
            {d.mode === 'survival' ? `WAVE ${d.wave} · ` : ''}
            {t && d.phase !== 'calm'
              ? hazardText[t.kind][index]
              : text('기상 관측', 'Weather watch')}
          </strong>
          <button onClick={() => setOpen(true)}>{text('재난 대응', 'Emergency management')}</button>
        </div>
        <p>
          {d.phase === 'forecast'
            ? text('접근', 'Approaching')
            : d.phase === 'active'
              ? text('발생 중', 'Active')
              : d.phase === 'recovery'
                ? text('복구', 'Recovery')
                : text('평상시', 'Calm')}
          {t ? ` · Lv.${t.level} · ${Math.ceil(remaining)}s` : ''} · {d.weather.direction}° /{' '}
          {d.weather.wind.toFixed(1)}m/s · {d.weather.temperature.toFixed(0)}°C
        </p>
        <span>
          {text('회복력', 'Resilience')} {r.score} · {text('대피', 'Sheltered')}{' '}
          {evacuatedTotal(g).toFixed(0)}/{r.shelterCapacity} · {policyText[d.policy][index]}
        </span>
        {d.reward !== null && (
          <button onClick={() => setOpen(true)}>
            {text('웨이브 보상 선택', 'Choose wave reward')}
          </button>
        )}
      </section>
      {open && (
        <Dialog
          title={text('폭풍을 지키는 도시', 'A city prepared for storms')}
          wide
          onClose={() => setOpen(false)}
        >
          <div className="disaster-summary">
            <span>
              {text('회복력', 'Resilience')} <b>{r.score}/100</b>
            </span>
            <span>
              {text('비상 식량', 'Food reserve')}{' '}
              <b>{Number.isFinite(r.foodSeconds) ? Math.floor(r.foodSeconds) : '∞'}s</b>
            </span>
            <span>
              {text('전체 수요 기준 전력 비축', 'Energy at full demand')}{' '}
              <b>{r.batterySeconds.toFixed(1)}s</b>
            </span>
            <span>
              {text('방어막 범위', 'Shield coverage')} <b>{Math.round(r.covered * 100)}%</b>
            </span>
          </div>
          {t && (
            <div className="disaster-forecast">
              <strong>
                {hazardText[t.kind][index]} · Lv.{t.level} · {t.direction}°
              </strong>
              <p>
                {text(
                  '높은 구조물 보강, 방어 범위 확인, 비상 자원과 대피 경로를 준비하세요.',
                  'Reinforce tall structures, check defenses, reserve resources and prepare shelter routes.',
                )}
              </p>
              <button
                onClick={() => {
                  useGame.getState().setFloor(t.target.y ?? 0);
                  useGame.getState().focus(t.target);
                  setOpen(false);
                }}
              >
                {text('예상 위험 구역 보기', 'Focus predicted risk zone')}
              </button>
              <span>
                {text('충돌 예보', 'Impact forecast')}:{' '}
                {observed ? t.impacts.length : text('범위 경보', 'Area warning')} ·{' '}
                {precision
                  ? text('정밀 시각', 'Precise timing')
                  : text('추정 시각', 'Estimated timing')}
                :{' '}
                {(() => {
                  const at = t.impacts.find((e) => !d.applied.includes(e.id))?.at;
                  return at === undefined
                    ? '—'
                    : precision
                      ? at.toFixed(1)
                      : Math.round(at / 10) * 10;
                })()}
                s
              </span>
            </div>
          )}
          <label>
            {text('재난 분석', 'Disaster analysis')}{' '}
            <select
              aria-label={text('재난 분석', 'Disaster analysis')}
              value={d.view}
              onChange={(e) =>
                action((g) => ({
                  ...g,
                  disaster: { ...g.disaster!, view: e.target.value as DisasterView },
                }))
              }
            >
              {views.map(([id, a, b]) => (
                <option key={id} value={id}>
                  {text(a, b)}
                </option>
              ))}
            </select>
          </label>
          <div className="policy-grid">
            {POLICIES.map((p) => (
              <button
                key={p}
                aria-pressed={d.policy === p}
                onClick={() => action((g) => setPolicy(g, p))}
              >
                {policyText[p][index]}
              </button>
            ))}
          </div>
          <p className="subtle">
            {text(
              '전력·절약·대피 정책은 산업과 상업의 가동률을 35%로 줄입니다. 방어·복구 정책은 해당 시설에 전력을 먼저 배정합니다. 정책은 하나만 적용됩니다.',
              'Power, conservation and evacuation reduce industrial and commercial activity to 35%. Defense and recovery prioritize their facilities. One policy applies at a time.',
            )}
          </p>
          <div className="disaster-actions">
            <button onClick={() => action(emergencyPower)} disabled={g.city.powerCooldown > 0}>
              {text('비상 전력 +30 / 20초', 'Emergency power +30 / 20s')}
            </button>
            <button
              onClick={() => action(returnResidents)}
              disabled={d.phase === 'active' || !d.evacuated.length}
            >
              {text('주민 복귀', 'Return residents')}
            </button>
            <button
              disabled={!selected}
              onClick={() =>
                action((g) => ({
                  ...g,
                  disaster: { ...g.disaster!, repairTarget: selected, policy: 'recovery' },
                }))
              }
            >
              {text('선택 구조물 수리 우선', 'Prioritize selected repair')}
            </button>
            <label>
              <input
                type="checkbox"
                checked={d.autoRepair}
                onChange={(e) =>
                  action((g) => ({
                    ...g,
                    disaster: { ...g.disaster!, autoRepair: e.target.checked },
                  }))
                }
              />
              {text('복구센터 자동 수리', 'Recovery center auto repair')}
            </label>
          </div>
          <details>
            <summary>{text('재난 효과·접근성', 'Disaster effects and accessibility')}</summary>
            <div className="disaster-actions">
              <label>
                {text('입자 수', 'Particles')}
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="8"
                  value={g.settings.stormParticles}
                  onChange={(e) =>
                    useGame.getState().configure({ stormParticles: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                {text('화면 흔들림', 'Screen shake')}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step=".1"
                  value={g.settings.cameraShake}
                  onChange={(e) =>
                    useGame.getState().configure({ cameraShake: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={g.settings.reducedFlashes}
                  onChange={(e) =>
                    useGame.getState().configure({ reducedFlashes: e.target.checked })
                  }
                />
                {text('낙뢰 번쩍임 감소', 'Reduce lightning flashes')}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={g.settings.disasterCamera}
                  onChange={(e) =>
                    useGame.getState().configure({ disasterCamera: e.target.checked })
                  }
                />
                {text('예보 구역 자동 카메라', 'Automatic forecast camera')}
              </label>
              <label>
                {text('위험 아이콘 크기', 'Warning icon size')}
                <input
                  type="range"
                  min="1"
                  max="2"
                  step=".1"
                  value={g.settings.warningScale}
                  onChange={(e) =>
                    useGame.getState().configure({ warningScale: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                {text('경보 음량', 'Alert volume')}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step=".1"
                  value={g.settings.warningVolume}
                  onChange={(e) =>
                    useGame.getState().configure({ warningVolume: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          </details>
          <h3>{text('방어시설 공급', 'Defense supply')}</h3>
          <p>
            {text(
              '일반 공급을 유지합니다. 주문은 자재·크레딧과 대기시간을 사용하며 다음 공급에 전달됩니다.',
              'Normal block supply continues. Orders cost materials/credits, take time and enter the next-block queue.',
            )}
          </p>
          <div className="defense-grid">
            {DISASTER_KINDS.filter((k) => canUse(g, k)).map((k) => (
              <div key={k}>
                <strong>{BLOCKS[k][lang]}</strong>
                <small>
                  {orderCost(k).materials}◆ · {orderCost(k).credits}Cr · {BLOCKS[k].mass}t /{' '}
                  {BLOCKS[k].demand}⚡
                </small>
                <button
                  disabled={
                    d.emergencyCooldown > 0 ||
                    g.city.orderCooldown > 0 ||
                    !canPay(g, orderCost(k)) ||
                    g.city.orders.length >= 2
                  }
                  onClick={() => action((g) => emergencyOrder(g, k))}
                >
                  {text('주문', 'Order')}
                </button>
                {d.mode === 'lab' && (
                  <button
                    onClick={() => {
                      useGame.getState().blueprint(k);
                      setOpen(false);
                    }}
                  >
                    {text('실험 배치', 'Lab placement')}
                  </button>
                )}
              </div>
            ))}
          </div>
          {d.mode === 'free' && (
            <label>
              {text('자유 건설 재난', 'Free-build disasters')}
              <select
                aria-label={text('자유 건설 재난', 'Free-build disasters')}
                value={d.setting}
                onChange={(e) =>
                  action((g) => changeDisasterSetting(g, e.target.value as typeof d.setting))
                }
              >
                {[
                  ['off', '재난 없음', 'Off'],
                  ['weather', '기상만', 'Weather only'],
                  ['low', '낮은 강도', 'Low'],
                  ['normal', '일반', 'Normal'],
                  ['high', '높은 강도', 'High'],
                  ['custom', '사용자 지정', 'Custom'],
                ].map(([id, a, b]) => (
                  <option key={id} value={id}>
                    {text(a, b)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(d.mode === 'lab' || (d.mode === 'free' && d.setting === 'custom')) && (
            <fieldset className="disaster-lab">
              <legend>DISASTER LAB</legend>
              {d.mode === 'lab' && (
                <div className="lab-examples">
                  {(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((e) => (
                    <button key={e} onClick={() => useGame.getState().startDisaster('lab', e)}>
                      {e} ·{' '}
                      {text(
                        ['고층 강풍', '방풍 비교', '낙뢰', '운석 방어', '에테르 위기', '복합 재난'][
                          e.charCodeAt(0) - 65
                        ],
                        ['Tall city', 'Windbreaks', 'Lightning', 'Meteors', 'Aether', 'Compound'][
                          e.charCodeAt(0) - 65
                        ],
                      )}
                    </button>
                  ))}
                </div>
              )}
              <label>
                {text('재난 종류', 'Hazard')}
                <select
                  aria-label={text('재난 종류', 'Hazard')}
                  value={d.config.kind}
                  onChange={(e) => patchConfig({ kind: e.target.value as Hazard })}
                >
                  {HAZARDS.map((k) => (
                    <option key={k} value={k}>
                      {hazardText[k][index]}
                    </option>
                  ))}
                </select>
              </label>
              {(['level', 'direction', 'wind', 'duration'] as const).map((field, i) => (
                <label key={field}>
                  {text(
                    ['등급', '방향 °', '풍속 m/s', '지속 초'][i],
                    ['Level', 'Direction °', 'Wind m/s', 'Duration s'][i],
                  )}
                  <input
                    type="number"
                    min={field === 'level' ? 1 : field === 'duration' ? 5 : 0}
                    max={
                      field === 'level'
                        ? 5
                        : field === 'direction'
                          ? 359
                          : field === 'wind'
                            ? 100
                            : 180
                    }
                    value={d.config[field]}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (
                        Number.isFinite(value) &&
                        value >= Number(e.target.min) &&
                        value <= Number(e.target.max)
                      )
                        patchConfig({ [field]: field === 'level' ? Math.round(value) : value });
                    }}
                  />
                </label>
              ))}
              <button onClick={() => patchConfig({ target: { ...g.cursor } })}>
                {text('현재 커서를 충돌 목표로', 'Use cursor as impact target')} ({g.cursor.x},
                {g.cursor.y ?? 0},{g.cursor.z})
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={d.defenses}
                  onChange={(e) =>
                    action((g) => ({
                      ...g,
                      disaster: { ...g.disaster!, defenses: e.target.checked },
                    }))
                  }
                />
                {text('방어시설 사용', 'Enable defenses')}
              </label>
              <button
                className="primary"
                disabled={d.phase === 'active'}
                onClick={() => {
                  action((g) =>
                    forecast(g, g.disaster!.config.kind, {
                      ...g.disaster!.config,
                      warning: d.mode === 'lab' ? 10 : 90,
                    }),
                  );
                  setOpen(false);
                }}
              >
                {text('예보 시작 · 재난 실행', 'Start forecast')}
              </button>
            </fieldset>
          )}
          {d.reward !== null && (
            <section className="wave-reward">
              <h3>
                WAVE {d.reward} COMPLETE · {d.score}pt
              </h3>
              <p>
                {text(
                  '다음 웨이브 성장 조건: 인구',
                  'Growth requirement for the next wave: population',
                )}{' '}
                {Math.floor(g.population)} / {growthTarget(g)}
              </p>
              {(['repair', 'energy', 'growth'] as const).map((c, i) => (
                <button
                  key={c}
                  disabled={g.population < growthTarget(g)}
                  onClick={() => action((g) => claimWave(g, c))}
                >
                  {text(
                    [
                      '복구: 자재 +100 · 크레딧 +150',
                      '에너지: 에테르 +25 · 크레딧 +150',
                      '성장: 식량·자재 +100 · 크레딧 +150',
                    ][i],
                    [
                      'Recovery: +100 materials, +150 credits',
                      'Energy: +25 aether, +150 credits',
                      'Growth: +100 food/materials, +150 credits',
                    ][i],
                  )}
                </button>
              ))}
            </section>
          )}
          {!!d.blueprints.length && (
            <section>
              <h3>{text('복구 설계도', 'Recovery blueprints')}</h3>
              <div className="recovery-list">
                {d.blueprints.map((b) => (
                  <button key={b.id} onClick={() => action((g) => rebuild(g, b.id))}>
                    {BLOCKS[b.piece.kind][lang]} · ({b.cell.x},{b.cell.y ?? 0},{b.cell.z})
                  </button>
                ))}
              </div>
              <small>
                {text(
                  '비용·지지·충돌 규칙을 만족해야 재건됩니다. 다른 블록으로 재설계하거나 이 구역을 포기할 수 있습니다.',
                  'Rebuilding requires cost, support and collision checks. You can redesign or abandon the area instead.',
                )}
              </small>
            </section>
          )}
          {d.reports
            .slice(-2)
            .reverse()
            .map((report) => (
              <section className="disaster-report" key={report.id}>
                <h3>
                  {hazardText[report.kind][index]} · {text('피해 보고', 'Damage report')}
                </h3>
                <p>
                  {text('손상 시설', 'Damaged facilities')} {report.damaged} ·{' '}
                  {text('붕괴 데크', 'Collapsed decks')} {report.collapsed} ·{' '}
                  {text('방어량', 'Absorbed')} {report.absorbed.toFixed(0)} ·{' '}
                  {text('대피 인원', 'Sheltered')} {report.evacuated.toFixed(0)}
                </p>
                <p>
                  {text('인구', 'Population')} {report.before.population.toFixed(0)} →{' '}
                  {report.after.population.toFixed(0)} · {text('안정도', 'Stability')}{' '}
                  {report.before.stability.toFixed(0)} → {report.after.stability.toFixed(0)} ·{' '}
                  {text('전력', 'Power')} {report.before.generation.toFixed(0)} →{' '}
                  {report.after.generation.toFixed(0)}
                </p>
                <p>
                  {text('예상 수리 자재', 'Estimated repair materials')} {report.repairCost}
                </p>
              </section>
            ))}
        </Dialog>
      )}
    </>
  );
}
