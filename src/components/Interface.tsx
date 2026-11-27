import { WorldEntry, WorldControls } from './WorldUI';
import { openOnline } from '../multiplayer/client';
import { DisasterEntry, DisasterControls } from './DisasterUI';
import { VerticalEntry, VerticalControls } from './VerticalUI';
import { stage } from '../game/campaign/definitions';
import { CampaignEntry, CampaignObjectives } from './CampaignControls';
import { CityMenu, CityHUD, CitySettings } from './CityUI';
import { ControlSettings, PlacementInsight } from './PlayTools';
import { GraphicsSettings } from './GraphicsSettings';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phase2Menu, AnalysisToolbar, LabPanel, StructuralPanel, GameOver } from './StructuralUI';
import { MISSIONS, MISSION_GOALS, LAB_EXAMPLES } from '../data/missions';
import { P2 } from '../locales/phase2';
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
        {BLOCKS[piece.kind].mass} t{' '}
        {cells.some((c) => (c.y ?? 0) !== 0)
          ? ` · Y ${Math.min(...cells.map((c) => c.y ?? 0))}…${Math.max(...cells.map((c) => c.y ?? 0))}`
          : ''}
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
      if (Array.from(document.querySelectorAll('[role="dialog"]')).at(-1) !== el) return;
      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
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
    document.addEventListener('keydown', handler, true);
    return () => {
      document.removeEventListener('keydown', handler, true);
      previous?.focus();
    };
  }, []);
  return createPortal(
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
    </div>,
    document.body,
  );
}
function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`logo ${small ? 'small' : ''}`}>
      <img src="/skytopia-mark.svg" alt="" width={small ? 30 : 52} height={small ? 38 : 65} />
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
          VISUAL UPGRADE <i>10</i>
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
          <CampaignEntry />
          <VerticalEntry />
          <WorldEntry />
          <button onClick={openOnline}>
            {lang === 'ko' ? '온라인 · SKY RIVALS' : 'Online · SKY RIVALS'}
            <span className="tag">08</span>
          </button>
          <DisasterEntry />
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
          <Phase2Menu />
          <CityMenu />
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
          PHASE 10 <b>·</b> v0.10.0
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
  const freeMode = useGame((s) => s.freeMode);
  const g = useGame((s) => s.game),
    lang = useGame((s) => s.settings.language),
    t = TEXT[lang];
  const cameraMode = useGame((s) => s.cameraMode),
    notice = useGame((s) => s.notice);
  const stats = analyze(g);
  const goals = objectives(g, stats),
    validity = useMemo(
      () => validatePlacement(g),
      [g.active, g.cursor, g.platforms, g.buildings, g.structure, g.resources, g.reservedActive],
    );
  const labels =
    g.mode === 'lab' ? [] : g.missionId === 1 ? OBJECTIVES[lang] : MISSION_GOALS[lang][g.missionId];
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
    {
      icon: 'power',
      label: t.power,
      value: `${Math.round(stats.power * 10) / 10}`,
      suffix: `/ ${Math.round(stats.demand * 10) / 10}`,
    },
    {
      icon: 'cube',
      label: t.resources,
      value: g.mode === 'lab' ? '∞' : `${Math.floor(g.resources)}`,
      suffix: '',
    },
    { icon: 'star', label: t.score, value: `${g.score.toLocaleString()}`, suffix: '' },
  ];
  return (
    <div
      className={`hud ${g.city.enabled ? 'city-mode' : ''} ${g.vertical ? 'vertical-mode' : ''}`}
    >
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
      <WorldControls />
      <VerticalControls />
      <DisasterControls />
      <aside className="left-rail">
        {g.campaign ? (
          <CampaignObjectives />
        ) : g.world ? (
          <section className="mission-card panel">
            <div className="section-label">
              {g.world.mode === 'lab' ? 'WORLD LAB' : 'CIVILIZATION'} · {g.world.cities.length}/
              {g.world.config.maxCities}
            </div>
            <span className="eyebrow">BEYOND THE CLOUDS</span>
            <h1>{g.world.cities.find((c) => c.id === g.world!.active)?.name}</h1>
            <p>
              {lang === 'ko'
                ? '이 도시의 구조와 생활을 돌보세요. 세계 지도에서 탐사·운송·연구와 다른 도시를 관리합니다.'
                : 'Care for this city’s structure and people. Manage exploration, freight, research and other cities on the world map.'}
            </p>
          </section>
        ) : (
          <section className="mission-card panel">
            <div className="section-label">
              <Icon name="flag" size={15} />
              {freeMode
                ? 'FREE BUILD'
                : g.mode === 'citylab'
                  ? g.vertical
                    ? g.disaster?.mode === 'survival'
                      ? 'SURVIVAL'
                      : g.disaster
                        ? 'DISASTER LAB'
                        : 'VERTICAL LAB'
                    : 'CITY LAB'
                  : g.mode === 'lab'
                    ? P2[lang].lab
                    : t.mission}
              <span>
                {g.mode === 'citylab'
                  ? g.disaster?.mode === 'survival'
                    ? g.disaster.wave
                    : (g.disaster?.example ?? g.vertical?.example ?? g.city.example)
                  : g.mode === 'lab'
                    ? g.labExample
                    : `0${g.missionId}`}{' '}
              </span>
            </div>
            <span className="eyebrow">
              {g.mode === 'citylab'
                ? g.vertical
                  ? g.disaster
                    ? 'STORMS OF AETHER'
                    : 'VERTICAL CIVILIZATION'
                  : 'LIVING CITY'
                : g.mode === 'lab'
                  ? 'STRUCTURAL LAB'
                  : MISSIONS[g.missionId].subtitle}
            </span>
            <h1>
              {freeMode
                ? lang === 'ko'
                  ? '자유 건설'
                  : 'Free build'
                : g.mode === 'citylab'
                  ? lang === 'ko'
                    ? g.vertical
                      ? g.disaster?.mode === 'survival'
                        ? '재난 생존 모드'
                        : g.disaster
                          ? '재난 실험실'
                          : '수직 건설 실험실'
                      : '도시 운영 실험실'
                    : g.vertical
                      ? g.disaster?.mode === 'survival'
                        ? 'Survival mode'
                        : g.disaster
                          ? 'Disaster Lab'
                          : 'Vertical Lab'
                      : 'City Lab'
                  : g.mode === 'lab'
                    ? LAB_EXAMPLES[g.labExample][lang]
                    : MISSIONS[g.missionId][lang]}
            </h1>
            <p>
              {freeMode
                ? lang === 'ko'
                  ? '자유롭게 도시를 운영하세요. 진행 기록과 별도로 저장됩니다.'
                  : 'Manage your city freely. Saved separately from campaign progress.'
                : g.mode === 'citylab'
                  ? lang === 'ko'
                    ? g.vertical
                      ? g.disaster
                        ? '예보를 확인하고 방어시설·비상 자원·대피 경로를 준비하세요.'
                        : '입체 공방에서 예제를 고르고 층별로 구조·이동·전력을 연결하세요.'
                      : '도시 운영 패널에서 예제·시설·시간을 조절하세요.'
                    : g.vertical
                      ? g.disaster
                        ? 'Read forecasts and prepare defenses, reserves and evacuation routes.'
                        : 'Choose a workshop example and connect support, transport and power across floors.'
                      : 'Use City management to control facilities, scenarios and time.'
                  : g.mode === 'lab'
                    ? P2[lang].unlimited
                    : g.missionId === 1
                      ? t.missionHint
                      : `${P2[lang].hold} ${g.missionHold.toFixed(1)} / ${MISSIONS[g.missionId].hold}s`}
            </p>
            {!['lab', 'citylab'].includes(g.mode) ? (
              <div className="mission-progress">
                <i style={{ width: `${(goals.filter(Boolean).length / goals.length) * 100}%` }} />
              </div>
            ) : null}
            <ul className="objectives">
              {(g.mode === 'citylab' ? [] : labels).map((label, i) => (
                <li key={label} className={goals[i] ? 'done' : ''}>
                  <span className="goal-check">
                    {goals[i] ? <Icon name="check" size={12} /> : null}
                  </span>
                  <span>{label}</span>
                  <small>{g.missionId === 1 ? progress[i] : goals[i] ? '✓' : '—'}</small>
                </li>
              ))}
            </ul>
          </section>
        )}
        {g.mode === 'lab' ? (
          <LabPanel />
        ) : g.mode === 'training' ? (
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
        <StructuralPanel />
      </aside>
      <CityHUD />
      <AnalysisToolbar />
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
        <PlacementInsight />
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
          disabled={g.holdUsed || !!(g.campaign && stage(g.campaign.stage).limit)}
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
            <span>
              {g.mode !== 'mission' ||
              g.reservedActive ||
              (g.campaign && !stage(g.campaign.stage).fall)
                ? t.noTimer
                : t.remaining}
            </span>
            <strong>
              {g.mode !== 'mission' ||
              g.reservedActive ||
              (g.campaign && !stage(g.campaign.stage).fall)
                ? '∞'
                : `${g.remaining.toFixed(1)}s`}
            </strong>
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
        <span>{t.controls} · V ↓</span>
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
  if (screen === 'gameover') return <GameOver />;
  if (screen === 'settings')
    return (
      <Dialog title={t.settings} onClose={close}>
        <div className="settings-rows">
          <ControlSettings />
          <GraphicsSettings />
          <CitySettings />
          <button onClick={() => useGame.getState().replayOpening()}>
            {settings.language === 'ko' ? '오프닝 다시 보기' : 'Replay opening'}
          </button>
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
          {(['musicVolume', 'effectsVolume', 'warningVolume'] as const).map((k) => (
            <label key={k}>
              {P2[settings.language][k]}
              <input
                aria-label={P2[settings.language][k]}
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings[k]}
                onChange={(e) => useGame.getState().configure({ [k]: Number(e.target.value) })}
              />
            </label>
          ))}
          <label>
            {P2[settings.language].difficulty}
            <select
              value={settings.difficulty}
              onChange={(e) =>
                useGame
                  .getState()
                  .configure({ difficulty: e.target.value as 'easy' | 'normal' | 'hard' })
              }
            >
              {(['easy', 'normal', 'hard'] as const).map((k) => (
                <option key={k} value={k}>
                  {P2[settings.language][k]}
                </option>
              ))}
            </select>
          </label>
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
      <Dialog
        title={
          g.missionId === 1
            ? t.victoryTitle
            : `${MISSIONS[g.missionId][settings.language]} · ${P2[settings.language].completed}`
        }
        wide
      >
        <div className="victory-emblem">
          <Icon name="star" size={52} />
        </div>
        <h3>{g.missionId === 1 ? t.victory : MISSIONS[g.missionId][settings.language]}</h3>
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
          {g.missionId < 9 ? (
            <button
              onClick={() =>
                useGame.getState().start('mission', (g.missionId + 1) as Game['missionId'])
              }
            >
              {P2[settings.language].nextMission}
            </button>
          ) : null}
        </div>
      </Dialog>
    );
  }
  return null;
}
