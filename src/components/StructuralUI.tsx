import { isLink } from '../game/vertical/geometry';
import { useMemo, useState } from 'react';
import { useGame } from '../stores/gameStore';
import type { AnalysisMode } from '../stores/gameStore';
import { BLOCKS, KINDS, PHYSICAL, DIFFICULTIES, STRUCTURE } from '../data/rules';
import { MISSIONS, LAB_EXAMPLES } from '../data/missions';
import { P2, EVENT_TEXT } from '../locales/phase2';
import { TEXT } from '../locales/text';
import { analyze } from '../game/analysis';
import { projectPlacement } from '../game/building';
import { validatePlacement } from '../game/placement';
import {
  costFor,
  targetInfo,
  demolitionPreview,
  EMERGENCY_KINDS,
} from '../game/repair/maintenance';
import { key } from '../game/grid';
import type { Game, Target } from '../types/game';
import { Dialog, clockText } from './Interface';
export function Phase2Menu() {
  const lang = useGame((s) => s.settings.language),
    hasLab = useGame((s) => s.hasLabSave),
    hasSave = useGame((s) => s.hasSave),
    t = P2[lang];
  const [open, setOpen] = useState<'campaign' | 'lab' | null>(null),
    [pending, setPending] = useState<{
      mode: Game['mode'];
      mission: Game['missionId'];
      example: Game['labExample'];
    } | null>(null);
  const begin = (
    mode: Game['mode'],
    mission: Game['missionId'] = 1,
    example: Game['labExample'] = 'A',
  ) => {
    if (mode === 'lab' ? hasLab : hasSave) setPending({ mode, mission, example });
    else useGame.getState().start(mode, mission, example);
  };
  return (
    <>
      <button onClick={() => setOpen('campaign')}>
        {t.campaign}
        <span className="tag">01 — 09</span>
      </button>
      <button onClick={() => setOpen('lab')}>
        {t.lab}
        <span className="tag">LAB</span>
      </button>
      {open ? (
        <Dialog title={open === 'campaign' ? t.campaign : t.lab} onClose={() => setOpen(null)} wide>
          <div className="scenario-grid">
            {open === 'campaign'
              ? ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((id) => (
                  <button key={id} onClick={() => begin('mission', id)}>
                    <small>MISSION 0{id}</small>
                    <strong>{MISSIONS[id][lang]}</strong>
                    <span>{MISSIONS[id].subtitle}</span>
                  </button>
                ))
              : (['A', 'B', 'C', 'D'] as const).map((id) => (
                  <button key={id} onClick={() => begin('lab', 1, id)}>
                    <small>EXPERIMENT {id}</small>
                    <strong>{LAB_EXAMPLES[id][lang]}</strong>
                    <span>{LAB_EXAMPLES[id][lang === 'ko' ? 'hintKo' : 'hintEn']}</span>
                  </button>
                ))}
          </div>
          {open === 'lab' ? (
            <button
              className="full"
              disabled={!hasLab}
              onClick={() => useGame.getState().resume('lab')}
            >
              {t.loadLab}
            </button>
          ) : null}
        </Dialog>
      ) : null}
      {pending ? (
        <Dialog title={TEXT[lang].replaceTitle} onClose={() => setPending(null)}>
          <p>{TEXT[lang].replaceHint}</p>
          <div className="dialog-actions">
            <button onClick={() => setPending(null)}>{t.cancel}</button>
            <button
              className="primary"
              onClick={() =>
                useGame.getState().start(pending.mode, pending.mission, pending.example)
              }
            >
              {TEXT[lang].begin}
            </button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
export function AnalysisToolbar() {
  const lang = useGame((s) => s.settings.language),
    analysis = useGame((s) => s.analysisMode),
    tool = useGame((s) => s.toolMode),
    t = P2[lang];
  return (
    <div className="analysis-toolbar panel">
      <button onClick={() => useGame.getState().cycleAnalysis()} title="Tab">
        ◈ {t.analysis}
      </button>
      <select
        aria-label={t.analysis}
        value={analysis}
        onChange={(e) => useGame.setState({ analysisMode: e.target.value as AnalysisMode })}
      >
        {(
          [
            'off',
            'load',
            'lift',
            'center',
            'durability',
            'connections',
            'power',
            'food',
            'happiness',
            'logistics',
            'economy',
          ] as const
        ).map((m) => (
          <option key={m} value={m}>
            {m in t
              ? t[m as keyof typeof t]
              : (
                  {
                    power: lang === 'ko' ? '전력망' : 'Power',
                    food: lang === 'ko' ? '식량' : 'Food',
                    happiness: lang === 'ko' ? '주거 환경' : 'Happiness',
                    logistics: lang === 'ko' ? '물류' : 'Logistics',
                    economy: lang === 'ko' ? '운영 효율' : 'Efficiency',
                  } as Record<string, string>
                )[m]}
          </option>
        ))}
      </select>
      <button
        className={tool === 'inspect' ? 'selected' : ''}
        aria-pressed={tool === 'inspect'}
        onClick={() => useGame.setState({ toolMode: tool === 'build' ? 'inspect' : 'build' })}
      >
        {tool === 'build' ? t.inspect : t.build}
      </button>
      {analysis !== 'off' ? (
        <small className="analysis-legend">
          {['power', 'food', 'happiness', 'logistics', 'economy'].includes(analysis)
            ? lang === 'ko'
              ? analysis === 'power'
                ? '금색 · 전력선 / 초록 · 정상 공급'
                : analysis === 'logistics'
                  ? '청록 · 도로 물류 / 빨강 · 단절'
                  : '초록 · 양호 / 노랑 · 부분 / 빨강 · 부족'
              : analysis === 'power'
                ? 'Gold: grid / green: supplied'
                : analysis === 'logistics'
                  ? 'Cyan: logistics / red: disconnected'
                  : 'Green: healthy / yellow: partial / red: shortage'
            : analysis === 'center'
              ? lang === 'ko'
                ? '금색 · 무게중심 / 청록 · 부양 중심'
                : 'Gold · mass center / Cyan · lift center'
              : analysis === 'lift'
                ? lang === 'ko'
                  ? '화살표 · 실제 출력 / 원 · 국소 지원 범위'
                  : 'Arrow · effective output / Ring · local support'
                : analysis === 'durability'
                  ? lang === 'ko'
                    ? '파랑 · 정상 / 빨강 · 심한 손상'
                    : 'Blue · healthy / Red · damaged'
                  : lang === 'ko'
                    ? '파랑 → 초록 → 노랑 → 주황 → 빨강 · 하중 증가'
                    : 'Blue → green → yellow → orange → red · increasing load'}
        </small>
      ) : null}
    </div>
  );
}
export function LabPanel() {
  const g = useGame((s) => s.game),
    lang = useGame((s) => s.settings.language),
    t = P2[lang];
  return (
    <section className="lab-panel panel">
      <span className="eyebrow">
        EXPERIMENT {g.labExample} · {t.unlimited}
      </span>
      <p>{LAB_EXAMPLES[g.labExample][lang === 'ko' ? 'hintKo' : 'hintEn']}</p>
      <button className="primary full" onClick={() => useGame.getState().toggleLabTime()}>
        {g.labPaused ? t.resumeTime : t.pauseTime}
      </button>
      <button className="text-button" onClick={() => useGame.getState().resetLab()}>
        {t.resetLab}
      </button>
      <h3>{t.labBlueprints}</h3>
      <div className="blueprint-grid">
        {KINDS.map((kind) => (
          <button
            key={kind}
            className={g.active.kind === kind ? 'selected' : ''}
            onClick={() => useGame.getState().blueprint(kind)}
          >
            {BLOCKS[kind][lang]}
          </button>
        ))}
      </div>
    </section>
  );
}
export function StructuralPanel() {
  const g = useGame((s) => s.game),
    lang = useGame((s) => s.settings.language),
    selected = useGame((s) => s.selected),
    balance = useGame((s) => s.balanceVisible),
    t = P2[lang];
  const [demolition, setDemolition] = useState<Target | null>(null);
  const stats = analyze(g),
    r = stats.structural,
    valid = validatePlacement(g);
  const prediction = useMemo(
    () => (validatePlacement(g).valid ? analyze(projectPlacement(g)) : null),
    [
      g.active,
      g.cursor,
      g.platforms,
      g.buildings,
      g.structure.edges,
      g.structure.lifts,
      g.structure.emergency,
      g.structure.coreDurability,
      g.reservedActive,
      g.resources,
    ],
  );
  const info = selected ? targetInfo(g, selected) : null;
  const warning = r.critical || (r.worst && r.worst.ratio > 1);
  const advice =
    r.critical === 'core'
      ? t.adviceCore
      : r.critical === 'lift'
        ? t.adviceLift
        : r.worst && r.worst.ratio > 1
          ? t.adviceStructure
          : t.adviceBalance;
  const inspectCell = info?.cell;
  const nearEdges = inspectCell
    ? [...r.edges.values()].filter((e) => e.a === key(inspectCell) || e.b === key(inspectCell))
    : [];
  const afterDemolition = demolition ? analyze(demolitionPreview(g, demolition)) : null;
  return (
    <section className="stability-card structural-panel panel">
      <div className="section-label">
        ◈ {TEXT[lang].stability}
        <strong>{Math.round(r.overall)}%</strong>
      </div>
      <div className="stability-breakdown">
        {[
          [t.liftScore, r.liftScore],
          [t.balanceScore, r.balanceScore],
          [t.structureScore, r.structureScore],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <b>{Math.round(Number(value))}%</b>
            <meter min={0} max={100} value={Number(value)} />
          </div>
        ))}
      </div>
      <dl className="city-stats">
        <div>
          <dt>{TEXT[lang].mass}</dt>
          <dd>{r.mass.toFixed(0)}t</dd>
        </div>
        <div>
          <dt>{t.lift}</dt>
          <dd>{r.lift.toFixed(0)}t</dd>
        </div>
        <div>
          <dt>{t.reserve}</dt>
          <dd className={r.lift < r.mass ? 'warning-text' : ''}>{(r.lift - r.mass).toFixed(0)}t</dd>
        </div>
        <div>
          <dt>{t.tilt}</dt>
          <dd>{Math.hypot(r.tilt.x, r.tilt.z).toFixed(1)}°</dd>
        </div>
        <div>
          <dt>{t.damaged}</dt>
          <dd>{r.damaged}</dd>
        </div>
      </dl>
      <button
        className={`balance-toggle ${balance ? 'selected' : ''}`}
        aria-pressed={balance}
        onClick={() => {
          useGame.setState({ balanceVisible: !balance });
          useGame.getState().tutorialEvent('balance');
        }}
      >
        {TEXT[lang].balance}
      </button>
      {warning ? (
        <div className="emergency-alert" role="status">
          <strong>⚠ {t.warning}</strong>
          <p>{advice}</p>
          {r.worst ? (
            <>
              <span>
                {r.worst.id} · {Math.round(r.worst.ratio * 100)}% · HP {r.worst.hp.toFixed(0)}
              </span>
              <span>
                {t.eta}:{' '}
                {Number.isFinite(r.worst.eta) ? `${r.worst.eta.toFixed(1)}${t.seconds}` : '—'}
              </span>
              <button
                onClick={() => {
                  useGame.getState().focus(r.worst!.cell);
                  useGame.getState().selectTarget({ type: r.worst!.type, id: r.worst!.id });
                }}
              >
                {t.focus}
              </button>
            </>
          ) : null}
          {r.critical ? (
            <span>
              {t.grace}:{' '}
              {Math.max(
                0,
                g.structure.grace + DIFFICULTIES[g.difficulty].grace - g.structure.criticalTime,
              ).toFixed(1)}
              s
            </span>
          ) : null}
          {g.mode === 'training' && r.critical ? <p>{t.tutorialFreeze}</p> : null}
        </div>
      ) : null}
      <details open={g.mode === 'lab'}>
        <summary>{t.preview}</summary>
        {prediction && valid.valid ? (
          <dl className="compact-stats">
            <div>
              <dt>{t.addedMass}</dt>
              <dd>+{(prediction.mass - stats.mass).toFixed(1)}t</dd>
            </div>
            <div>
              <dt>{TEXT[lang].mass}</dt>
              <dd>{prediction.mass.toFixed(0)}t</dd>
            </div>
            <div>
              <dt>{t.expectedLift}</dt>
              <dd>{prediction.lift.toFixed(0)}t</dd>
            </div>
            <div>
              <dt>{t.expectedStability}</dt>
              <dd>
                {stats.stability.toFixed(0)} → {prediction.stability.toFixed(0)}%
              </dd>
            </div>
            <div>
              <dt>{t.expectedPower}</dt>
              <dd>
                {prediction.power.toFixed(0)} / {prediction.demand}
              </dd>
            </div>
            <div>
              <dt>{t.center}</dt>
              <dd>
                {prediction.center.x.toFixed(2)}, {prediction.center.z.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>{t.riskTiles}</dt>
              <dd>
                {[...prediction.structural.nodes.values()]
                  .filter((n) => n.ratio > 1)
                  .map((n) => n.key)
                  .join(' · ') || '—'}
              </dd>
            </div>
            <div>
              <dt>{t.worstEdge}</dt>
              <dd>
                {Math.round(
                  Math.max(0, ...[...prediction.structural.edges.values()].map((e) => e.ratio)) *
                    100,
                )}
                %
              </dd>
            </div>
          </dl>
        ) : (
          <p>{TEXT[lang][valid.reason]}</p>
        )}
      </details>
      <details open={!!selected}>
        <summary>{t.inspect}</summary>
        {selected && info ? (
          <>
            <div className="selected-label">
              {t[selected.type]} {selected.id}
            </div>
            <p>
              HP {info.hp.toFixed(0)} / {info.maxHP} · {t.reinforce} {info.reinforcement}
            </p>
            {selected.type === 'building' ? (
              <button
                onClick={() =>
                  useGame.getState().selectTarget({ type: 'platform', id: key(info.cell) })
                }
              >
                {t.platform} {key(info.cell)}
              </button>
            ) : null}
            <div className="maintenance-actions">
              <button
                disabled={
                  info.hp >= info.maxHP ||
                  g.structure.repairs.some(
                    (r) => r.target.id === selected.id && r.target.type === selected.type,
                  ) ||
                  g.resources < costFor(g, info.cost)
                }
                onClick={() => useGame.getState().maintain('repair')}
              >
                {t.repair} <small>{costFor(g, info.cost)}</small>
              </button>
              {selected.type !== 'building' ||
              g.buildings.some((b) => String(b.id) === selected.id && isLink(b)) ? (
                <button
                  disabled={
                    info.reinforcement >= 3 ||
                    info.hp <= 0 ||
                    g.resources < costFor(g, PHYSICAL.brace.cost)
                  }
                  onClick={() => useGame.getState().maintain('reinforce')}
                >
                  {t.reinforce} <small>{costFor(g, PHYSICAL.brace.cost)}</small>
                </button>
              ) : (
                <button onClick={() => setDemolition(selected)}>{t.demolish}</button>
              )}
            </div>
            {g.structure.repairs
              .filter((job) => job.target.id === selected.id && job.target.type === selected.type)
              .map((job) => (
                <p key={job.target.id}>
                  {t.repairing} · {job.remaining.toFixed(1)}s
                </p>
              ))}
            {nearEdges.length ? (
              <div className="edge-selector">
                {nearEdges.map((e) => (
                  <button
                    key={e.key}
                    onClick={() => useGame.getState().selectTarget({ type: 'edge', id: e.key })}
                  >
                    {e.key}{' '}
                    <small>
                      {Math.round(e.ratio * 100)}% / HP {e.hp.toFixed(0)}
                    </small>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p>{t.selectHint}</p>
        )}
      </details>
      <details>
        <summary>{t.emergency}</summary>
        <button
          className="full"
          disabled={
            g.structure.emergency.cooldown > 0 || g.resources < costFor(g, STRUCTURE.emergencyCost)
          }
          onClick={() => useGame.getState().emergency()}
        >
          {t.temporaryLift} +140t · {costFor(g, STRUCTURE.emergencyCost)}
        </button>
        <p>
          {g.structure.emergency.remaining > 0
            ? `${g.structure.emergency.remaining.toFixed(1)}s · `
            : ''}
          {t.cooldown} {g.structure.emergency.cooldown.toFixed(0)}s
        </p>
        <h3>{t.blueprints}</h3>
        <p>{t.affordable}</p>
        <div className="blueprint-grid">
          {EMERGENCY_KINDS.map((kind) => (
            <button key={kind} onClick={() => useGame.getState().blueprint(kind)}>
              {BLOCKS[kind][lang]}
              <small>{costFor(g, PHYSICAL[kind].cost)}</small>
            </button>
          ))}
        </div>
        {g.reservedActive ? (
          <button className="full" onClick={() => useGame.getState().recycle()}>
            {t.cancelBlueprint}
          </button>
        ) : null}
      </details>
      <details>
        <summary>
          {t.liftDevices} ({r.lifts.length})
        </summary>
        <p>{t.powerGrace}</p>
        {r.lifts.map((l) => (
          <div className="lift-row" key={l.id}>
            <strong>{l.id === -1 ? t.temporaryLift : `#${l.id}`}</strong>
            <span>
              {l.output.toFixed(0)} / {(l.maximum * l.desired).toFixed(0)}t
            </span>
            {l.id >= 0 ? (
              <button onClick={() => useGame.getState().toggleLift(l.id)}>
                {g.buildings.find((b) => b.id === l.id)?.enabled ? t.switchOff : t.switchOn}
              </button>
            ) : null}
          </div>
        ))}
      </details>
      <details>
        <summary>{t.chain}</summary>
        <ol className="event-log">
          {g.structure.events
            .slice(-8)
            .reverse()
            .map((e) => (
              <li key={e.id}>
                <span>{clockText(e.time)}</span> {EVENT_TEXT[lang][e.kind]}{' '}
                <small>{e.target}</small>
              </li>
            ))}
        </ol>
      </details>
      {demolition && afterDemolition ? (
        <Dialog title={t.demolition} onClose={() => setDemolition(null)}>
          <p>{t.demolitionHint}</p>
          <dl className="city-stats">
            <div>
              <dt>{TEXT[lang].stability}</dt>
              <dd>
                {stats.stability.toFixed(0)} → {afterDemolition.stability.toFixed(0)}%
              </dd>
            </div>
            <div>
              <dt>{TEXT[lang].power}</dt>
              <dd>
                {stats.power.toFixed(0)} → {afterDemolition.power.toFixed(0)}
              </dd>
            </div>
            <div>
              <dt>{t.lift}</dt>
              <dd>
                {stats.lift.toFixed(0)} → {afterDemolition.lift.toFixed(0)}
              </dd>
            </div>
            <div>
              <dt>{TEXT[lang].population}</dt>
              <dd>
                {Math.floor(g.population)} →{' '}
                {Math.floor(demolitionPreview(g, demolition).population)}
              </dd>
            </div>
          </dl>
          <div className="dialog-actions">
            <button onClick={() => setDemolition(null)}>{t.cancel}</button>
            <button
              className="primary"
              onClick={() => {
                useGame.getState().maintain('demolish', demolition);
                setDemolition(null);
              }}
            >
              {t.confirm}
            </button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
export function GameOver() {
  const g = useGame((s) => s.game),
    lang = useGame((s) => s.settings.language),
    t = P2[lang],
    stats = analyze(g),
    loss = g.structure.loss;
  return (
    <Dialog title={t.failure} wide>
      <p>
        {t.cause}:{' '}
        {loss?.reason === 'lift'
          ? t.causeLift
          : loss?.reason === 'core'
            ? t.causeCore
            : t.causeBalance}
      </p>
      <p>
        {t.firstFailure}: {loss?.firstFailure}
      </p>
      <div className="victory-stats">
        {[
          [TEXT[lang].population, Math.floor(g.population)],
          [t.maxCity, g.structure.maxCitySize],
          [t.survival, clockText(g.elapsed)],
          [TEXT[lang].stability, `${Math.round(stats.stability)}%`],
          [TEXT[lang].expansion, g.platforms.length],
          [t.damaged, g.structure.collapsedCount],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <ol className="event-log">
        {g.structure.events.slice(-6).map((e) => (
          <li key={e.id}>
            {clockText(e.time)} · {EVENT_TEXT[lang][e.kind]} · {e.target}
          </li>
        ))}
      </ol>
      <p>
        {loss?.reason === 'lift'
          ? t.adviceLift
          : loss?.reason === 'core'
            ? t.adviceCore
            : t.adviceBalance}
      </p>
      <div className="dialog-actions">
        <button onClick={() => useGame.getState().setScreen('menu')}>{t.menu}</button>
        <button
          className="primary"
          onClick={() => useGame.getState().start(g.mode, g.missionId, g.labExample)}
        >
          {t.retry}
        </button>
      </div>
    </Dialog>
  );
}
