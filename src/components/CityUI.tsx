import { useState } from 'react';
import { useGame } from '../stores/gameStore';
import { BLOCKS, KINDS, OPERATION, tierNames, CITY_RULES } from '../data/rules';
import { cityReport } from '../game/city/report';
import * as actions from '../game/city/actions';
import { canPay } from '../game/city/inventory';
import { Dialog } from './Interface';
import type { Game, Kind } from '../types/game';
const n = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '∞');
const labels = {
  ko: {
    population: '인구',
    food: '식량',
    materials: '자재',
    aether: '에테르',
    credits: '크레딧',
    power: '전력',
    happiness: '행복',
    roads: '도로',
    jobs: '일자리',
    environment: '환경',
    safety: '구조 안전',
    collapse: '최근 붕괴',
    housing: '주거',
    shelter: '임시 거주',
    workers: '노동력',
    storage: '창고',
    structure: '구조',
  },
  en: {
    population: 'Population',
    food: 'Food',
    materials: 'Materials',
    aether: 'Aether',
    credits: 'Credits',
    power: 'Power',
    happiness: 'Happiness',
    roads: 'Road access',
    jobs: 'Jobs',
    environment: 'Environment',
    safety: 'Structural safety',
    collapse: 'Recent collapse',
    housing: 'Housing',
    shelter: 'Shelter',
    workers: 'Workforce',
    storage: 'Storage',
    structure: 'Structure',
  },
};
const status = {
  ko: {
    running: '가동',
    paused: '정지',
    road: '도로 단절',
    power: '전력 부족',
    workers: '인력 부족',
    input: '에테르 부족',
    damage: '손상',
    storage: '창고 가득 참',
    empty: '입주 대기',
  },
  en: {
    running: 'Running',
    paused: 'Paused',
    road: 'No road',
    power: 'Low power',
    workers: 'Understaffed',
    input: 'No Aether',
    damage: 'Damaged',
    storage: 'Storage full',
    empty: 'Awaiting residents',
  },
};
const adviceText = {
  ko: {
    structure: '위험 구역을 수리·보강하거나 부양력을 늘리세요',
    food: '농장 인력·전력과 식량 비축을 확인하세요',
    power: '발전시설을 가동하고 끊긴 연결부를 수리하세요',
    shelter: '도로에 연결된 주거를 확보하세요',
    roads: '시설과 핵심 도로의 연결을 복구하세요',
    workers: '주거를 늘리거나 핵심 시설에 인력을 우선 배정하세요',
    credits: '시설을 일시정지하거나 잉여 재고를 판매하세요',
    happiness: '주거 근처에 공원·병원을 배치하세요',
    storage: '창고를 늘리거나 잉여 재고를 판매하세요',
  },
  en: {
    structure: 'Repair, reinforce or add local lift',
    food: 'Check farm staffing, power and food reserves',
    power: 'Start generators and repair broken connections',
    shelter: 'Provide road-connected housing',
    roads: 'Reconnect facilities to a road network',
    workers: 'Add housing or prioritize essential jobs',
    credits: 'Pause facilities or sell surplus stock',
    happiness: 'Place parks and clinics near homes',
    storage: 'Add storage or sell surplus stock',
  },
};
const apply = (fn: (g: Game) => Game) => useGame.getState().cityAction(fn);
export function CityMenu() {
  const lang = useGame((s) => s.settings.language),
    hasSave = useGame((s) => s.hasCitySave);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>
        {lang === 'ko' ? '도시 운영 실험실' : 'City Lab'}
        <span className="tag">LIVING CITY</span>
      </button>
      {open && (
        <Dialog
          title={lang === 'ko' ? '도시 운영 실험실' : 'City Lab'}
          onClose={() => setOpen(false)}
        >
          <p>
            {lang === 'ko'
              ? '도로·전력·인구가 연결된 도시를 실험하세요. 별도 저장 슬롯을 사용합니다. 새 실험은 저장 시 기존 실험을 교체합니다.'
              : 'Explore connected roads, power and people. Separate save slot; saving a new experiment replaces the previous lab.'}
          </p>
          <button className="primary full" onClick={() => useGame.getState().start('citylab')}>
            {lang === 'ko' ? '새 실험 시작' : 'Start experiment'}
          </button>
          <button
            className="full"
            disabled={!hasSave}
            onClick={() => useGame.getState().resume('city')}
          >
            {lang === 'ko' ? '실험 불러오기' : 'Load experiment'}
          </button>
        </Dialog>
      )}
    </>
  );
}
export function CitySettings() {
  const settings = useGame((s) => s.settings),
    ko = settings.language === 'ko';
  return (
    <>
      {(['dayNight', 'environment'] as const).map((k) => (
        <label key={k}>
          {k === 'dayNight' ? (ko ? '낮과 밤' : 'Day and night') : ko ? '환경 장식' : 'Scenery'}
          <input
            type="checkbox"
            checked={settings[k]}
            onChange={(e) => useGame.getState().configure({ [k]: e.target.checked })}
          />
        </label>
      ))}
      {(['citizens', 'vehicles'] as const).map((k) => (
        <label key={k}>
          {k === 'citizens'
            ? ko
              ? '대표 시민'
              : 'Representative citizens'
            : ko
              ? '운송 차량'
              : 'Delivery vehicles'}{' '}
          · {settings[k]}
          <input
            aria-label={k}
            type="range"
            min="0"
            max={k === 'citizens' ? 48 : 16}
            value={settings[k]}
            onChange={(e) => useGame.getState().configure({ [k]: Number(e.target.value) })}
          />
        </label>
      ))}
    </>
  );
}
export function CityHUD() {
  const g = useGame((s) => s.game),
    selected = useGame((s) => s.selected),
    lang = useGame((s) => s.settings.language),
    ko = lang === 'ko';
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState<'overview' | 'facilities' | 'orders' | 'events'>('overview'),
    [kind, setKind] = useState<Kind>('farm');
  if (!g.city.enabled) return null;
  const r = cityReport(g),
    t = labels[lang],
    b =
      selected?.type === 'building' ? g.buildings.find((b) => String(b.id) === selected.id) : null,
    op = b ? r.operations.get(b.id) : null,
    upgrade = b ? actions.upgradePreview(g, b.id) : null;
  return (
    <>
      <section className="city-ribbon panel" aria-label={ko ? '도시 자원' : 'City resources'}>
        <button onClick={() => setOpen(true)}>{ko ? '도시 운영' : 'City management'} ↗</button>
        <span>
          ♙ {Math.floor(g.population)} / {r.housing}
        </span>
        <span title={ko ? '생산 / 소비 · 초당' : 'Production / consumption per second'}>
          ♧ {Math.floor(r.stocks.food)} · {n(r.foodProduction)} / {n(r.foodConsumption)}
        </span>
        <span>
          ϟ {n(r.supplied)} / {n(r.demand)}
        </span>
        <span>◈ {Math.floor(r.stocks.aether)}</span>
        <span>
          ¤ {Math.floor(g.city.credits)} ({r.net >= 0 ? '+' : ''}
          {n(r.net * 60)}/m)
        </span>
        <span>☺ {Math.round(g.city.happiness)}%</span>
        <div className="speed-controls">
          {([0, 1, 2, 3] as const).map((speed) => (
            <button
              key={speed}
              aria-pressed={g.city.speed === speed && !g.labPaused}
              onClick={() => apply((g) => ({ ...g, labPaused: false, city: { ...g.city, speed } }))}
            >
              {speed ? `${speed}×` : 'Ⅱ'}
            </button>
          ))}
        </div>
      </section>
      <aside className="city-advisor">
        {r.advice.map((a) => (
          <div key={a.id}>
            <button
              onClick={() => {
                if (a.cell) useGame.getState().focus(a.cell);
                setOpen(true);
                setTab('overview');
              }}
            >
              {t[a.id as keyof typeof t] ?? a.id} · {n(a.value)} →{' '}
              <small>{adviceText[lang][a.id as keyof typeof adviceText.ko]}</small>
            </button>
            <button
              aria-label={ko ? '30초 숨기기' : 'Dismiss for 30 seconds'}
              onClick={() =>
                apply((g) => ({
                  ...g,
                  city: { ...g.city, dismissed: { ...g.city.dismissed, [a.id]: g.elapsed } },
                }))
              }
            >
              ×
            </button>
          </div>
        ))}
      </aside>
      {b && op && (
        <aside className="city-selection panel">
          <strong>
            {BLOCKS[b.kind][lang]} · Lv.{(b.level ?? 0) + 1}
          </strong>
          <span>
            {status[lang][op.status]} · {Math.round(op.efficiency * 100)}%
          </span>
          <span>
            {t.workers} {n(op.workers)} / {n(op.jobs)} · ϟ {n(op.power)} / {n(op.demand)}
          </span>
          <button
            onClick={() => {
              setOpen(true);
              setTab('facilities');
            }}
          >
            {ko ? '운영·업그레이드' : 'Operations & upgrades'} ↗
          </button>
        </aside>
      )}
      {open && (
        <Dialog title={ko ? '살아있는 도시' : 'Living City'} onClose={() => setOpen(false)} wide>
          <div className="city-tabs">
            {(['overview', 'facilities', 'orders', 'events'] as const).map((id, i) => (
              <button key={id} aria-pressed={id === tab} onClick={() => setTab(id)}>
                {
                  (ko
                    ? ['도시 현황', '시설 운영', '주문·긴급 지원', '기록']
                    : ['Overview', 'Facilities', 'Orders & aid', 'Events'])[i]
                }
              </button>
            ))}
          </div>
          {g.mode === 'citylab' && (
            <div className="city-lab-controls">
              <label>
                {ko ? '실험 예제' : 'Experiment'}
                <select
                  value={g.city.example}
                  onChange={(e) =>
                    useGame.getState().cityExample(e.target.value as Game['city']['example'])
                  }
                >
                  {(['A', 'B', 'C', 'D', 'E'] as const).map((id, i) => (
                    <option key={id} value={id}>
                      {id} ·{' '}
                      {
                        (ko
                          ? ['전력망', '식량난', '산업', '복구', '행복']
                          : ['Power', 'Food', 'Industry', 'Repair', 'Happiness'])[i]
                      }
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={g.city.unlimited}
                  onChange={(e) =>
                    apply((g) => ({ ...g, city: { ...g.city, unlimited: e.target.checked } }))
                  }
                />
                {ko ? '무제한 자원' : 'Unlimited resources'}
              </label>
              <button
                onClick={() =>
                  apply((g) => ({
                    ...g,
                    city: { ...g.city, dayTime: g.city.dayTime < 180 ? 270 : 90 },
                  }))
                }
              >
                {ko ? '낮 / 밤 전환' : 'Switch day / night'}
              </button>
              <button onClick={() => useGame.getState().toggleLabTime()}>
                {g.labPaused
                  ? ko
                    ? '시간 재개'
                    : 'Resume time'
                  : ko
                    ? '실험 정지'
                    : 'Pause experiment'}
              </button>
            </div>
          )}
          {tab === 'overview' && (
            <>
              <p className="city-tier">
                {tierNames[lang][g.city.tier - 1]} ·{' '}
                {ko ? '다음 인구 기준' : 'Population milestones'}: 25 / 75 / 150 / 300 / 600
              </p>
              <div className="city-metrics">
                {[
                  [
                    t.population,
                    `${n(g.population)} / ${r.housing}`,
                    `${t.workers} ${n(r.employed)} / ${n(r.workforce)} · ${t.shelter} ${n(g.city.displaced)}`,
                  ],
                  [
                    t.food,
                    `${n(r.stocks.food)} / ${r.capacity.food}`,
                    `+${n(r.foodProduction)} −${n(r.foodConsumption)} /s · ${ko ? '소진' : 'Empty in'} ${n(r.foodETA)}s`,
                  ],
                  [
                    t.materials,
                    `${n(r.stocks.materials)} / ${r.capacity.materials}`,
                    `+${n(r.materialsProduction)}/s`,
                  ],
                  [
                    t.aether,
                    `${n(r.stocks.aether)} / ${r.capacity.aether}`,
                    `+${n(r.aetherProduction)}/s`,
                  ],
                  [
                    t.power,
                    `${n(r.generation)} / ${n(r.demand)}`,
                    `${ko ? '공급' : 'Supplied'} ${n(r.supplied)} · ${ko ? '배터리' : 'Battery'} ${n(r.battery)}`,
                  ],
                  [
                    t.credits,
                    n(g.city.credits),
                    `+${n(r.income * 60)} −${n(r.expense * 60)} /m · ${ko ? '소진' : 'Empty in'} ${n(r.creditETA)}s`,
                  ],
                ].map(([title, value, detail]) => (
                  <div key={title}>
                    <small>{title}</small>
                    <strong>{value}</strong>
                    <span>{detail}</span>
                  </div>
                ))}
              </div>
              <p>
                {ko
                  ? '핵심 창고와 연결된 재고만 상단에 표시합니다. 격리된 구역은 자체 창고와 인력으로 운영됩니다.'
                  : 'The top bar shows core-accessible stock. Isolated districts use their own stores and workforce.'}
              </p>
              <h3>
                {t.happiness} {n(g.city.happiness)} → {n(r.happinessTarget)}
              </h3>
              <div className="city-factors">
                {r.factors.map((f) => (
                  <span key={f.code}>
                    {t[f.code as keyof typeof t]} {f.value >= 0 ? '+' : ''}
                    {n(f.value)}
                  </span>
                ))}
              </div>
              <p>
                {ko
                  ? `입주 +${n(g.city.arrivals)} · 이주 −${n(g.city.departures)} · 굶주림 ${n(g.city.hungerTime)}초 · 보호 ${n(g.city.grace)}초`
                  : `Arrivals +${n(g.city.arrivals)} · Departures −${n(g.city.departures)} · Hunger ${n(g.city.hungerTime)}s · Grace ${n(g.city.grace)}s`}
              </p>
              <p>
                {ko
                  ? '행복·식량·전력·안전이 충족되면 5초 간격으로 입주합니다. 병원은 이주를 완화하고, 공원은 주변 주거의 산업 소음을 줄입니다.'
                  : 'Immigration checks happiness, food, power and safety every five seconds. Clinics reduce departures; nearby parks buffer industrial noise.'}
              </p>
            </>
          )}
          {tab === 'facilities' && (
            <>
              <div className="city-facilities">
                {g.buildings
                  .filter((b) => b.kind !== 'road' && b.kind !== 'powerLink')
                  .map((b) => {
                    const o = r.operations.get(b.id)!;
                    return (
                      <button
                        key={b.id}
                        aria-pressed={selected?.id === String(b.id)}
                        onClick={() => {
                          useGame.getState().selectTarget({ type: 'building', id: String(b.id) });
                          useGame.getState().focus(b.origin);
                        }}
                      >
                        <strong>
                          {BLOCKS[b.kind][lang]} #{b.id}
                        </strong>
                        <span>
                          {status[lang][o.status]} · {Math.round(o.efficiency * 100)}%
                        </span>
                      </button>
                    );
                  })}
              </div>
              {b && op && (
                <div className="city-detail">
                  <h3>
                    {BLOCKS[b.kind][lang]} #{b.id}
                  </h3>
                  <button
                    onClick={() =>
                      apply((g) => actions.setOperation(g, b.id, { enabled: !b.enabled }))
                    }
                  >
                    {b.enabled
                      ? ko
                        ? '가동 중지'
                        : 'Pause facility'
                      : ko
                        ? '가동 시작'
                        : 'Start facility'}
                  </button>
                  <label>
                    {ko ? '인력 우선순위 (0 최우선)' : 'Workforce priority (0 first)'}
                    <select
                      value={b.priority ?? OPERATION[b.kind].priority}
                      onChange={(e) =>
                        apply((g) =>
                          actions.setOperation(g, b.id, { priority: Number(e.target.value) }),
                        )
                      }
                    >
                      {[0, 1, 2, 3, 4, 5].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <p>
                    {ko ? '도로 구역' : 'Road district'}: {op.road ?? '—'} ·{' '}
                    {ko ? '전력 구역' : 'Power district'}: {op.powerGrid ?? '—'} ·{' '}
                    {ko ? '상태' : 'Condition'} {Math.round(op.condition * 100)}%
                  </p>
                  <p>
                    {t.workers}: {n(op.workers)}/{n(op.jobs)} · {t.power}: {n(op.power)}/
                    {n(op.demand)} ·{' '}
                    {ko ? '생산 식량 / 자재 / 에테르' : 'Food / materials / Aether output'}:{' '}
                    {n(op.food)} / {n(op.materials)} / {n(op.aether)} /s
                  </p>
                  {upgrade && (
                    <>
                      <p>
                        {ko ? '업그레이드 예상' : 'Upgrade forecast'}: {n(upgrade.before.mass)} →{' '}
                        {n(upgrade.after.mass)}t · ϟ {n(upgrade.before.demand)} →{' '}
                        {n(upgrade.after.demand)} · {t.housing} {upgrade.before.capacity} →{' '}
                        {upgrade.after.capacity} · {ko ? '안정도' : 'Stability'}{' '}
                        {n(upgrade.stability)}%
                      </p>
                      <p>
                        {t.materials} {upgrade.cost.materials} · {t.credits} {upgrade.cost.credits}{' '}
                        · {t.aether} {upgrade.cost.aether}
                      </p>
                      <button
                        disabled={!upgrade.allowed}
                        onClick={() => apply((g) => actions.upgrade(g, b.id))}
                      >
                        {ko ? '업그레이드' : 'Upgrade'} (Lv.{(b.level ?? 0) + 2})
                      </button>
                      <small>
                        {ko
                          ? '최대 단계·도로·전력·구조 여유·비용을 충족해야 합니다.'
                          : 'Requires level allowance, road, power, structural margin and funds.'}
                      </small>
                    </>
                  )}
                </div>
              )}
              {g.mode === 'citylab' && (
                <label>
                  {ko ? '자유 건설' : 'Free selection'}
                  <select
                    value={g.active.kind}
                    onChange={(e) => useGame.getState().blueprint(e.target.value as Kind)}
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {BLOCKS[k][lang]}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => setOpen(false)}>
                    {ko ? '배치하기' : 'Place in city'}
                  </button>
                </label>
              )}
            </>
          )}
          {tab === 'orders' && (
            <>
              <p>
                {ko
                  ? '주문은 18초 후 무작위 공급의 다음 큐에 합류합니다. 최대 2개, 주문 간격 25초이며 일반 블록보다 비쌉니다.'
                  : 'Orders join the random supply queue after 18 seconds. Maximum two orders, 25-second cooldown, higher cost than random blocks.'}
              </p>
              <select
                aria-label={ko ? '주문 시설' : 'Order facility'}
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
              >
                {KINDS.filter((k) => actions.unlocked(g, k)).map((k) => (
                  <option key={k} value={k}>
                    {BLOCKS[k][lang]}
                  </option>
                ))}
              </select>
              <p>
                {t.materials} {actions.orderCost(kind).materials} · {t.credits}{' '}
                {actions.orderCost(kind).credits} · {t.aether} {actions.orderCost(kind).aether}
              </p>
              <button
                disabled={
                  g.city.orderCooldown > 0 ||
                  g.city.orders.length >= 2 ||
                  !canPay(g, actions.orderCost(kind))
                }
                onClick={() => apply((g) => actions.orderBuilding(g, kind))}
              >
                {ko ? '주문' : 'Order'} · {Math.ceil(g.city.orderCooldown)}s
              </button>
              {g.city.orders.map((o, i) => (
                <p key={i}>
                  {BLOCKS[o.piece.kind][lang]} · {Math.ceil(o.remaining)}s{' '}
                  {o.remaining === 0 ? (ko ? '공급 대기' : 'Awaiting supply') : ''}
                </p>
              ))}
              <div className="city-aid">
                <button
                  disabled={
                    g.city.foodCooldown > 0 || !canPay(g, { materials: 0, credits: 45, aether: 0 })
                  }
                  onClick={() => apply(actions.emergencyFood)}
                >
                  {ko ? '긴급 식량 80 · 45크레딧' : 'Emergency food 80 · 45 credits'} (
                  {Math.ceil(g.city.foodCooldown)}s)
                </button>
                <button
                  disabled={
                    g.city.powerCooldown > 0 ||
                    !canPay(g, { materials: 15, credits: 35, aether: 2 })
                  }
                  onClick={() => apply(actions.emergencyPower)}
                >
                  {ko ? '임시 전력 +30 / 20초' : 'Temporary power +30 / 20s'} · 15 / 35 / 2 (
                  {Math.ceil(g.city.powerCooldown)}s)
                </button>
                <button onClick={() => apply(actions.aid)}>
                  {ko ? '유한 구호금 (잔액 100 미만)' : 'Limited grant (balance below 100)'} ·{' '}
                  {g.city.aidUses}
                </button>
                {(['food', 'materials', 'aether'] as const).map((k) => (
                  <button
                    key={k}
                    disabled={g.city.unlimited || r.stocks[k] <= 0}
                    onClick={() => apply((g) => actions.sell(g, k))}
                  >
                    {t[k]} {ko ? '20 판매' : 'sell 20'} · {k === 'aether' ? 40 : 5} ¤
                  </button>
                ))}
              </div>
              <p>
                {ko
                  ? '비상 부양은 구조 패널에서 사용합니다. 코어의 기본 부양력은 자원이 소진되어도 유지됩니다.'
                  : 'Emergency lift is available in the structural panel. Core lift remains available even when resources reach zero.'}
              </p>
            </>
          )}
          {tab === 'events' && (
            <div className="city-event-list">
              {[...g.city.events].reverse().map((e) => (
                <p key={e.id}>
                  {Math.floor(e.time)}s ·{' '}
                  {
                    {
                      shortage: ko ? '식량 부족' : 'Food shortage',
                      recovery: ko ? '회복' : 'Recovery',
                      tier: ko ? '도시 단계' : 'City tier',
                      migration: ko ? '이주' : 'Migration',
                      upgrade: ko ? '업그레이드' : 'Upgrade',
                      delivery: ko ? '주문 도착' : 'Order delivered',
                      storageLoss: ko ? '창고 손실' : 'Storage loss',
                      aid: ko ? '긴급 지원' : 'Emergency aid',
                    }[e.kind]
                  }{' '}
                  · {n(e.value)}
                </p>
              ))}
              <small>{ko ? '최근 32개 기록을 보관합니다.' : 'Stores the latest 32 events.'}</small>
            </div>
          )}
          <small>
            {ko
              ? `운영 1초 · 인구 5초 · 하루 ${CITY_RULES.daySeconds}초. 창이 숨겨지면 시간이 멈춥니다.`
              : `Economy 1s · population 5s · day ${CITY_RULES.daySeconds}s. Time pauses in hidden tabs.`}
          </small>
        </Dialog>
      )}
    </>
  );
}
