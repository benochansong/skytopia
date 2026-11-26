import { useState } from 'react';
import { useGame } from '../stores/gameStore';
import { BLOCKS, WORLD_KINDS } from '../data/rules';
import { CARGO_TYPES, SHIP_TYPES, SPECIALTIES } from '../types/world';
import type { CargoType, WorldState } from '../types/world';
import { changeWorld, syncWorld } from '../game/world/state';
import { loadWorld } from '../game/world/storage';
import {
  buildShip,
  cancelTrip,
  capitalTransfer,
  cargoStock,
  createRoute,
  dispatch,
  repairShip,
  availablePorts,
} from '../game/world/logistics';
import { regionNames, shipDefs, specialtyNames, technologies } from '../game/world/definitions';
import { startResearch } from '../game/world/research';
import { buildBridge, orderWorldFacility, specialize, worldReport } from '../game/world/management';
import { canUse } from '../game/campaign/runtime';
import { stage } from '../game/campaign/definitions';
import { campaignGoals } from '../game/campaign/objectives';
const resourceNames: Record<CargoType, [string, string]> = {
  food: ['식량', 'Food'],
  materials: ['자재', 'Materials'],
  aether: ['에테르', 'Aether'],
  metal: ['금속', 'Metal'],
  pureAether: ['고순도 에테르', 'Pure aether'],
  ancientAlloy: ['고대 합금', 'Ancient alloy'],
  data: ['연구 데이터', 'Research data'],
  passengers: ['승객', 'Passengers'],
};
const number = (n: number) => Math.floor(n).toLocaleString();
export function WorldEntry() {
  const s = useGame(),
    ko = s.settings.language === 'ko';
  const [hasWorld] = useState(() => loadWorld().ok);
  const [custom, setCustom] = useState<Partial<WorldState['config']>>({});
  const [seed, setSeed] = useState(70127),
    [preset, setPreset] = useState('normal'),
    [open, setOpen] = useState(false);
  return (
    <div className="world-entry">
      <button onClick={() => setOpen(!open)}>
        {ko ? '문명 모드 · 구름 너머' : 'Civilization · Beyond the Clouds'}
      </button>
      <button disabled={!hasWorld} onClick={() => s.startWorld({ resume: true })}>
        {ko ? '문명 이어하기' : 'Resume civilization'}
      </button>
      {open && (
        <div className="world-setup">
          <label>
            {ko ? '월드 시드' : 'World seed'}
            <input
              type="number"
              min="0"
              max="4294967295"
              value={seed}
              onChange={(e) => setSeed(Math.max(0, Number(e.target.value)) >>> 0)}
            />
          </label>
          <details>
            <summary>{ko ? '세부 월드 설정' : 'Custom world settings'}</summary>
            {(
              [
                ['maxCities', '최대 도시', 'City limit', 1, 6, 1, 6],
                ['size', '섬 개수', 'Island count', 12, 20, 1, 18],
                ['resources', '시작 자원 배율', 'Starting resources', 0.5, 2, 0.25, 1],
                [
                  'disasters',
                  '재난 빈도 · 0은 끄기',
                  'Disaster frequency · 0 disables',
                  0,
                  3,
                  0.5,
                  1,
                ],
                ['researchSpeed', '연구 속도', 'Research speed', 0.25, 4, 0.25, 1],
                ['tradeDifficulty', '교역 연료 배율', 'Trade fuel multiplier', 0.5, 2, 0.25, 1],
                [
                  'blockTime',
                  '활성 도시 블록 제한 초 · 0은 끄기',
                  'Active-city block seconds · 0 disables',
                  0,
                  120,
                  5,
                  0,
                ],
              ] as const
            ).map(([key, korean, english, min, max, step, fallback]) => (
              <label key={key}>
                {ko ? korean : english}
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={custom[key] ?? fallback}
                  onChange={(e) =>
                    setCustom((c) => ({
                      ...c,
                      [key]: Math.max(min, Math.min(max, Number(e.target.value))),
                    }))
                  }
                />
              </label>
            ))}
          </details>
          <label>
            {ko ? '설정' : 'Preset'}
            <select
              aria-label={ko ? '설정' : 'Preset'}
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
            >
              <option value="comfort">{ko ? '편안한 개척' : 'Comfort'}</option>
              <option value="normal">{ko ? '보통' : 'Normal'}</option>
              <option value="survival">{ko ? '생존' : 'Survival'}</option>
            </select>
          </label>
          <button
            onClick={() =>
              s.startWorld({
                seed,
                config: {
                  ...(preset === 'comfort'
                    ? { researchSpeed: 2, resources: 2, disasters: 0, tradeDifficulty: 0.5 }
                    : preset === 'survival'
                      ? {
                          researchSpeed: 0.75,
                          resources: 0.75,
                          disasters: 2,
                          tradeDifficulty: 1.5,
                          blockTime: 40,
                        }
                      : {}),
                  ...custom,
                },
              })
            }
          >
            {ko ? '새 문명 시작' : 'Start new civilization'}
          </button>
          <p>
            {ko
              ? '최대 6개 도시 · 18개 섬 · 물리 자원은 도시별 보관'
              : 'Up to 6 cities · 18 islands · physical stocks belong to each city'}
          </p>
        </div>
      )}
      {s.campaignSave.current?.campaign?.stage === 30 && s.campaignSave.current.campaign.result && (
        <button
          onClick={() => {
            useGame.setState({ game: s.campaignSave.current! });
            s.continueCity();
          }}
        >
          {ko ? '완성한 문명에서 계속하기' : 'Continue your completed civilization'}
        </button>
      )}
      <details>
        <summary>WORLD LAB</summary>
        <div className="world-buttons">
          {(['A', 'B', 'C', 'D', 'E'] as const).map((x) => (
            <button key={x} onClick={() => s.startWorld({ example: x })}>
              LAB {x}
            </button>
          ))}
        </div>
        <small>
          {ko
            ? '교역 / 단절 / 에테르 / 구호 / 특화 · 별도 저장, 기록 제외'
            : 'Trade / disruption / aether / rescue / specialty · separate saves, no records'}
        </small>
      </details>
    </div>
  );
}
export function WorldControls() {
  const s = useGame(),
    w = s.game.world,
    ko = s.settings.language === 'ko';
  if (!w)
    return s.game.city.enabled && (!s.game.campaign || s.game.campaign.result) ? (
      <button
        className="world-city-toggle panel"
        onClick={() => s.startWorld({ importCity: true })}
      >
        {ko ? '이 도시를 수도로 개척 시작' : 'Explore with this city as capital'}
      </button>
    ) : null;
  return (
    <div className="world-city-toggle panel">
      <button onClick={() => s.cityAction((g) => changeWorld(g, (w) => ({ ...w, view: 'map' })))}>
        {ko ? '세계 지도' : 'World map'} · {w.cities.length}
      </button>
      <span>{w.cities.find((c) => c.id === w.active)?.name}</span>
    </div>
  );
}
export default function WorldUI() {
  const s = useGame(),
    g = s.game,
    w = syncWorld(g),
    index = s.settings.language === 'ko' ? 0 : 1,
    ko = index === 0;
  const text = (a: string, b: string) => (ko ? a : b),
    action = s.cityAction;
  const [tab, setTab] = useState('map'),
    [islandId, setIsland] = useState(w.cities[0].island),
    [shipId, setShip] = useState(''),
    [destination, setDestination] = useState(''),
    [resource, setResource] = useState<CargoType>('food'),
    [amount, setAmount] = useState(40),
    [reserve, setReserve] = useState(40),
    [target, setTarget] = useState(250),
    [interval, setInterval] = useState(15),
    [priority, setPriority] = useState(1),
    [risk, setRisk] = useState(false),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const report = worldReport(g),
    goalStatus = g.campaign ? campaignGoals(g) : [],
    active = w.cities.find((c) => c.id === w.active)!,
    island = w.islands.find((i) => i.id === islandId)!,
    settled = w.cities.some((c) => c.island === islandId),
    ship = w.ships.find((s) => s.id === shipId);
  const location = (id: string) =>
    w.islands.find((i) => i.id === (w.cities.find((c) => c.id === id)?.island ?? id))!;
  const tabs = [
    ['map', '세계 지도', 'World map'],
    ['cities', '도시 관리', 'Cities'],
    ['fleet', '비공정', 'Fleet'],
    ['trade', '항로', 'Trade'],
    ['research', '연구', 'Research'],
    ['build', '세계 시설', 'Facilities'],
  ];
  const patch = (fn: Parameters<typeof changeWorld>[1]) => action((g) => changeWorld(g, fn));
  return (
    <section className="world-dashboard" aria-label={text('세계 관리', 'World management')}>
      <header className="world-header">
        <div>
          <small>SKYTOPIA · BEYOND THE CLOUDS</small>
          <input
            className="world-name"
            aria-label={text('문명 이름', 'Civilization name')}
            defaultValue={w.name}
            maxLength={60}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name) patch((w) => ({ ...w, name }));
            }}
          />
        </div>
        <div>
          <strong>
            {text('문명', 'Civilization')} {report.tier}/6
          </strong>
          <span>
            {number(report.population)} {text('명', 'people')} · {w.cities.length}/
            {w.config.maxCities} {text('도시', 'cities')} · {text('회복력', 'Resilience')}{' '}
            {report.score.toFixed(0)}
          </span>
        </div>
        <button onClick={() => s.save()}>{text('저장', 'Save')}</button>
        <button onClick={() => s.pause()}>{text('일시정지', 'Pause')}</button>
        <button onClick={() => s.switchWorldCity(w.active)}>{text('도시로', 'Enter city')}</button>
      </header>
      <nav className="world-tabs" aria-label={text('세계 메뉴', 'World navigation')}>
        {tabs.map(([id, ko, en]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {text(ko, en)}
          </button>
        ))}
      </nav>
      <div className="world-status">
        <span>
          {text('경과', 'Elapsed')} {Math.floor(w.clock)}s
        </span>
        <label>
          {text('속도', 'Speed')}
          <select
            aria-label={text('세계 속도', 'World speed')}
            value={g.city.speed}
            onChange={(e) =>
              action((g) => ({
                ...g,
                city: { ...g.city, speed: Number(e.target.value) as 0 | 1 | 2 | 3 },
              }))
            }
          >
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}×
              </option>
            ))}
          </select>
        </label>
        <span role="status">{w.notice && notice(w.notice, index)}</span>
        {w.mode === 'lab' && <b>LAB · {text('기록 제외', 'No achievements')}</b>}
      </div>
      {report.warnings.length > 0 && (
        <div className="world-warnings">
          {report.warnings.slice(0, 3).map((a) => (
            <button key={a.id} onClick={() => s.switchWorldCity(a.city)}>
              ⚠ {w.cities.find((c) => c.id === a.city)?.name} · {notice(a.kind, index)}
            </button>
          ))}
        </div>
      )}
      <div className="world-content">
        {g.campaign && !g.campaign.result && (
          <details className="world-card">
            <summary>
              {text('현재 미션 목표', 'Current mission objectives')} · {g.campaign.hold.toFixed(1)}{' '}
              / {stage(g.campaign.stage).hold}s
            </summary>
            <ul>
              {stage(g.campaign.stage).goals.map((goal, i) => (
                <li key={goal.id + i}>
                  {goalStatus[i] ? '✓ ' : '○ '}
                  {goal.text[s.settings.language]}
                </li>
              ))}
            </ul>
          </details>
        )}
        {tab === 'map' && (
          <div className="world-map-layout">
            <div className="world-map">
              <div className="world-map-tools">
                <button
                  aria-label={text('확대', 'Zoom in')}
                  onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                >
                  +
                </button>
                <button
                  aria-label={text('축소', 'Zoom out')}
                  onClick={() => setZoom(Math.max(0.6, zoom - 0.25))}
                >
                  −
                </button>
                <button
                  onClick={() => {
                    setPan({ x: 0, y: 0 });
                    setZoom(1);
                  }}
                >
                  {text('중앙', 'Center')}
                </button>
              </div>
              <svg
                viewBox={`${400 - 400 / zoom + pan.x} ${300 - 300 / zoom + pan.y} ${800 / zoom} ${600 / zoom}`}
                role="group"
                aria-label={text('발견된 섬과 비공정 항로', 'Islands and airship routes')}
                onPointerDown={(e) => {
                  if ((e.target as Element).tagName === 'svg') {
                    setDrag({ x: e.clientX, y: e.clientY });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }
                }}
                onPointerMove={(e) => {
                  if (drag) {
                    setPan((p) => ({
                      x: p.x - (e.clientX - drag.x) / zoom,
                      y: p.y - (e.clientY - drag.y) / zoom,
                    }));
                    setDrag({ x: e.clientX, y: e.clientY });
                  }
                }}
                onPointerUp={() => setDrag(null)}
              >
                <defs>
                  <radialGradient id="sky-map">
                    <stop stopColor="#254c61" />
                    <stop offset="1" stopColor="#0d202e" />
                  </radialGradient>
                </defs>
                <rect
                  x="-2000"
                  y="-2000"
                  width="4000"
                  height="4000"
                  fill="url(#sky-map)"
                  pointerEvents="none"
                />
                {w.routes.map((r) => {
                  const a = location(r.from),
                    b = location(r.to);
                  return (
                    <line
                      key={r.id}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={r.enabled ? '#76d5c8' : '#bb8c73'}
                      strokeDasharray="5 6"
                      opacity=".7"
                    />
                  );
                })}
                {w.bridges.map((b) => {
                  const a = location(b.from),
                    c = location(b.to);
                  return (
                    <line
                      key={b.id}
                      x1={a.x}
                      y1={a.y}
                      x2={c.x}
                      y2={c.y}
                      stroke={b.hp > 0 ? '#f0c77b' : '#80585a'}
                      strokeWidth="4"
                    />
                  );
                })}
                {w.islands.map((i) => {
                  const c = w.cities.find((c) => c.island === i.id);
                  return (
                    <g
                      key={i.id}
                      role="button"
                      tabIndex={0}
                      aria-label={i.discovered ? i.name : text('미확인 섬', 'Unknown island')}
                      onClick={() => {
                        setIsland(i.id);
                        if (i.discovered)
                          patch((w) => ({ ...w, inspected: [...new Set([...w.inspected, i.id])] }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setIsland(i.id);
                          if (i.discovered)
                            patch((w) => ({
                              ...w,
                              inspected: [...new Set([...w.inspected, i.id])],
                            }));
                        }
                      }}
                      className={i.id === islandId ? 'world-island selected' : 'world-island'}
                    >
                      <ellipse
                        cx={i.x}
                        cy={i.y + 9}
                        rx={i.radius}
                        ry={i.radius * 0.5}
                        fill="#081921"
                        opacity=".5"
                      />
                      <path
                        d={`M ${i.x - i.radius} ${i.y} L ${i.x} ${i.y + i.radius * 1.4} L ${i.x + i.radius} ${i.y} Z`}
                        fill={i.discovered ? '#596e75' : '#456475'}
                      />
                      <ellipse
                        cx={i.x}
                        cy={i.y}
                        rx={i.radius}
                        ry={i.radius * 0.5}
                        fill={
                          !i.discovered
                            ? '#718c9a'
                            : i.region === 'emerald'
                              ? '#70ab85'
                              : i.region === 'frozen'
                                ? '#c8e4eb'
                                : i.region === 'aether'
                                  ? '#9f8bc7'
                                  : '#a4b2a0'
                        }
                        stroke={i.id === islandId ? '#ffe5a8' : '#cadae0'}
                        strokeWidth={i.id === islandId ? 3 : 1}
                      />
                      <text x={i.x} y={i.y - 26} textAnchor="middle">
                        {c
                          ? `${c.id === w.capital ? '◆ ' : ''}${c.name}`
                          : i.discovered
                            ? regionNames[i.region][index]
                            : '?'}
                      </text>
                      {c && (
                        <text x={i.x} y={i.y + 5} textAnchor="middle" fill="#173038">
                          {number(c.game.population)}
                        </text>
                      )}
                    </g>
                  );
                })}
                {w.ships
                  .filter((s) => s.trip)
                  .map((s) => {
                    const t = s.trip!,
                      a = location(t.returning ? t.to : t.from),
                      b = location(t.returning ? t.from : t.to),
                      p = Math.min(1, t.progress / Math.max(1, t.distance));
                    return (
                      <g
                        key={s.id}
                        transform={`translate(${a.x + (b.x - a.x) * p} ${a.y + (b.y - a.y) * p})`}
                      >
                        <ellipse rx="7" ry="3" fill={s.type === 'rescue' ? '#ffa885' : '#ffe3a4'} />
                        <title>
                          {shipDefs[s.type].name[index]} · {notice(s.state, index)}
                        </title>
                      </g>
                    );
                  })}
              </svg>
              <p>
                {text(
                  '빈 하늘을 드래그하여 이동 · 구름 속 정보는 탐사 후 공개됩니다.',
                  'Drag empty sky to pan · island details are revealed by exploration.',
                )}
              </p>
            </div>
            <aside className="world-card">
              <small>{text('선택한 섬', 'Selected island')}</small>
              <h2>{island.discovered ? island.name : text('미확인 부유섬', 'Uncharted island')}</h2>
              {island.discovered ? (
                <>
                  <p>
                    {regionNames[island.region][index]} ·{' '}
                    {settled
                      ? text('정착 도시', 'Settled city')
                      : island.ruins
                        ? text('고대 유적', 'Ancient ruins')
                        : text('개척 가능', 'Colonizable')}
                  </p>
                  <dl>
                    <dt>{text('식량 / 광물 / 에테르', 'Food / minerals / aether')}</dt>
                    <dd>
                      {island.fertility} / {island.mineral} / {island.aether}
                    </dd>
                    <dt>{text('온도 / 위험', 'Temperature / risk')}</dt>
                    <dd>
                      {island.temperature}° · {(island.risk * 100).toFixed(0)}%
                    </dd>
                    <dt>{text('개척 화물', 'Colony cargo')}</dt>
                    <dd>
                      {island.colonyCost}{' '}
                      {text(
                        '자재 + 식량 30 + 에테르 10 + 시민 20 + 크레딧 150',
                        'materials + 30 food + 10 aether + 20 people + 150 credits',
                      )}
                    </dd>
                  </dl>
                </>
              ) : (
                <p>
                  {text(
                    '정찰선이나 탐사선을 보내 섬의 자원을 확인하세요.',
                    'Send a scout or explorer to reveal the island resources.',
                  )}
                </p>
              )}
              <label>
                {text('비공정 선택', 'Select airship')}
                <select
                  aria-label={text('탐사 비공정', 'Exploration airship')}
                  value={shipId}
                  onChange={(e) => setShip(e.target.value)}
                >
                  <option value="">—</option>
                  {w.ships
                    .filter((s) => s.state === 'docked')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {shipDefs[s.type].name[index]} · {s.id}
                      </option>
                    ))}
                </select>
              </label>
              <button
                disabled={!island.discovered || settled}
                onClick={() => patch((w) => ({ ...w, colonyTarget: island.id }))}
              >
                {w.colonyTarget === island.id
                  ? text('개척 후보로 선택됨', 'Selected colony target')
                  : text('개척 후보로 선택', 'Select colony target')}
              </button>
              <div className="world-buttons">
                <button
                  disabled={!ship}
                  onClick={() =>
                    action((g) =>
                      dispatch(g, {
                        ship: shipId,
                        to: island.id,
                        task: 'explore',
                        artifact: 'record',
                        allowRisk: risk,
                      }),
                    )
                  }
                >
                  {text('탐사·기록 후 귀환', 'Explore, record and return')}
                </button>
                <button
                  disabled={!ship || !island.ruins}
                  onClick={() =>
                    action((g) =>
                      dispatch(g, {
                        ship: shipId,
                        to: island.id,
                        task: 'explore',
                        artifact: 'recover',
                        allowRisk: risk,
                      }),
                    )
                  }
                >
                  {text('유물 회수 후 귀환', 'Recover artifact and return')}
                </button>
                <button
                  disabled={
                    !island.discovered ||
                    settled ||
                    ship?.type !== 'colony' ||
                    ship.state !== 'docked'
                  }
                  onClick={() =>
                    action((g) =>
                      dispatch(g, {
                        ship: shipId,
                        to: island.id,
                        task: 'colonize',
                        allowRisk: risk,
                      }),
                    )
                  }
                >
                  {text('개척선 파견', 'Found colony')}
                </button>
              </div>
              <label>
                <input type="checkbox" checked={risk} onChange={(e) => setRisk(e.target.checked)} />
                {text('위험 항로 허용', 'Allow dangerous route')}
              </label>
              {w.cities
                .filter((c) => c.island === island.id)
                .map((c) => (
                  <button key={c.id} onClick={() => s.switchWorldCity(c.id)}>
                    {text('도시 열기', 'Open city')}
                  </button>
                ))}
            </aside>
          </div>
        )}
        {tab === 'cities' && (
          <div className="world-grid">
            {report.cities.map(({ city: c, structure: a, economy: r, resilience }) => (
              <article className="world-card" key={c.id}>
                <input
                  aria-label={text('도시 이름', 'City name')}
                  defaultValue={c.name}
                  maxLength={60}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name)
                      patch((w) => ({
                        ...w,
                        cities: w.cities.map((x) => (x.id === c.id ? { ...x, name } : x)),
                      }));
                  }}
                />
                <small>
                  {regionNames[w.islands.find((i) => i.id === c.island)!.region][index]}{' '}
                  {c.id === w.capital ? '◆ CAPITAL' : ''}
                </small>
                <h2>
                  {number(c.game.population)} {text('명', 'people')}
                </h2>
                <p>
                  {text('안정도', 'Stability')} {a.stability.toFixed(0)} ·{' '}
                  {text('회복력', 'Resilience')} {resilience.toFixed(0)}
                </p>
                <p>
                  {text('전력 부족', 'Power deficit')} {r.deficit.toFixed(1)} ·{' '}
                  {text('식량 순생산', 'Net food')}{' '}
                  {(r.foodProduction - r.foodConsumption).toFixed(1)}/s
                </p>
                <p>
                  {CARGO_TYPES.filter((x) => x !== 'passengers')
                    .map((x) => `${resourceNames[x][index]} ${number(cargoStock(c, x))}`)
                    .join(' · ')}
                </p>
                <label>
                  {text('특화 변경 · 자재 10, 크레딧 50', 'Specialize · 10 materials, 50 credits')}
                  <select
                    value={c.specialty}
                    onChange={(e) =>
                      action((g) => specialize(g, c.id, e.target.value as typeof c.specialty))
                    }
                  >
                    {SPECIALTIES.map((x) => (
                      <option key={x} value={x}>
                        {specialtyNames[x][index]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="world-buttons">
                  <button onClick={() => s.switchWorldCity(c.id)}>
                    {text('도시 관리', 'Manage city')}
                  </button>
                  <button
                    disabled={c.id === w.capital}
                    onClick={() => action((g) => capitalTransfer(g, c.id))}
                  >
                    {text('수도 이전', 'Move capital')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {tab === 'fleet' && (
          <>
            <h2>
              {active.name} · {text('항구', 'Ports')} {availablePorts(g).length}
            </h2>
            <p>
              {text(
                '정찰·탐사선은 항구에서, 다른 선박은 조선소에서 건조합니다. 출항 시 왕복 연료를 실제 비축합니다.',
                'Scouts and explorers require a port; other ships require a shipyard. Round-trip fuel is reserved at departure.',
              )}
            </p>
            <div className="world-grid">
              {SHIP_TYPES.map((type) => {
                const d = shipDefs[type];
                return (
                  <article key={type} className="world-card">
                    <h3>{d.name[index]}</h3>
                    <p>
                      {text('적재', 'Cargo')} {d.capacity} · {text('속도', 'Speed')} {d.speed}× ·{' '}
                      {text('항속', 'Range')} {d.range}
                    </p>
                    <p>
                      {d.cost} {text('자재', 'materials')} / {d.aether} {text('에테르', 'aether')} /{' '}
                      {d.cost * 2} {text('크레딧', 'credits')} / {d.seconds}s
                      {(type === 'heavyCargo' || type === 'research') &&
                        ` / ${type === 'heavyCargo' ? 20 : 10} ${text('금속', 'metal')}`}
                    </p>
                    <button onClick={() => action((g) => buildShip(g, type))}>
                      {text('건조', 'Build')}
                    </button>
                  </article>
                );
              })}
            </div>
            <h2>{text('보유 비공정', 'Fleet')}</h2>
            <div className="world-grid">
              {w.ships.map((s) => (
                <article className="world-card" key={s.id}>
                  <h3>
                    {shipDefs[s.type].name[index]} · {s.id}
                  </h3>
                  <p>
                    {notice(s.state, index)} · HP {s.hp.toFixed(0)} · {text('연료', 'Fuel')}{' '}
                    {s.fuel.toFixed(1)}
                  </p>
                  <p>
                    {Object.entries(s.cargo)
                      .map(([r, n]) => `${resourceNames[r as CargoType][index]} ${n.toFixed(1)}`)
                      .join(' · ') || text('빈 적재함', 'Empty hold')}
                  </p>
                  {s.trip && <progress value={s.trip.progress} max={s.trip.distance} />}
                  <button disabled={!s.trip} onClick={() => action((g) => cancelTrip(g, s.id))}>
                    {text('귀항 · 화물 유지', 'Return with cargo')}
                  </button>
                  <button
                    disabled={s.state !== 'docked' || s.hp >= 100}
                    onClick={() => action((g) => repairShip(g, s.id))}
                  >
                    {text('정비소에서 수리', 'Repair at maintenance yard')}
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
        {tab === 'trade' && (
          <>
            <div className="world-card">
              <h2>
                {text('실물 운송 · 출발 도시', 'Physical freight · origin')} {active.name}
              </h2>
              <div className="world-form">
                <label>
                  {text('선박', 'Ship')}
                  <select
                    aria-label={text('선박', 'Ship')}
                    value={shipId}
                    onChange={(e) => setShip(e.target.value)}
                  >
                    <option value="">—</option>
                    {w.ships
                      .filter((s) => s.location === active.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {shipDefs[s.type].name[index]} {s.id}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {text('목적지', 'Destination')}
                  <select
                    aria-label={text('목적지', 'Destination')}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    <option value="">—</option>
                    {w.cities
                      .filter((c) => c.id !== active.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {text('자원', 'Resource')}
                  <select
                    aria-label={text('자원', 'Resource')}
                    value={resource}
                    onChange={(e) => setResource(e.target.value as CargoType)}
                  >
                    {CARGO_TYPES.map((x) => (
                      <option key={x} value={x}>
                        {resourceNames[x][index]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {text('최대 적재', 'Maximum load')}
                  <input
                    type="number"
                    min="1"
                    max="250"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                  />
                </label>
                <label>
                  {text('최소 비축', 'Minimum reserve')}
                  <input
                    type="number"
                    min="0"
                    value={reserve}
                    onChange={(e) => setReserve(Number(e.target.value))}
                  />
                </label>
                <label>
                  {text('목표 재고', 'Target stock')}
                  <input
                    type="number"
                    min="0"
                    value={target}
                    onChange={(e) => setTarget(Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="world-form">
                <label>
                  {text('운항 간격 초', 'Departure interval')}
                  <input
                    type="number"
                    min="1"
                    max="3600"
                    value={interval}
                    onChange={(e) => setInterval(Math.max(1, Number(e.target.value)))}
                  />
                </label>
                <label>
                  {text('우선순위 · 낮을수록 우선', 'Priority · lower first')}
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={priority}
                    onChange={(e) =>
                      setPriority(Math.max(0, Math.min(10, Math.round(Number(e.target.value)))))
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={risk}
                    onChange={(e) => setRisk(e.target.checked)}
                  />
                  {text('위험 항로 허용', 'Allow dangerous routes')}
                </label>
              </div>
              <div className="world-buttons">
                <button
                  disabled={!shipId || !destination}
                  onClick={() =>
                    action((g) =>
                      createRoute(g, {
                        from: active.id,
                        to: destination,
                        ship: shipId,
                        resource,
                        amount,
                        reserve,
                        target,
                        interval,
                        priority,
                        allowRisk: risk,
                        enabled: true,
                      }),
                    )
                  }
                >
                  {text('자동 항로 만들기', 'Create automatic route')}
                </button>
                <button
                  disabled={!shipId || !destination}
                  onClick={() =>
                    action((g) =>
                      dispatch(g, {
                        ship: shipId,
                        to: destination,
                        task:
                          resource === 'passengers'
                            ? 'passengers'
                            : ship?.type === 'rescue'
                              ? 'rescue'
                              : 'trade',
                        cargo: { [resource]: amount },
                        allowRisk: risk,
                      }),
                    )
                  }
                >
                  {text('한 번 운송', 'Send one shipment')}
                </button>
                <button
                  disabled={!destination}
                  onClick={() => action((g) => buildBridge(g, destination, resource))}
                >
                  {text('하늘 교량 연결', 'Build skybridge')}
                </button>
              </div>
              <p>
                {text(
                  '교량: 거리 150 이하, 양쪽 앵커·안정도 80, 도시마다 자재 120·에테르 15·크레딧 150.',
                  'Bridge: distance ≤150, two anchors, stability 80; 120 materials, 15 aether and 150 credits per city.',
                )}
              </p>
            </div>
            <div className="world-grid">
              {w.routes.map((r) => (
                <article key={r.id} className="world-card">
                  <h3>
                    {w.cities.find((c) => c.id === r.from)?.name} →{' '}
                    {w.cities.find((c) => c.id === r.to)?.name}
                  </h3>
                  <p>
                    {resourceNames[r.resource][index]} · {text('실제 배송', 'Delivered')}{' '}
                    {number(r.delivered)}
                  </p>
                  <button
                    onClick={() =>
                      patch((w) => ({
                        ...w,
                        routes: w.routes.map((x) =>
                          x.id === r.id ? { ...x, enabled: !x.enabled } : x,
                        ),
                      }))
                    }
                  >
                    {r.enabled
                      ? text('항로 중지', 'Pause route')
                      : text('항로 재개', 'Resume route')}
                  </button>
                </article>
              ))}
            </div>
            <h3>{text('최근 도착 기록', 'Recent receipts')}</h3>
            {w.ledger
              .slice(-8)
              .reverse()
              .map((l) => (
                <p key={l.id}>
                  {Math.floor(l.time)}s · {resourceNames[l.resource][index]} {number(l.amount)} →{' '}
                  {w.cities.find((c) => c.id === l.to)?.name}
                </p>
              ))}
          </>
        )}
        {tab === 'research' && (
          <>
            <h2>
              RP {w.research.points.toFixed(1)} ·{' '}
              {text('활성 연구소에서 생산', 'Produced by working laboratories')}
            </h2>
            {w.research.active && (
              <p>
                {technologies.find((t) => t.id === w.research.active!.id)?.name[index]} ·{' '}
                {w.research.active.remaining.toFixed(0)}s
              </p>
            )}
            <div className="world-grid">
              {technologies.map((t) => (
                <article className="world-card" key={t.id}>
                  <small>{t.field}</small>
                  <h3>{t.name[index]}</h3>
                  <p>{t.description[index]}</p>
                  <p>
                    {t.points} RP · {t.materials} {text('자재', 'materials')} · {t.aether}{' '}
                    {text('에테르', 'aether')} · {t.data} DATA · {t.seconds}s
                  </p>
                  <button
                    disabled={
                      !!w.research.active ||
                      w.research.completed.includes(t.id) ||
                      (!!t.prerequisite && !w.research.completed.includes(t.prerequisite))
                    }
                    onClick={() => action((g) => startResearch(g, t.id))}
                  >
                    {w.research.completed.includes(t.id)
                      ? text('완료', 'Completed')
                      : text('연구 시작', 'Start research')}
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
        {tab === 'build' && (
          <>
            <h2>
              {active.name} · {text('세계 시설', 'World facilities')}
            </h2>
            <p>
              {text(
                '시설을 선택하면 도시로 이동합니다. 배치할 때 자재와 크레딧을 지불합니다. 항구의 전면 접근 공간과 도로·전력을 확보하세요.',
                'Choose a facility, then place it in your city. Construction consumes materials and credits. Ports need a clear front approach, roads and power.',
              )}
            </p>
            <div className="world-grid">
              {WORLD_KINDS.map((kind) => (
                <article className="world-card" key={kind}>
                  <h3>{BLOCKS[kind][ko ? 'ko' : 'en']}</h3>
                  <p>
                    {text('무게', 'Mass')} {BLOCKS[kind].mass} · {text('전력', 'Power')}{' '}
                    {BLOCKS[kind].demand}
                  </p>
                  <button
                    disabled={!canUse(g, kind)}
                    onClick={() => {
                      action((g) => orderWorldFacility(g, kind));
                      s.switchWorldCity(w.active);
                    }}
                  >
                    {text('설계도 선택', 'Select blueprint')}
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
function notice(id: string, index: number) {
  const t: Record<string, [string, string]> = {
    shipRequirements: [
      '항구·조선소·연구 조건을 확인하세요.',
      'Check port, shipyard and research requirements.',
    ],
    resources: ['자원이 부족합니다.', 'Insufficient resources.'],
    shipBuilding: ['비공정 건조를 시작했습니다.', 'Airship construction started.'],
    departing: ['출항 준비', 'Preparing departure'],
    dispatchRequirements: [
      '선박 상태, 항구, 연료, 거리와 화물을 확인하세요.',
      'Check ship state, ports, fuel, range and cargo.',
    ],
    researchRequirements: [
      '연구소, 선행 기술, RP와 데이터를 확인하세요.',
      'Check laboratory, prerequisites, RP and data.',
    ],
    researchComplete: ['연구 완료', 'Research complete'],
    routeCreated: ['자동 항로 생성', 'Automatic route created'],
    islandDiscovered: ['탐사 완료 · 귀환 중', 'Exploration complete · returning'],
    colonyFounded: ['새 도시가 설립되었습니다.', 'A new colony has been founded.'],
    nexusRequirements: [
      '문명 5단계, 수도 안정도 80, 분산 코어 연구, 고순도 에테르·고대 합금 각각 20 필요',
      'Requires tier 5, capital stability 80, distributed cores, 20 pure aether and 20 ancient alloy.',
    ],
    docked: ['정박', 'Docked'],
    loading: ['적재', 'Loading'],
    sailing: ['항해', 'Sailing'],
    avoiding: ['위험 회피 대기', 'Avoiding danger'],
    approach: ['접근', 'Approaching'],
    unloading: ['하역 대기', 'Unloading'],
    repairing: ['수리', 'Repairing'],
    returning: ['귀항', 'Returning'],
    building: ['건조', 'Building'],
    food: ['식량 부족', 'Food shortage'],
    power: ['전력 부족', 'Power shortage'],
    structure: ['구조 위험', 'Structural risk'],
    roads: ['연결 단절', 'Disconnected'],
    workers: ['일손 부족', 'Worker shortage'],
    shelter: ['주거 부족', 'Housing shortage'],
    storage: ['창고 용량 부족', 'Storage capacity'],
    credits: ['운영 자금 부족', 'Low operating funds'],
    happiness: ['행복도 저하', 'Low happiness'],
    worldStorm: ['재난 진행 중', 'Active disaster'],
    worldForecast: ['재난 예보', 'Disaster forecast'],
    worldFreight: ['항로 대기 중', 'Freight delayed'],
  };
  return t[id]?.[index] ?? id;
}
