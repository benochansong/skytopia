import { lazy, Suspense, useState } from 'react';
import { action, closeOnline, login, send, useOnline, viewCity } from './client';
import { useGame } from '../stores/gameStore';
import { BLOCKS, ONLINE, RULES } from '../data/rules';
import { analyze } from '../game/analysis';
import { cityReport } from '../game/city/report';
import { validatePlacement } from '../game/placement';
import type { RoomOptions, Result } from '../game/online/protocol';
import { TEXT } from '../locales/text';
import './online.css';
import { Dialog } from '../components/Interface';
const World = lazy(() => import('../scene/World'));
const errors: Record<string, [string, string]> = {
  recycleCooldown: ['재활용은 3초 간격으로 가능합니다.', 'Recycle is available every 3 seconds.'],
  connectionRequired: [
    '서버에 연결할 수 없습니다. 서버 실행 상태를 확인하세요.',
    'Cannot reach the server. Check that it is running.',
  ],
  invalidSession: [
    '세션이 만료되었습니다. 다시 연결하면 새 게스트가 생성됩니다.',
    'Session expired. Connect again to create a new guest.',
  ],
  replaced: [
    '다른 탭에서 연결했습니다. 이 탭의 연결은 종료되었습니다.',
    'Another tab took over this session.',
  ],
  notReady: [
    '두 플레이어가 준비해야 방장이 시작할 수 있습니다.',
    'Both players must be ready before the host starts.',
  ],
  roomUnavailable: [
    '방을 찾을 수 없거나 이미 다른 방에 있습니다.',
    'Room unavailable, or already in a room.',
  ],
  roomFull: ['방이 가득 찼거나 이미 시작되었습니다.', 'Room full or already started.'],
  staleHand: [
    '블록이 변경되었습니다. 현재 블록으로 다시 시도하세요.',
    'Your block changed. Try again with the current block.',
  ],
  denied: [
    '조건이나 자원이 부족하여 승인되지 않았습니다.',
    'Requirements or resources are insufficient.',
  ],
  hostOnly: ['협동 도시 철거는 방장만 가능합니다.', 'Only the host can demolish in co-op.'],
  sequence: [
    '명령 순서가 갱신되었습니다. 다시 시도하세요.',
    'Command sequence refreshed. Please retry.',
  ],
  readOnly: ['관전 중에는 도시를 변경할 수 없습니다.', 'Spectators cannot change a city.'],
  rateLimit: ['입력이 너무 빠릅니다. 잠시 후 다시 시도하세요.', 'Too many requests. Please wait.'],
  notPlaying: ['경기 중에만 사용할 수 있습니다.', 'Available during a live match only.'],
};
const reasonText: Record<string, [string, string]> = {
  time: ['시간 종료', 'Time limit'],
  surrender: ['포기', 'Surrender'],
  collapse: ['도시 붕괴', 'City collapse'],
  forfeit: ['연결 유예 만료', 'Disconnect forfeit'],
  disconnected: ['모두 연결 종료 · 무효', 'All disconnected · aborted'],
  serverRestart: ['서버 재시작 · 무효', 'Server restart · aborted'],
  cooperativeVictory: ['협동 목표 달성', 'Cooperative victory'],
  timeout: ['협동 목표 시간 초과', 'Cooperative timeout'],
};
function Results({ result, ko }: { result: Result; ko: boolean }) {
  const labels = ko
    ? ['인구', '구조', '경제', '연결', '행복', '공간']
    : ['Population', 'Structure', 'Economy', 'Connections', 'Happiness', 'Space'];
  return (
    <section className="online-result" aria-label={ko ? '경기 결과' : 'Match result'}>
      <h2>{reasonText[result.reason]?.[ko ? 0 : 1] || result.reason}</h2>
      <p>
        {result.winner
          ? (ko ? '승자: ' : 'Winner: ') + result.players.find((p) => p.id === result.winner)?.name
          : result.mode === 'duel' && result.reason === 'time'
            ? ko
              ? '무승부'
              : 'Draw'
            : ko
              ? '공동 결과'
              : 'Shared result'}
      </p>
      <p>
        {ko ? '규칙' : 'Rules'} v{result.rulesVersion ?? 1}
      </p>
      <div className="online-scorecards">
        {result.players.map((p) => (
          <article key={p.id}>
            <strong>
              {p.name} · {p.score.total.toLocaleString()}
            </strong>
            <dl>
              <div>
                <dt>{ko ? '목표 달성' : 'Objectives'}</dt>
                <dd>{p.score.objectives}/4</dd>
              </div>
              {p.score.parts.map((part, i) => (
                <div key={labels[i]}>
                  <dt>{labels[i]}</dt>
                  <dd>
                    {part} / {ONLINE.scoreWeights[i] * 100}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <small>
        {ko
          ? '시간 종료 시: 목표 수 → 총점 → 안정도 → 공간 효율 순으로 비교합니다.'
          : 'At time limit: objectives → total → stability → space efficiency.'}
        <br />
        {ko
          ? '서버 확정 결과 · 비랭크 게스트 경기'
          : 'Server-confirmed result · unranked guest match'}
        <br />
        {result.id}
      </small>
    </section>
  );
}
function MatchHUD({ ko }: { ko: boolean }) {
  const s = useOnline(),
    g = useGame((x) => x.game),
    selected = useGame((x) => x.selected),
    tool = useGame((x) => x.toolMode);
  const [confirm, setConfirm] = useState<'leave' | 'demolish' | null>(null);
  const r = s.room!,
    playing = r.phase === 'playing',
    own = r.hand && s.viewing < 0;
  const disabled = !own || !playing || s.status !== 'connected' || s.pending;
  const report = cityReport(g),
    stats = analyze(g),
    validation = validatePlacement(g);
  const t = (a: string, b: string) => (ko ? a : b);
  const name = (kind: keyof typeof BLOCKS) => BLOCKS[kind][ko ? 'ko' : 'en'];
  return (
    <>
      <div className="online-match-top online-panel">
        <div>
          <span className="online-kicker">
            {r.options.mode === 'coop' ? 'CO-OP CITY' : 'SKY DUEL'}
          </span>
          <strong>{r.options.name}</strong>
          <span data-testid="rules-version">
            {t('규칙', 'Rules')} v{r.rulesVersion ?? 1}
          </span>
          <small>
            {r.code} · {s.latency} ms ·{' '}
            {s.status === 'connected'
              ? t('연결됨', 'Connected')
              : t('재접속 중 · 입력 잠김', 'Reconnecting · input locked')}
          </small>
        </div>
        <div className="online-clock" data-testid="online-clock">
          {Math.floor(r.remaining / 60)}:
          {Math.floor(r.remaining % 60)
            .toString()
            .padStart(2, '0')}
        </div>
        <button onClick={() => setConfirm('leave')}>
          {playing || r.phase === 'countdown'
            ? t('경기 포기', 'Surrender')
            : t('방 나가기', 'Leave room')}
        </button>
      </div>
      <aside className="online-match-left online-panel">
        <h2>{t('도시 현황', 'City status')}</h2>
        <div className="online-vitals">
          <span>
            {t('인구', 'Population')} <b>{Math.floor(g.population)}</b>
          </span>
          <span>
            {t('안정', 'Stability')} <b>{Math.round(stats.stability)}%</b>
          </span>
          <span>
            {t('크레딧', 'Credits')} <b>{Math.floor(g.city.credits)}</b>
          </span>
          <span>
            {t('자재', 'Materials')} <b>{Math.floor(report.stocks.materials)}</b>
          </span>
          <span>
            {t('식량/초', 'Food/sec')}{' '}
            <b>{(report.foodProduction - report.foodConsumption).toFixed(2)}</b>
          </span>
          <span>
            {t('전력 부족', 'Power deficit')} <b>{report.deficit.toFixed(1)}</b>
          </span>
        </div>
        {r.members.map((p, i) => (
          <div className="online-player-score" key={p.id}>
            <strong>
              {p.name} {p.id === s.id ? t('(나)', '(you)') : ''}
            </strong>
            <span>
              {p.connected ? '●' : '○'}{' '}
              {r.scores[r.options.mode === 'coop' ? 0 : i]?.total.toLocaleString()}
            </span>
            {!p.connected && <small>{t('재접속 유예 60초', '60-second reconnect grace')}</small>}
          </div>
        ))}
        {r.options.mode === 'duel' && (
          <div className="online-actions">
            <button onClick={() => viewCity(-1)} disabled={s.viewing < 0}>
              {t('내 도시', 'My city')}
            </button>
            {r.members.map(
              (p, i) =>
                p.id !== s.id && (
                  <button key={p.id} onClick={() => viewCity(i)} disabled={s.viewing === i}>
                    {t('관찰: ', 'Watch: ')}
                    {p.name}
                  </button>
                ),
            )}
          </div>
        )}
        {r.options.mode === 'coop' && (
          <div className="online-goal">
            <b>{t('공동 목표', 'Shared goal')}</b>
            <p>
              {t(
                '새 시설 4개 · 인구 30 · 안정 75% · 식량 자급 · 전력 충족을 10초 유지',
                'Build 4 facilities · population 30 · stability 75% · food self-sufficiency · enough power for 10 seconds',
              )}
            </p>
            <progress value={r.goalHold} max={ONLINE.coopHold} />
            <small>
              {r.goalHold.toFixed(1)} / 10s ·{' '}
              {t(
                '건설·경제 / 구조·방재 역할을 나누세요.',
                'Split building/economy and structure/defense duties.',
              )}
            </small>
          </div>
        )}
        {g.disaster && (
          <p className="online-weather">
            {t('재난', 'Disaster')}: {g.disaster.phase} · {g.disaster.weather.wind.toFixed(0)} m/s
          </p>
        )}
        {r.pings.map((p, i) => (
          <button
            className="online-ping"
            key={p.until + ':' + i}
            onClick={() => useGame.getState().focus(p.cell)}
          >
            {p.by}:{' '}
            {t(
              (
                { build: '건설', repair: '수리', danger: '위험', thanks: '감사' } as Record<
                  string,
                  string
                >
              )[p.kind],
              p.kind,
            )}{' '}
            ({p.cell.x},{p.cell.y},{p.cell.z})
          </button>
        ))}
      </aside>
      <aside className="online-match-right online-panel">
        <h2>{own ? t('현재 블록', 'Current block') : t('관전 전용', 'Read-only view')}</h2>
        {own && (
          <>
            <strong className="online-block">{name(g.active.kind)}</strong>
            <small>
              {g.active.shape} · {Math.ceil(r.hand!.remaining)}s
            </small>
            <p>
              {t('다음', 'Next')}: {r.hand!.next.map((p) => name(p.kind)).join(' → ')}
            </p>
            <small>
              {t('보관', 'Hold')}: {r.hand!.hold ? name(r.hand!.hold.kind) : '—'}
            </small>
          </>
        )}
        <div className="online-actions">
          <button onClick={() => useGame.getState().rotate(-1)} disabled={disabled}>
            ↶ Q
          </button>
          <button onClick={() => useGame.getState().rotate(1)} disabled={disabled}>
            ↷ E
          </button>
          <button onClick={() => action('hold')} disabled={disabled || !!r.hand?.holdUsed}>
            {t('보관 C', 'Hold C')}
          </button>
          <button
            onClick={() => action('recycle')}
            disabled={disabled || (!!r.hand && g.elapsed < r.hand.recycleAt)}
          >
            {t('재활용 X', 'Recycle X')}
            {r.hand && g.elapsed < r.hand.recycleAt
              ? ` · ${(r.hand.recycleAt - g.elapsed).toFixed(1)}s`
              : ''}
          </button>
        </div>
        <div className="online-coordinates">
          <label>
            X
            <input
              aria-label="Build X"
              type="number"
              min={RULES.min}
              max={RULES.max}
              value={g.cursor.x}
              onChange={(e) => useGame.getState().aim({ ...g.cursor, x: Number(e.target.value) })}
            />
          </label>
          <label>
            Z
            <input
              aria-label="Build Z"
              type="number"
              min={RULES.min}
              max={RULES.max}
              value={g.cursor.z}
              onChange={(e) => useGame.getState().aim({ ...g.cursor, z: Number(e.target.value) })}
            />
          </label>
        </div>
        <button className="primary" disabled={disabled} onClick={() => action('place')}>
          {s.pending ? t('서버 확인 중…', 'Awaiting server…') : t('배치 · Space', 'Place · Space')}
        </button>
        <small>
          {validation.valid
            ? t('배치 가능 · 서버에서 최종 확인', 'Valid preview · server decides')
            : (TEXT[ko ? 'ko' : 'en'] as unknown as Record<string, string>)[validation.reason] ||
              validation.reason}
        </small>
        <div className="online-actions">
          <button
            onClick={() => useGame.setState({ toolMode: tool === 'inspect' ? 'build' : 'inspect' })}
          >
            {tool === 'inspect' ? t('건설 모드', 'Build mode') : t('시설 선택', 'Inspect')}
          </button>
          <button onClick={() => useGame.getState().camera('top')}>
            {t('위에서 보기', 'Top view')}
          </button>
          <button onClick={() => useGame.getState().cycleAnalysis()}>
            {t('구조 분석', 'Analysis')}
          </button>
        </div>
        {selected && (
          <div className="online-actions">
            <small>
              {selected.type} #{selected.id}
            </small>
            {(['repair', 'reinforce'] as const).map((type) => (
              <button
                key={type}
                disabled={disabled}
                onClick={() => action({ type, target: selected })}
              >
                {type === 'repair' ? t('수리', 'Repair') : t('보강', 'Reinforce')}
              </button>
            ))}
            {selected.type === 'building' && (
              <button
                disabled={disabled}
                onClick={() => action({ type: 'upgrade', id: Number(selected.id) })}
              >
                {t('업그레이드', 'Upgrade')}
              </button>
            )}
            <button
              disabled={disabled || (r.options.mode === 'coop' && r.host !== s.id)}
              onClick={() => setConfirm('demolish')}
            >
              {t('철거', 'Demolish')}
            </button>
          </div>
        )}
        <div className="online-actions">
          <button disabled={disabled} onClick={() => action({ type: 'food' })}>
            {t('긴급 식량', 'Emergency food')}
          </button>
          <button disabled={disabled} onClick={() => action({ type: 'power' })}>
            {t('긴급 전력', 'Emergency power')}
          </button>
          <button
            disabled={disabled}
            onClick={() => action({ type: 'emergency', cell: { ...g.cursor, y: 0 } })}
          >
            {t('긴급 부양', 'Emergency lift')}
          </button>
        </div>
        <div className="online-actions">
          {(['build', 'repair', 'danger', 'thanks'] as const).map((kind) => (
            <button
              key={kind}
              disabled={disabled}
              onClick={() => send({ type: 'ping', kind, cell: { ...g.cursor, y: 0 } })}
            >
              {t({ build: '건설', repair: '수리', danger: '위험', thanks: '감사' }[kind], kind)} ◇
            </button>
          ))}
        </div>
        <small>
          {t(
            '이동 WASD · 회전 QE · 카메라 드래그/휠 · 시간은 서버에서 흐릅니다. 제한시간 만료 블록은 재활용됩니다.',
            'WASD move · QE rotate · drag/wheel camera · server clock continues. Expired blocks are recycled.',
          )}
        </small>
      </aside>
      {(r.phase === 'countdown' || r.paused) && (
        <div className="online-center online-panel">
          <h1>
            {r.paused
              ? t('모두 연결 끊김 · 협동 일시 정지', 'All disconnected · co-op paused')
              : Math.ceil(r.countdown)}
          </h1>
          <p>{t('같은 시작 조건 · 서버 검증', 'Same starting conditions · server authority')}</p>
        </div>
      )}
      {r.result && (
        <div className="online-modal">
          <div className="online-panel">
            <Results result={r.result} ko={ko} />
            <button className="primary" onClick={() => send({ type: 'leave' })}>
              {t('로비로 돌아가기', 'Back to lobby')}
            </button>
          </div>
        </div>
      )}
      {confirm && (
        <Dialog title={t('작업 확인', 'Confirm action')} onClose={() => setConfirm(null)}>
          <div className="online-panel">
            <h2>
              {confirm === 'demolish'
                ? t('선택 시설을 철거할까요?', 'Demolish this facility?')
                : t('방에서 나갈까요?', 'Leave this room?')}
            </h2>
            <p>
              {confirm === 'leave' && s.status !== 'connected'
                ? t(
                    '이 화면을 닫아도 서버 경기는 즉시 끝나지 않습니다. 재접속 유예 만료 시 처리됩니다.',
                    'Closing this screen does not immediately end the server match. Disconnect grace rules still apply.',
                  )
                : confirm === 'leave' && playing
                  ? t(
                      '대전 중에는 패배, 협동 중에는 공동 포기로 기록됩니다.',
                      'During play this is a duel loss or a shared co-op surrender.',
                    )
                  : t('이 작업은 되돌릴 수 없습니다.', 'This action cannot be undone.')}
            </p>
            <div className="online-actions">
              <button autoFocus onClick={() => setConfirm(null)}>
                {t('취소', 'Cancel')}
              </button>
              <button
                onClick={() => {
                  if (confirm === 'demolish' && selected)
                    action({ type: 'demolish', target: selected });
                  else if (s.status !== 'connected') closeOnline();
                  else send({ type: 'leave' });
                  setConfirm(null);
                }}
              >
                {t('확인', 'Confirm')}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
export default function OnlineUI() {
  const photo = useGame((s) => s.photoMode);
  const s = useOnline(),
    ko = useGame((x) => x.settings.language === 'ko');
  const [name, setName] = useState(s.name || ''),
    [code, setCode] = useState(''),
    [spectate, setSpectate] = useState(false);
  const [options, setOptions] = useState<RoomOptions>({
    name: 'Sky Harbor',
    mode: 'duel',
    public: false,
    seconds: 600,
    disaster: false,
    spectators: true,
  });
  const t = (a: string, b: string) => (ko ? a : b);
  const r = s.room,
    inGame = !!r && r.phase !== 'lobby' && s.games.length > 0;
  return (
    <div className={'online-root ' + (inGame ? 'online-playing' : '')}>
      {inGame ? (
        <>
          <Suspense fallback={<div className="loading-scene">SKY RIVALS…</div>}>
            <World />
          </Suspense>
          {!photo && <MatchHUD ko={ko} />}
        </>
      ) : (
        <div className="online-lobby">
          <header>
            <div>
              <span className="online-kicker">SKYTOPIA / CHAPTER 08</span>
              <h1>SKY RIVALS</h1>
              <p>{t('같은 하늘, 서로 다른 도시.', 'One sky. Two visions.')}</p>
            </div>
            <div className="online-actions">
              <button onClick={() => useGame.getState().configure({ language: ko ? 'en' : 'ko' })}>
                한국어 / EN
              </button>
              <button
                onClick={() => {
                  if (s.room) send({ type: 'leave' });
                  closeOnline();
                }}
              >
                {t('싱글플레이로', 'Single player')}
              </button>
            </div>
          </header>
          <div className="online-connection">
            <span className={'online-dot ' + (s.status === 'connected' ? 'is-connected' : '')} />
            {s.status === 'connected'
              ? t('연결됨', 'Connected') + ' · ' + s.name
              : s.status === 'offline'
                ? t('서버 연결 필요', 'Server connection required')
                : t('서버 연결 중…', 'Connecting…')}
            <small>
              {t(
                '비랭크 게스트 · 세션 30일 · 서버 미실행 시 싱글플레이 이용 가능',
                'Unranked guests · 30-day session · single player works without a server',
              )}
            </small>
          </div>
          {s.status === 'offline' && (
            <form
              className="online-panel online-signin"
              onSubmit={(e) => {
                e.preventDefault();
                login(name);
              }}
            >
              <h2>{t('하늘의 건축가', 'Sky builder')}</h2>
              <label>
                {t('표시 이름', 'Display name')}
                <input
                  required
                  maxLength={20}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="nickname"
                />
              </label>
              <button className="primary" type="submit">
                {t('서버 연결', 'Connect')}
              </button>
              <small>
                {t(
                  '처음 연결하면 서버가 고유 게스트 세션을 발급합니다. 같은 이름은 같은 계정이 아닙니다.',
                  'The server issues a unique guest session. Matching names do not grant access to another identity.',
                )}
              </small>
            </form>
          )}
          {s.status === 'connected' && !r && (
            <div className="online-lobby-grid">
              <form
                className="online-panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  send({ type: 'create', options });
                }}
              >
                <span className="online-kicker">01 / HOST</span>
                <h2>{t('방 만들기', 'Create room')}</h2>
                <label>
                  {t('방 이름', 'Room name')}
                  <input
                    value={options.name}
                    maxLength={32}
                    required
                    onChange={(e) => setOptions({ ...options, name: e.target.value })}
                  />
                </label>
                <label>
                  {t('모드', 'Mode')}
                  <select
                    aria-label={t('모드', 'Mode')}
                    value={options.mode}
                    onChange={(e) =>
                      setOptions({ ...options, mode: e.target.value as RoomOptions['mode'] })
                    }
                  >
                    <option value="duel">SKY DUEL</option>
                    <option value="coop">CO-OP CITY</option>
                  </select>
                </label>
                <label>
                  {t('제한 시간', 'Time limit')}
                  <select
                    aria-label={t('제한 시간', 'Time limit')}
                    value={options.seconds}
                    onChange={(e) =>
                      setOptions({ ...options, seconds: Number(e.target.value) as 600 | 900 })
                    }
                  >
                    <option value={600}>{t('10분', '10 minutes')}</option>
                    <option value={900}>{t('15분', '15 minutes')}</option>
                  </select>
                </label>
                {(['public', 'disaster', 'spectators'] as const).map((key) => (
                  <label className="online-check" key={key}>
                    <input
                      type="checkbox"
                      checked={options[key]}
                      onChange={(e) => setOptions({ ...options, [key]: e.target.checked })}
                    />
                    {key === 'public'
                      ? t('공개 방 목록에 표시', 'List publicly')
                      : key === 'disaster'
                        ? t('동일한 바람 재난 일정', 'Shared wind disaster schedule')
                        : t('초대 코드로 관전 허용', 'Allow spectators with code')}
                  </label>
                ))}
                <button className="primary" type="submit">
                  {t('방 생성', 'Create')}
                </button>
              </form>
              <div className="online-panel">
                <span className="online-kicker">02 / JOIN</span>
                <h2>{t('친구와 만나기', 'Meet a friend')}</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send({ type: 'join', code, spectator: spectate });
                  }}
                >
                  <label>
                    {t('초대 코드', 'Invite code')}
                    <input
                      aria-label="Invite code"
                      value={code}
                      maxLength={8}
                      minLength={8}
                      required
                      pattern="[A-Z0-9]{8}"
                      onChange={(e) =>
                        setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                      }
                    />
                  </label>
                  <label className="online-check">
                    <input
                      type="checkbox"
                      checked={spectate}
                      onChange={(e) => setSpectate(e.target.checked)}
                    />
                    {t('관전으로 참가', 'Join as spectator')}
                  </label>
                  <button type="submit">{t('참가', 'Join')}</button>
                </form>
                <hr />
                <h3>{t('빠른 대전', 'Quick duel')}</h3>
                <p>
                  {t('접속한 실제 플레이어를 기다립니다.', 'Waits for another connected player.')}
                </p>
                <button onClick={() => send({ type: 'queue', enabled: !s.queued })}>
                  {s.queued ? t('매칭 취소', 'Cancel queue') : t('상대 찾기', 'Find opponent')}
                </button>
                <h3>{t('공개 방', 'Public rooms')}</h3>
                <button onClick={() => send({ type: 'list' })}>{t('새로고침', 'Refresh')}</button>
                {s.rooms.length ? (
                  s.rooms.map((room) => (
                    <div className="online-room-row" key={room.code}>
                      <span>
                        {room.name} · {room.mode} · {room.players}/2
                      </span>
                      <button
                        disabled={room.players >= 2 || room.phase !== 'lobby'}
                        onClick={() => send({ type: 'join', code: room.code, spectator: false })}
                      >
                        {t('참가', 'Join')}
                      </button>
                    </div>
                  ))
                ) : (
                  <p>{t('참가 가능한 공개 방이 없습니다.', 'No public rooms available.')}</p>
                )}
              </div>
            </div>
          )}
          {r?.phase === 'lobby' && (
            <section className="online-panel online-room">
              <span className="online-kicker">
                {r.options.mode === 'duel' ? 'SKY DUEL' : 'CO-OP CITY'} / {r.options.seconds / 60}{' '}
                MIN
              </span>
              <h2>{r.options.name}</h2>
              <p>{t('초대 코드', 'Invite code')}</p>
              <strong className="online-code" data-testid="invite-code">
                {r.code}
              </strong>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(r.code).catch(() => {});
                }}
              >
                {t('코드 복사', 'Copy code')}
              </button>
              <p>
                {t(
                  '두 명이 준비하면 방장이 시작합니다. 재접속은 같은 브라우저의 게스트 세션을 사용하세요.',
                  'Both players ready up, then the host starts. Reconnect using the same browser guest session.',
                )}
              </p>
              <div className="online-members">
                {r.members.map((p) => (
                  <article key={p.id}>
                    <span>
                      {p.id === r.host ? '♔' : '◇'} {p.name}
                    </span>
                    <b>{p.ready ? t('준비 완료', 'Ready') : t('대기', 'Waiting')}</b>
                    <small>
                      {p.connected ? t('연결됨', 'Connected') : t('연결 끊김', 'Disconnected')}
                    </small>
                  </article>
                ))}
                {r.members.length < 2 && (
                  <article>{t('친구를 기다리는 중…', 'Waiting for a friend…')}</article>
                )}
              </div>
              <div className="online-actions">
                {r.members.some((p) => p.id === s.id) && (
                  <button
                    onClick={() =>
                      send({ type: 'ready', ready: !r.members.find((p) => p.id === s.id)!.ready })
                    }
                  >
                    {r.members.find((p) => p.id === s.id)!.ready
                      ? t('준비 취소', 'Not ready')
                      : t('준비', 'Ready')}
                  </button>
                )}
                {r.host === s.id && (
                  <button
                    className="primary"
                    disabled={
                      r.members.length !== 2 || !r.members.every((p) => p.ready && p.connected)
                    }
                    onClick={() => send({ type: 'start' })}
                  >
                    {t('경기 시작', 'Start match')}
                  </button>
                )}
                <button onClick={() => send({ type: 'leave' })}>
                  {t('방 나가기', 'Leave room')}
                </button>
              </div>
              <small>
                {t('관전자', 'Spectators')}: {r.spectators} ·{' '}
                {r.options.disaster
                  ? t('바람 재난 ON', 'Wind disasters ON')
                  : t('재난 OFF', 'Disasters OFF')}
              </small>
            </section>
          )}
          {s.history.length > 0 && !r && (
            <section className="online-panel online-history">
              <h2>{t('최근 내 경기', 'My recent matches')}</h2>
              {s.history.map((result) => (
                <details key={result.id}>
                  <summary>
                    {new Date(result.at).toLocaleString(ko ? 'ko-KR' : 'en-US')} · {result.mode} ·{' '}
                    {reasonText[result.reason]?.[ko ? 0 : 1] || result.reason}
                  </summary>
                  <Results result={result} ko={ko} />
                </details>
              ))}
            </section>
          )}
          <footer>
            {t(
              '이 버전: 2인 대전 · 공동 도시 · 관전 · 서버 결과 기록. 정식 계정·글로벌 랭킹·시즌·리플레이·협동 월드는 아직 지원하지 않습니다.',
              'This version: two-player duel · shared city · spectating · server match history. Formal accounts, global rankings, seasons, replays and co-op worlds are not available yet.',
            )}
          </footer>
        </div>
      )}
      {s.error && (
        <div className="online-error" role="alert">
          {errors[s.error]?.[ko ? 0 : 1] ||
            (TEXT[ko ? 'ko' : 'en'] as unknown as Record<string, string>)[s.error] ||
            t('요청을 처리할 수 없습니다: ', 'Request rejected: ') + s.error}
          <button
            aria-label={t('알림 닫기', 'Dismiss notice')}
            onClick={() => useOnline.setState({ error: '' })}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
