import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useGame } from '../stores/gameStore';
import { TEXT, OBJECTIVES, TUTORIAL } from '../locales/text';
import { BLOCKS } from '../data/rules';
import { cellsOf, key } from '../game/grid';
import { analyze, objectives } from '../game/analysis';
import { validatePlacement } from '../game/placement';
import type { Game, Piece } from '../types/game';
export const clockText = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    diamond: (
      <>
        <path d="M12 2 21 12 12 22 3 12Z" />
        <path d="M12 2v20M3 12h18" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-4a6 6 0 0 1 12 0v4M16 5a3 3 0 0 1 0 6M18 15a4 4 0 0 1 3 4v2" />
      </>
    ),
    power: <path d="m13 2-9 12h7l-1 8 10-13h-7Z" />,
    cube: (
      <>
        <path d="m12 2 10 5v10l-10 5-10-5V7Z" />
        <path d="m2 7 10 5 10-5M12 12v10M7 4.5l10 5" />
      </>
    ),
    star: <path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" />,
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    save: (
      <>
        <path d="M4 3h13l4 4v14H3V3Z" />
        <path d="M7 3v6h10V3M7 21v-8h10v8" />
      </>
    ),
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m15 9-2 4-4 2 2-4Z" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 10 5-10 5L2 8ZM2 12l10 5 10-5M2 16l10 5 10-5" />
      </>
    ),
    rotate: (
      <>
        <path d="M4 10a8 8 0 1 1 1 8M3 3v7h7" />
      </>
    ),
    recycle: (
      <>
        <path d="m9 4 3-2 4 7M15 4l1 5-5-1M20 12l2 4-3 4h-7M17 16l-5 4 5 3M7 19H3l-2-4 4-7M1 9l4-1 2 5" />
      </>
    ),
    flag: (
      <>
        <path d="M5 22V3M5 3c5-4 9 4 15 0v10c-6 4-10-4-15 0" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m5 5 14 14M19 5 5 19" />,
    play: <path d="m8 4 12 8-12 8Z" />,
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.diamond}
    </svg>
  );
}
function useText() {
  return TEXT[useGame((s) => s.settings.language)];
}
export function MiniPiece({ piece, compact = false }: { piece: Piece | null; compact?: boolean }) {
  const lang = useGame((s) => s.settings.language),
    t = TEXT[lang];
  if (!piece)
    return (
      <div className="piece-empty">
        <span>＋</span>
        <small>{t.empty}</small>
      </div>
    );
  const cells = cellsOf(piece),
    minX = Math.min(...cells.map((c) => c.x)),
    minZ = Math.min(...cells.map((c) => c.z));
  const width = Math.max(...cells.map((c) => c.x)) - minX + 1,
    height = Math.max(...cells.map((c) => c.z)) - minZ + 1;
  return (
    <div
      className={`mini-piece ${compact ? 'compact' : ''}`}
      style={{ '--block-color': BLOCKS[piece.kind].color } as CSSProperties}
    >
      <svg
        viewBox={`-3 -3 ${width * 20 + 6} ${height * 20 + 6}`}
        role="img"
        aria-label={`${BLOCKS[piece.kind][lang]} ${piece.shape}`}
      >
        {cells.map((c) => (
          <g key={key(c)}>
            <rect
              x={(c.x - minX) * 20}
              y={(c.z - minZ) * 20 + 3}
              width="17"
              height="17"
              rx="2"
              fill="currentColor"
              opacity=".3"
            />
            <rect
              x={(c.x - minX) * 20}
              y={(c.z - minZ) * 20}
              width="17"
              height="17"
              rx="2"
              fill="currentColor"
            />
            <path
              d={`M${(c.x - minX) * 20 + 3} ${(c.z - minZ) * 20 + 3}h11`}
              stroke="#fff"
              opacity=".4"
            />
          </g>
        ))}
      </svg>
      <span>{BLOCKS[piece.kind][lang]}</span>
      <small>
        {piece.shape === 'single' ? '1×1' : `${piece.shape} · ${cells.length}`} /{' '}
        {BLOCKS[piece.kind].mass} t
      </small>
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>('button,select,input')?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = el?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),select,input,[tabindex="0"]',
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el?.addEventListener('keydown', handler);
    return () => {
      el?.removeEventListener('keydown', handler);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-shade">
      <div
        className={`dialog ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        {onClose ? (
          <button
            className="icon-button dialog-close"
            aria-label={TEXT[useGame.getState().settings.language].back}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        ) : null}
        <span className="eyebrow">SKYTOPIA · AETHER RISING</span>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`logo ${small ? 'small' : ''}`}>
      <Icon name="diamond" size={small ? 26 : 38} />
      <div>
        <strong>SKYTOPIA</strong>
        <span>A E T H E R &nbsp; R I S I N G</span>
      </div>
    </div>
  );
}
export function Menu() {
  const t = useText(),
    lang = useGame((s) => s.settings.language),
    hasSave = useGame((s) => s.hasSave),
    issue = useGame((s) => s.saveIssue);
  const [pending, setPending] = useState<Game['mode'] | null>(null);
  const start = (mode: Game['mode']) => {
    if (hasSave) setPending(mode);
    else useGame.getState().start(mode);
  };
  return (
    <div className="menu-screen">
      <header className="menu-top">
        <span className="edition">
          FOUNDATION OF THE SKY <i>01</i>
        </span>
        <button
          className="language-button"
          onClick={() => useGame.getState().configure({ language: lang === 'ko' ? 'en' : 'ko' })}
        >
          <Icon name="globe" size={16} />
          {lang === 'ko' ? '한국어 / EN' : 'EN / 한국어'}
        </button>
      </header>
      <div className="menu-heading">
        <Logo />
        <p>{t.tagline}</p>
      </div>
      <section className="menu-card">
        <span className="eyebrow">YOUR SKY AWAITS</span>
        <h1>
          {lang === 'ko' ? (
            <>
              구름 너머,
              <br />
              새로운 시작.
            </>
          ) : (
            <>
              Beyond the clouds.
              <br />A new beginning.
            </>
          )}
        </h1>
        <p>{t.subtitle}</p>
        <div className="menu-actions">
          <button className="primary" onClick={() => start('mission')}>
            <Icon name="play" size={17} />
            {t.newGame}
          </button>
          <button onClick={() => useGame.getState().resume()} disabled={!hasSave}>
            {t.continue}
          </button>
          <button onClick={() => start('training')}>
            {t.training}
            <span className="tag">{lang === 'ko' ? '추천' : 'START HERE'}</span>
          </button>
        </div>
        <div className="menu-links">
          <button onClick={() => useGame.getState().setScreen('settings')}>{t.settings}</button>
          <span>/</span>
          <button onClick={() => useGame.getState().setScreen('about')}>{t.about}</button>
        </div>
        {issue ? (
          <p className="error-message" role="status">
            {t[issue as 'corrupt' | 'unavailable']}
          </p>
        ) : null}
      </section>
      <div className="island-caption">
        <span className="caption-line" />
        <span>
          AETHER ISLE — 001<small>ALTITUDE 2,478 M · A NEW HOME</small>
        </span>
      </div>
      <footer className="menu-footer">
        <span>BUILD ABOVE. BALANCE THE SKY. RISE BEYOND.</span>
        <span>
          PHASE 1 <b>·</b> v0.1.0
        </span>
      </footer>
      {pending ? (
        <Dialog title={t.replaceTitle} onClose={() => setPending(null)}>
          <p>{t.replaceHint}</p>
          <div className="dialog-actions">
            <button onClick={() => setPending(null)}>{t.cancel}</button>
            <button className="primary" onClick={() => useGame.getState().start(pending)}>
              {t.begin}
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
export function HUD() {
  const g = useGame((s) => s.game),
    lang = useGame((s) => s.settings.language),
    t = TEXT[lang];
  const cameraMode = useGame((s) => s.cameraMode),
    balance = useGame((s) => s.balanceVisible),
    notice = useGame((s) => s.notice);
  const stats = useMemo(() => analyze(g), [g.platforms, g.buildings]);
  const goals = objectives(g, stats),
    validity = useMemo(() => validatePlacement(g), [g.active, g.cursor, g.platforms, g.buildings]);
  const progress = [
    Math.min(5, stats.expansion) + '/5',
    Math.min(5, stats.homes) + '/5',
    Math.min(25, Math.floor(g.population)) + '/25',
    Math.min(1, stats.addedPower) + '/1',
    '',
    `${stats.power}/${stats.demand}`,
    `${Math.round(stats.stability)}%`,
  ];
  const tally = [
    {
      icon: 'people',
      label: t.population,
      value: `${Math.floor(g.population)}`,
      suffix: `/ ${stats.capacity}`,
    },
    { icon: 'power', label: t.power, value: `${stats.power}`, suffix: `/ ${stats.demand}` },
    { icon: 'cube', label: t.resources, value: `${g.resources}`, suffix: '' },
    { icon: 'star', label: t.score, value: `${g.score.toLocaleString()}`, suffix: '' },
  ];
  return (
    <div className="hud">
      <header className="topbar panel">
        <Logo small />
        <div className="resource-strip">
          {tally.map((item) => (
            <div className="resource" key={item.label}>
              <Icon name={item.icon} />
              <div>
                <span>{item.label}</span>
                <strong>
                  {item.value} <small>{item.suffix}</small>
                </strong>
              </div>
            </div>
          ))}
        </div>
        <div className="game-clock">
          <span>{t.time}</span>
          <strong>{clockText(g.elapsed)}</strong>
        </div>
        <button
          className="icon-button"
          aria-label={t.save}
          title={t.save}
          onClick={() => useGame.getState().save()}
        >
          <Icon name="save" />
        </button>
        <button
          className="icon-button"
          aria-label={t.pause}
          title={`${t.pause} · Esc`}
          onClick={() => useGame.getState().pause()}
        >
          <Icon name="pause" />
        </button>
      </header>
      <aside className="left-rail">
        <section className="mission-card panel">
          <div className="section-label">
            <Icon name="flag" size={15} />
            {t.mission}
            <span>01</span>
          </div>
          <span className="eyebrow">FIRST LIGHT</span>
          <h1>{t.firstLight}</h1>
          <p>{t.missionHint}</p>
          <div className="mission-progress">
            <i style={{ width: `${(goals.filter(Boolean).length / goals.length) * 100}%` }} />
          </div>
          <ul className="objectives">
            {OBJECTIVES[lang].map((label, i) => (
              <li key={label} className={goals[i] ? 'done' : ''}>
                <span className="goal-check">
                  {goals[i] ? <Icon name="check" size={12} /> : null}
                </span>
                <span>{label}</span>
                <small>{progress[i]}</small>
              </li>
            ))}
          </ul>
        </section>
        {g.mode === 'training' ? (
          <section className="tutorial-card panel">
            <span className="eyebrow">FLIGHT SCHOOL · {Math.min(g.tutorial + 1, 9)} / 9</span>
            <h2>{t.trainingTitle}</h2>
            <p>{g.tutorial < 9 ? TUTORIAL[lang][g.tutorial] : t.trainingDone}</p>
            {g.tutorial < 9 ? (
              <button className="text-button" onClick={() => useGame.getState().skipTutorial()}>
                {t.skip}
              </button>
            ) : null}
          </section>
        ) : (
          <div className="field-note">
            <Icon name="diamond" size={17} />
            <p>{g.active.kind === 'platform' ? t.platformNote : t.facilityNote}</p>
          </div>
        )}
      </aside>
      <aside className="right-rail">
        <section className="stability-card panel">
          <div className="section-label">
            <Icon name="compass" size={16} />
            {t.stability}
          </div>
          <div
            className={`stability-dial ${stats.stability < 70 ? 'warning' : ''}`}
            style={{ '--stability': `${stats.stability * 3.6}deg` } as CSSProperties}
          >
            <div>
              <strong>
                {Math.round(stats.stability)}
                <small>%</small>
              </strong>
              <span>{stats.stability >= 70 ? t.balanced : t.caution}</span>
            </div>
          </div>
          <dl className="city-stats">
            <div>
              <dt>{t.mass}</dt>
              <dd>
                {stats.mass.toFixed(0)} <small>t</small>
              </dd>
            </div>
            <div>
              <dt>{t.lift}</dt>
              <dd>
                {stats.lift} <small>t</small>
              </dd>
            </div>
            <div>
              <dt>{t.disconnected}</dt>
              <dd className={stats.disconnected ? 'warning-text' : ''}>{stats.disconnected}</dd>
            </div>
            <div>
              <dt>{t.food}</dt>
              <dd>{stats.food}</dd>
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
            <Icon name="target" size={16} />
            {t.balance}
          </button>
          <div className="center-readout">
            X {stats.center.x.toFixed(2)} <span>·</span> Z {stats.center.z.toFixed(2)}
          </div>
        </section>
      </aside>
      <div className="view-controls panel">
        <button
          className={cameraMode === 'free' ? 'selected' : ''}
          aria-pressed={cameraMode === 'free'}
          onClick={() => useGame.getState().camera('free')}
        >
          <Icon name="compass" size={16} />
          {t.free}
        </button>
        <button
          className={cameraMode === 'top' ? 'selected' : ''}
          aria-pressed={cameraMode === 'top'}
          onClick={() => useGame.getState().camera('top')}
        >
          <Icon name="layers" size={16} />
          {t.top}
        </button>
        <button
          aria-label={t.reset}
          title={`${t.reset} · H`}
          onClick={() => useGame.getState().camera()}
        >
          <Icon name="rotate" size={16} />
        </button>
      </div>
      <div className="placement-feedback">
        <div
          className={`placement-status ${!validity.valid ? 'invalid' : validity.warning ? 'warn' : ''}`}
          role="status"
        >
          {t[validity.reason]}
          <span>
            {g.cursor.x}, {g.cursor.z}
          </span>
        </div>
        <div className="notice" aria-live="polite">
          {notice ? t[notice as keyof typeof t] : '\u00a0'}
        </div>
      </div>
      <section className="build-dock panel">
        <div className="active-block">
          <span className="section-label">{t.active}</span>
          <MiniPiece piece={g.active} />
        </div>
        <div className="supply-blocks">
          <span className="section-label">
            {t.next}
            <small>01 / 02 / 03</small>
          </span>
          <div className="next-pieces">
            {g.next.map((p, i) => (
              <MiniPiece key={`${i}-${p.kind}-${p.shape}`} piece={p} compact />
            ))}
          </div>
        </div>
        <button
          className={`hold-block ${g.holdUsed ? 'used' : ''}`}
          aria-label={`${t.hold} · C`}
          disabled={g.holdUsed}
          onClick={() => useGame.getState().hold()}
        >
          <span className="section-label">
            {t.hold}
            <kbd>C</kbd>
          </span>
          <MiniPiece piece={g.hold} compact />
        </button>
        <div className="build-actions">
          <div className="fall-label">
            <span>{g.mode === 'training' ? t.noTimer : t.remaining}</span>
            <strong>{g.mode === 'training' ? '∞' : `${g.remaining.toFixed(1)}s`}</strong>
          </div>
          <div className="fall-track">
            <i style={{ width: `${(g.remaining / 20) * 100}%` }} />
          </div>
          <div className="action-buttons">
            <button
              title={`${t.rotate} · Q`}
              aria-label={`${t.rotate} Q`}
              onClick={() => useGame.getState().rotate(-1)}
            >
              ↶ <kbd>Q</kbd>
            </button>
            <button
              title={`${t.rotate} · E`}
              aria-label={`${t.rotate} E`}
              onClick={() => useGame.getState().rotate(1)}
            >
              ↷ <kbd>E</kbd>
            </button>
            <button
              className="primary place-button"
              disabled={!validity.valid}
              onClick={() => useGame.getState().place()}
            >
              {t.place}
              <kbd>SPACE</kbd>
            </button>
            <button
              title={`${t.recycle} · X`}
              aria-label={t.recycle}
              onClick={() => useGame.getState().recycle()}
            >
              <Icon name="recycle" size={18} />
              <kbd>X</kbd>
            </button>
          </div>
        </div>
      </section>
      <footer className="controls-footer">
        <span>{t.controls}</span>
        <span>{t.cameraControls}</span>
      </footer>
    </div>
  );
}
export function Overlay() {
  const screen = useGame((s) => s.screen),
    settings = useGame((s) => s.settings),
    g = useGame((s) => s.game),
    returnScreen = useGame((s) => s.returnScreen),
    t = TEXT[settings.language];
  const close = () => useGame.getState().setScreen(returnScreen);
  if (screen === 'settings')
    return (
      <Dialog title={t.settings} onClose={close}>
        <div className="settings-rows">
          <label>
            {t.language}
            <select
              value={settings.language}
              onChange={(e) =>
                useGame.getState().configure({ language: e.target.value as 'ko' | 'en' })
              }
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </label>
          {(['sound', 'shadows', 'reducedMotion'] as const).map((k) => (
            <label key={k}>
              {t[k]}
              <input
                type="checkbox"
                checked={settings[k]}
                onChange={(e) => useGame.getState().configure({ [k]: e.target.checked })}
              />
            </label>
          ))}
        </div>
        <button className="primary full" onClick={close}>
          {t.back}
        </button>
      </Dialog>
    );
  if (screen === 'about')
    return (
      <Dialog title="Build above. Rise beyond." onClose={close}>
        <p>{t.aboutText}</p>
        <p className="muted">{t.phaseNote}</p>
        <button className="primary full" onClick={close}>
          {t.back}
        </button>
      </Dialog>
    );
  if (screen === 'paused')
    return (
      <Dialog title={t.pause}>
        <p>{t.pausedHint}</p>
        <div className="stack-buttons">
          <button className="primary" onClick={() => useGame.getState().pause()}>
            {t.resume}
          </button>
          <button onClick={() => useGame.getState().save()}>{t.save}</button>
          <button onClick={() => useGame.getState().setScreen('settings')}>{t.settings}</button>
          <button onClick={() => useGame.getState().setScreen('menu')}>{t.quit}</button>
        </div>
      </Dialog>
    );
  if (screen === 'victory') {
    const stats = analyze(g);
    return (
      <Dialog title={t.victoryTitle} wide>
        <div className="victory-emblem">
          <Icon name="star" size={52} />
        </div>
        <h3>{t.victory}</h3>
        <p>{t.victoryHint}</p>
        <div className="victory-stats">
          {[
            [t.buildings, g.buildings.length],
            [t.population, Math.floor(g.population)],
            [t.stability, `${Math.round(stats.stability)}%`],
            [t.expansion, stats.expansion],
            [t.time, clockText(g.elapsed)],
            [t.score, g.score],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="dialog-actions">
          <button onClick={() => useGame.getState().setScreen('menu')}>{t.quit}</button>
          <button className="primary" onClick={() => useGame.getState().setScreen('playing')}>
            {t.resume}
          </button>
        </div>
      </Dialog>
    );
  }
  return null;
}
