import { useEffect, useState } from 'react';
import { useGame } from '../stores/gameStore';
import { Dialog, clockText } from './Interface';
import {
  CHAPTERS,
  CHARACTERS,
  STAGES,
  CHALLENGES,
  stage,
  level,
  LEVELS,
  t,
} from '../game/campaign/definitions';
import { starsFor, canStart, ACHIEVEMENTS } from '../game/campaign/progress';
import { BLOCKS } from '../data/rules';
function useLang() {
  return useGame((s) => s.settings.language);
}
function Difficulty() {
  const lang = useLang(),
    difficulty = useGame((s) => s.settings.difficulty);
  return (
    <label>
      {lang === 'ko' ? '다음 미션 난이도' : 'Next mission difficulty'}{' '}
      <select
        value={difficulty}
        onChange={(e) =>
          useGame.getState().configure({ difficulty: e.target.value as 'easy' | 'normal' | 'hard' })
        }
      >
        <option value="easy">{lang === 'ko' ? '스토리' : 'Story'}</option>
        <option value="normal">{lang === 'ko' ? '일반' : 'Normal'}</option>
        <option value="hard">{lang === 'ko' ? '전문가' : 'Expert'}</option>
      </select>
    </label>
  );
}
function Portrait({ id }: { id: string }) {
  const p = CHARACTERS[id];
  return (
    <svg className="portrait" viewBox="0 0 100 100" role="img" aria-label={p.name.en}>
      <path d="M50 4 94 28v44L50 96 6 72V28Z" fill={p.color} opacity=".2" />
      <circle cx="50" cy="36" r="16" fill={p.color} />
      <path d="M22 80c0-30 56-30 56 0" fill={p.color} />
      <text x="50" y="89" textAnchor="middle" fill="white" fontSize="10">
        {p.initials}
      </text>
    </svg>
  );
}
export function CampaignOverlay() {
  const g = useGame((s) => s.game),
    screen = useGame((s) => s.screen),
    save = useGame((s) => s.campaignSave),
    lang = useLang(),
    [auto, setAuto] = useState(false),
    [history, setHistory] = useState(false),
    [tour, setTour] = useState(true),
    c = g.campaign!,
    d = stage(c.stage);
  useEffect(() => {
    if (!auto || !c.dialogue) return;
    const timer = setTimeout(() => useGame.getState().dialogueNext(), 4500);
    return () => clearTimeout(timer);
  }, [auto, c.dialogue, c.line]);
  useEffect(() => {
    if (!c.result || !tour) return;
    const timer = setTimeout(() => setTour(false), 6000);
    return () => clearTimeout(timer);
  }, [c.result, tour]);
  const text = (ko: string, en: string) => (lang === 'ko' ? ko : en);
  if (c.dialogue && screen === 'playing') {
    const person = CHARACTERS[d.speaker];
    return (
      <Dialog title={person.name[lang]}>
        <div className="story-speaker">
          <Portrait id={d.speaker} />
          <div>
            <span className="eyebrow">{person.role[lang]}</span>
            <h3>{d.title[lang]}</h3>
          </div>
        </div>
        <p className="story-line">
          {c.line === 0
            ? d.story[lang]
            : text(
                '도시는 아름다워야 합니다. 그리고 안전하게 하늘에 떠 있어야 합니다. 준비되면 설계를 시작하세요.',
                'A city should be beautiful—and safely supported in the sky. Begin when you are ready.',
              )}
        </p>
        <small>
          {text(
            '대화 중 모든 게임 시간이 정지됩니다.',
            'All simulation time is paused during dialogue.',
          )}
        </small>
        <div className="dialog-actions">
          <button onClick={() => useGame.getState().dialogueNext(true)}>
            {text('건너뛰기', 'Skip')}
          </button>
          <button onClick={() => setAuto(!auto)} aria-pressed={auto}>
            {text('자동 재생', 'Auto play')}
          </button>
          <button className="primary" onClick={() => useGame.getState().dialogueNext()}>
            {c.line ? text('설계 시작', 'Start building') : text('다음 대사', 'Next line')}
          </button>
        </div>
      </Dialog>
    );
  }
  if (screen === 'playing' && d.choice && !c.choice && !c.result)
    return (
      <div className="story-choice panel">
        <span className="eyebrow">{text('선택적 이야기', 'OPTIONAL STORY')}</span>
        <p>
          {d.choice === 'survivors'
            ? text(
                '탐험대가 생존자 8명을 발견했습니다. 받아들이면 주거와 식량이 필요합니다.',
                'The expedition found 8 survivors. Welcoming them requires food and shelter.',
              )
            : text(
                '자재 60을 연구에 지원하면 에테르 10과 이번 미션의 에테르 발전소 시험 권한을 얻습니다.',
                'Fund research with 60 materials to receive 10 Aether and trial access to an Aether plant this mission.',
              )}
        </p>
        <button
          onClick={() =>
            useGame.getState().storyChoice(d.choice === 'survivors' ? 'accept' : 'research')
          }
        >
          {d.choice === 'survivors'
            ? text('주민 받아들이기', 'Welcome survivors')
            : text('연구 지원', 'Fund research')}
        </button>
        <button onClick={() => useGame.getState().storyChoice('defer')}>
          {text('기반시설 우선', 'Focus on infrastructure')}
        </button>
      </div>
    );
  if (screen === 'paused')
    return (
      <Dialog title={text('건축가의 기록', 'Architect’s journal')}>
        <Difficulty />
        <p>
          {text(
            '현재 미션 난이도는 시작 시 확정됩니다. 전문가 체크포인트 복원은 결과 점수에 10% 감점을 적용합니다.',
            'Run difficulty is fixed at launch. Expert checkpoint restoration reduces the result score by 10%.',
          )}
        </p>
        <div className="stack-buttons">
          <button className="primary" onClick={() => useGame.getState().pause()}>
            {text('계속하기', 'Resume')}
          </button>
          <button onClick={() => useGame.getState().checkpoint()} disabled={!!c.result}>
            {text('체크포인트 저장', 'Save checkpoint')}
          </button>
          <button disabled={!save.checkpoint} onClick={() => useGame.getState().checkpoint(true)}>
            {text('체크포인트 불러오기', 'Restore checkpoint')}
          </button>
          <button onClick={() => setHistory(!history)}>
            {text('대화 기록', 'Dialogue history')}
          </button>
          {history && (
            <p>
              {d.story[lang]}
              <br />
              {text('대화·상황 기록: ', 'Dialogue and events: ')}
              {c.history
                .map((id) =>
                  id === 'briefing'
                    ? text('미션 브리핑', 'Mission briefing')
                    : id === 'crisis'
                      ? text('구조 위기 감지', 'Structural crisis detected')
                      : text('첫 목표 달성', 'First objective reached'),
                )
                .join(' · ') || '—'}
            </p>
          )}
          <button onClick={() => useGame.getState().setScreen('settings')}>
            {text('설정', 'Settings')}
          </button>
          <button onClick={() => useGame.getState().campaignMap()}>
            {text('캠페인 지도', 'Campaign map')}
          </button>
          <button onClick={() => useGame.getState().setScreen('menu')}>
            {text('메인 메뉴', 'Main menu')}
          </button>
        </div>
      </Dialog>
    );
  if (screen === 'gameover') {
    const reason = c.failed ?? g.structure.loss?.reason;
    const reasons = {
      timeout: t('미션 제한시간을 초과했습니다.', 'The mission time limit expired.'),
      protected: t(
        '보호 대상 산업시설이 사라졌습니다.',
        'A protected industrial facility was lost.',
      ),
      blocks: t(
        '남은 블록으로 필수 주거 연결을 완성할 수 없습니다.',
        'The block budget cannot complete the required housing connection.',
      ),
      lift: t(
        '부양력 부족이 유예 시간 이후에도 지속됐습니다.',
        'Insufficient lift persisted beyond the grace period.',
      ),
      balance: t('치명적 기울기를 회복하지 못했습니다.', 'Critical tilt could not be recovered.'),
      core: t('에테르 코어가 손실됐습니다.', 'The Aether core was lost.'),
    };
    return (
      <Dialog title={text('다시, 하늘로', 'Return to the sky')}>
        <p>{reasons[reason as keyof typeof reasons]?.[lang]}</p>
        <p>
          {text('첫 구조 실패 기록: ', 'First structural failure: ')}
          {g.structure.loss?.firstFailure || '—'}
        </p>
        <p>
          {text(
            '다음 시도에서 확인할 항목: 연결부 하중, 부양 전력, 목표 우선순위.',
            'For the next attempt: inspect connection loads, lift power and objective priorities.',
          )}
        </p>
        <Difficulty />
        <div className="stack-buttons">
          <button
            className="primary"
            onClick={() => useGame.getState().startStage(c.stage, !!c.daily)}
          >
            {text('다시 도전', 'Retry')}
          </button>
          <button disabled={!save.checkpoint} onClick={() => useGame.getState().checkpoint(true)}>
            {text('체크포인트 불러오기', 'Restore checkpoint')}
          </button>
          <button onClick={() => useGame.getState().start('training')}>
            {text('건축 훈련', 'Building training')}
          </button>
          <button onClick={() => useGame.getState().campaignMap()}>
            {text('캠페인 지도', 'Campaign map')}
          </button>
        </div>
      </Dialog>
    );
  }
  if (screen === 'victory' && c.result) {
    const r = c.result;
    if (tour)
      return (
        <div className="campaign-cinematic panel">
          <span className="eyebrow">
            {d.id % 5 === 0 ? 'CHAPTER COMPLETE' : 'MISSION COMPLETE'}
          </span>
          <h1>{d.title[lang]}</h1>
          <p>
            {d.id === 15
              ? text(
                  '오리온: 저 구름 너머에 무엇이 있는지, 이제 우리가 알아낼 차례입니다.',
                  'Orion: Now it is our turn to discover what lies beyond those clouds.',
                )
              : text(
                  '당신이 건설한 도시가 새로운 하루를 맞이합니다.',
                  'The city you built welcomes a new day.',
                )}
          </p>
          <button onClick={() => setTour(false)}>
            {text('결과 보기 · 연출 건너뛰기', 'View results · Skip tour')}
          </button>
        </div>
      );
    return (
      <Dialog title={text('미션 완료', 'Mission complete')} wide>
        <div className="result-stars">
          {'★'.repeat(r.stars)}
          {'☆'.repeat(3 - r.stars)}
        </div>
        <h3>{d.title[lang]}</h3>
        <div className="victory-stats">
          {[
            [text('총점', 'Score'), r.score],
            [text('플레이 시간', 'Time'), clockText(r.time)],
            [text('최종 인구', 'Population'), Math.floor(r.population)],
            [text('안정도', 'Stability'), r.stability.toFixed(1) + '%'],
            [text('순수익 /분', 'Net /min'), (r.net * 60).toFixed(1)],
            [text('경험치 누적', 'Total XP'), save.profile.xp],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        <p>
          {text(
            '필수 목표 완료 · 별 개선과 최초 해금만 추가 경험치를 지급합니다.',
            'Required objectives completed. Only new stars and unlocks grant additional XP.',
          )}
        </p>
        {c.rewards && (
          <p>
            {text('이번 보상', 'This result')}: +{c.rewards.xp} XP ·{' '}
            {c.rewards.unlocked.map((k) => BLOCKS[k][lang]).join(' · ') ||
              text('추가 시설 해금 없음', 'No additional facility unlocks')}
            {c.rewards.achievements.length > 0
              ? ' · ' +
                c.rewards.achievements
                  .map((id) => ACHIEVEMENTS.find((a) => a[0] === id)?.[1][lang])
                  .join(' · ')
              : ''}
          </p>
        )}
        {d.optional.map((o, i) => (
          <p key={o.id}>
            {r.optional[i] ? '✓' : '○'} {o.text[lang]}
          </p>
        ))}
        <div className="dialog-actions">
          <button onClick={() => useGame.getState().campaignMap()}>
            {text('캠페인 지도', 'Campaign map')}
          </button>
          <button onClick={() => useGame.getState().startStage(c.stage, !!c.daily)}>
            {text('다시 도전', 'Replay')}
          </button>
          <button onClick={() => useGame.getState().continueCity()}>
            {text('도시 계속 건설', 'Keep building')}
          </button>
          {d.next && (
            <button className="primary" onClick={() => useGame.getState().startStage(d.next!)}>
              {text('다음 미션', 'Next mission')}
            </button>
          )}
        </div>
      </Dialog>
    );
  }
  return null;
}
function Opening() {
  const lang = useLang(),
    [scene, setScene] = useState(0),
    lines = [
      t('인류는 한때 지상에서 번영했다.', 'Humanity once flourished upon the earth.'),
      t(
        '에테르. 무너진 세계에서 발견한 새로운 힘.',
        'Aether. A new force discovered in a fallen world.',
      ),
      t('우리는 중력을 넘어 하늘로 향했다.', 'We rose beyond gravity into the sky.'),
      t('하나의 섬에서, 새로운 문명이 시작된다.', 'From one island, a new civilization begins.'),
      t('당신은 하늘 문명의 건축가입니다.', 'You are the architect of a civilization in the sky.'),
    ];
  useEffect(() => {
    const timer = setTimeout(
      () => (scene === 4 ? useGame.getState().finishOpening() : setScene(scene + 1)),
      9000,
    );
    return () => clearTimeout(timer);
  }, [scene]);
  return (
    <div className={'opening opening-' + scene}>
      <span className="eyebrow">2478 · THE SKYTOPIA PROJECT</span>
      <div className="opening-sigil">◇</div>
      <h1>{scene === 4 ? 'SKYTOPIA' : String(scene + 1).padStart(2, '0')}</h1>
      <p>{lines[scene][lang]}</p>
      <button onClick={() => useGame.getState().finishOpening()}>
        {lang === 'ko' ? '오프닝 건너뛰기' : 'Skip opening'}
      </button>
    </div>
  );
}
export default function CampaignScreens() {
  const screen = useGame((s) => s.screen),
    save = useGame((s) => s.campaignSave),
    lang = useLang(),
    [chapter, setChapter] = useState(1),
    [selected, setSelected] = useState(1);
  const p = save.profile,
    text = (ko: string, en: string) => (lang === 'ko' ? ko : en);
  if (screen === 'opening') return <Opening />;
  if (screen === 'profile')
    return (
      <section className="campaign-page">
        <header>
          <span className="eyebrow">ARCHITECT ARCHIVE</span>
          <button onClick={() => useGame.getState().setScreen('menu')}>
            {text('메인 메뉴', 'Main menu')}
          </button>
        </header>
        <h1>{p.name}</h1>
        <h2>
          {LEVELS[level(p.xp)][lang]} · {p.xp} XP
        </h2>
        <div className="profile-grid">
          {Object.entries(p.stats).map(([k, v]) => (
            <article key={k}>
              <span>
                {
                  {
                    time: t('캠페인 플레이 시간', 'Campaign time'),
                    built: t('배치 블록', 'Placed blocks'),
                    expanded: t('확장 플랫폼', 'Expanded tiles'),
                    population: t('최대 인구', 'Peak population'),
                    stability: t('최고 안정도', 'Peak stability'),
                    repairs: t('완료한 수리', 'Completed repairs'),
                  }[k as keyof typeof p.stats][lang]
                }
              </span>
              <strong>{k === 'time' ? clockText(v) : Math.floor(v)}</strong>
            </article>
          ))}
        </div>
        <h2>
          {text('도전 과제', 'Achievements')} · {Object.keys(p.achievements).length}/16
        </h2>
        <div className="achievement-grid">
          {ACHIEVEMENTS.map(([id, label]) => (
            <article key={id} className={p.achievements[id] ? 'earned' : ''}>
              <span>
                {p.achievements[id] ? '◆' : '◇'} {label[lang]}
              </span>
              <small>{p.achievements[id]?.slice(0, 10) || text('미달성', 'Not earned')}</small>
            </article>
          ))}
        </div>
        <h2>{text('해금한 시설', 'Unlocked facilities')}</h2>
        <p>{p.unlocked.map((k) => BLOCKS[k][lang]).join(' · ')}</p>
        <h2>{text('개인 기록 · 난이도별', 'Personal records · by difficulty')}</h2>
        {Object.entries(p.records).map(([k, r]) => (
          <p key={k}>
            {stage(Number(k.split(':')[0])).title[lang]} · {k.split(':').slice(1).join(' / ')} ·{' '}
            {'★'.repeat(r.stars)} · {text('최고', 'Best')} {r.best.score} / {text('최근', 'Latest')}{' '}
            {r.latest.score}
          </p>
        ))}
      </section>
    );
  if (screen === 'challenges')
    return (
      <section className="campaign-page">
        <header>
          <span className="eyebrow">CHALLENGE ATELIER</span>
          <button onClick={() => useGame.getState().setScreen('menu')}>
            {text('메인 메뉴', 'Main menu')}
          </button>
        </header>
        <h1>{text('또 다른 설계', 'Another blueprint')}</h1>
        <p>
          {text(
            '고정 도전 3개와 로컬 날짜 기반 오늘의 설계도. 개인 기록만 저장합니다.',
            'Three fixed challenges and a local-date blueprint. Personal records only.',
          )}
        </p>
        <Difficulty />
        <div className="challenge-grid">
          {CHALLENGES.map((d) => (
            <article key={d.id}>
              <span className="eyebrow">{d.type}</span>
              <h2>{d.title[lang]}</h2>
              <p>{d.story[lang]}</p>
              <button className="primary" onClick={() => useGame.getState().startStage(d.id)}>
                {text('도전 시작', 'Start challenge')}
              </button>
            </article>
          ))}
          <article>
            <span className="eyebrow">DAILY BLUEPRINT</span>
            <h2>{text('오늘의 설계도', 'Today’s blueprint')}</h2>
            <p>
              {text(
                '같은 로컬 날짜에는 동일한 도시·공급 시드를 사용합니다.',
                'The same local date uses the same city and supply seed.',
              )}
            </p>
            <button onClick={() => useGame.getState().startStage(103, true)}>
              {text('오늘의 도전', 'Daily challenge')}
            </button>
          </article>
        </div>
      </section>
    );
  const d = stage(selected),
    allowed = canStart(p, d.id),
    total = STAGES.reduce((n, s) => n + starsFor(p, s.id), 0);
  return (
    <section className="campaign-page map-page">
      <header>
        <div>
          <span className="eyebrow">SKY CAMPAIGN · {p.name}</span>
          <h1>{text('하늘의 개척자', 'Pioneers of the sky')}</h1>
        </div>
        <div>
          <span>★ {total}/45</span>
          <button onClick={() => useGame.getState().setScreen('menu')}>
            {text('메인 메뉴', 'Main menu')}
          </button>
        </div>
      </header>
      <div className="map-layout">
        <div>
          <div
            className="sky-map"
            role="group"
            aria-label={text('하늘 세계 지도', 'Sky world map')}
          >
            <svg viewBox="0 0 700 470" aria-hidden="true">
              <path
                className={starsFor(p, 5) ? 'sky-route completed-route' : 'sky-route'}
                d="M120 330 Q180 110 350 170"
              />
              <path
                className={starsFor(p, 10) ? 'sky-route completed-route' : 'sky-route'}
                d="M350 170 Q520 230 580 95"
              />
              <path className="future-route" d="M580 95 610 330 375 370" />
              {[
                [120, 330],
                [350, 170],
                [580, 95],
                [610, 330],
                [375, 370],
                [150, 100],
              ].map(([x, y], i) => (
                <g key={i} transform={'translate(' + x + ' ' + y + ')'}>
                  <ellipse rx="65" ry="22" fill={CHAPTERS[i].color} opacity={i < 3 ? 0.65 : 0.15} />
                  <path d="M-65 0 0 85 65 0 0 22Z" fill={i < 3 ? '#345f65' : '#344550'} />
                  <path d="M-35 -4 0 -35 40 -5 0 10Z" fill={CHAPTERS[i].color} opacity=".65" />
                </g>
              ))}
            </svg>
            {CHAPTERS.map((ch, i) => (
              <button
                key={ch.id}
                className={'map-island map-island-' + i + (chapter === ch.id ? ' selected' : '')}
                disabled={ch.planned}
                onClick={() => {
                  setChapter(ch.id);
                  setSelected((ch.id - 1) * 5 + 1);
                }}
              >
                <small>{ch.region}</small>
                <strong>{ch.title[lang]}</strong>
                <span>
                  {ch.planned
                    ? text('개발 예정', 'Planned')
                    : Array.from({ length: 5 }, (_, j) => starsFor(p, i * 5 + j + 1)).reduce(
                        (a, b) => a + b,
                        0,
                      ) + ' / 15 ★'}
                </span>
              </button>
            ))}
          </div>
          <div className="stage-strip">
            {STAGES.filter((s) => s.chapter === chapter).map((s) => (
              <button
                className={s.id === selected ? 'selected' : ''}
                key={s.id}
                onClick={() => setSelected(s.id)}
              >
                <strong>{String(s.id).padStart(2, '0')}</strong>
                <span>{s.title[lang]}</span>
                <small>
                  {canStart(p, s.id)
                    ? '★'.repeat(starsFor(p, s.id)) || text('도전 가능', 'Available')
                    : text('잠김', 'Locked')}
                </small>
              </button>
            ))}
          </div>
        </div>
        <aside className="stage-brief">
          <span className="eyebrow">
            {d.type} · {d.layout.toUpperCase()}
          </span>
          <h2>{d.title[lang]}</h2>
          <p>{d.story[lang]}</p>
          <p>
            ★ {starsFor(p, d.id)}/3 · {text('최고 점수', 'Best score')}{' '}
            {Math.max(
              0,
              ...Object.entries(p.records)
                .filter(([k]) => k.startsWith(d.id + ':'))
                .map(([, r]) => r.best.score),
            )}
          </p>
          <ul>
            {d.goals.map((o, i) => (
              <li key={o.id + i}>{o.text[lang]}</li>
            ))}
          </ul>
          <p>
            {text('필수 조건 유지', 'Required hold')}: {d.hold}s
          </p>
          <Difficulty />
          <p className="muted">
            {text(
              '난이도별 최고 점수 저장 · 별 1개로 다음 미션 해금',
              'Best scores by difficulty · One star unlocks the next mission',
            )}
          </p>
          <button
            className="primary full"
            disabled={!allowed}
            onClick={() => useGame.getState().startStage(d.id)}
          >
            {allowed
              ? text('미션 시작', 'Start mission')
              : text('이전 미션 완료 필요', 'Complete the previous mission')}
          </button>
          {save.current && (
            <button className="full" onClick={() => useGame.getState().resumeCampaign()}>
              {text('진행 중인 도시 이어하기', 'Continue current city')}
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}
