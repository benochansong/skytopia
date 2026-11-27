import { useState } from 'react';
import { useGame } from '../stores/gameStore';
import { Dialog } from './Interface';
import { stage } from '../game/campaign/definitions';
import { campaignGoals, metrics } from '../game/campaign/objectives';
export function CampaignEntry() {
  const [freeStyle, setFreeStyle] = useState<'relaxed' | 'classic' | 'engineering' | 'survival'>(
    'classic',
  );
  const lang = useGame((s) => s.settings.language),
    save = useGame((s) => s.campaignSave),
    issue = useGame((s) => s.campaignIssue),
    [name, setName] = useState(''),
    [create, setCreate] = useState(false);
  const text = (ko: string, en: string) => (lang === 'ko' ? ko : en);
  return (
    <>
      <button className={save.current ? undefined : 'primary'} onClick={() => setCreate(true)}>
        {text('새 캠페인', 'New campaign')}
      </button>
      <div className="campaign-menu-row">
        <button
          className={save.current ? 'primary' : undefined}
          disabled={!save.current}
          onClick={() => useGame.getState().resumeCampaign()}
        >
          {text('캠페인 이어하기', 'Continue campaign')}
        </button>
        <button onClick={() => useGame.getState().campaignMap()}>
          {text('캠페인 지도', 'Campaign map')}
        </button>
      </div>
      <div className="campaign-menu-row free-build-row">
        <select
          aria-label={text('자유 건설 설정', 'Free build preset')}
          value={freeStyle}
          onChange={(e) => setFreeStyle(e.target.value as typeof freeStyle)}
        >
          <option value="relaxed">
            {text('편안한 건설 · 무제한 자원', 'Relaxed · unlimited resources')}
          </option>
          <option value="classic">
            {text('일반 건설 · 무작위 공급', 'Classic · random supply')}
          </option>
          <option value="engineering">
            {text('구조 도전 · 전문가 물리', 'Engineering · expert physics')}
          </option>
          <option value="survival">
            {text('생존 건설 · 재난 웨이브', 'Survival · disaster waves')}
          </option>
        </select>
        <button onClick={() => useGame.getState().startFree(false, freeStyle)}>
          {text('자유 건설', 'Free build')}
        </button>
        {save.free && (
          <button onClick={() => useGame.getState().startFree(true)}>
            {text('자유 건설 이어하기', 'Continue free build')}
          </button>
        )}
        <button onClick={() => useGame.getState().setScreen('challenges')}>
          {text('도전 모드', 'Challenges')}
        </button>
        <button onClick={() => useGame.getState().setScreen('profile')}>
          {text('건축가 프로필', 'Architect profile')}
        </button>
      </div>
      {issue && (
        <p role="alert">
          {text('캠페인 저장 확인 필요: ', 'Campaign save needs attention: ')}
          {issue === 'snapshotRecovered'
            ? text(
                '진행 기록은 보존했고 손상된 도시만 제외했습니다.',
                'Progress retained; damaged city snapshot excluded.',
              )
            : issue === 'campaignCorrupt'
              ? text(
                  '손상된 저장은 덮어쓰지 않았습니다. 새 캠페인을 시작하면 초기화됩니다.',
                  'Corrupt save has not been overwritten. Starting a new campaign resets it.',
                )
              : text('저장 공간을 확인하세요.', 'Check browser storage.')}
        </p>
      )}
      {create && (
        <Dialog
          title={text('새로운 하늘의 건축가', 'Architect of a new sky')}
          onClose={() => setCreate(false)}
        >
          <label className="name-field">
            {text('건축가 이름', 'Architect name')}
            <input
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Architect"
            />
          </label>
          {Object.keys(save.profile.records).length > 0 || save.current ? (
            <p>
              {text(
                '시작하면 기존 캠페인 진행 기록이 초기화됩니다. 실험실 저장은 유지됩니다.',
                'Starting resets campaign progress. Laboratory saves are retained.',
              )}
            </p>
          ) : null}
          <button className="primary full" onClick={() => useGame.getState().newCampaign(name)}>
            {text('여정 시작', 'Begin journey')}
          </button>
        </Dialog>
      )}
    </>
  );
}
export function CampaignObjectives() {
  const g = useGame((s) => s.game),
    lang = useGame((s) => s.settings.language),
    c = g.campaign!,
    d = stage(c.stage),
    goals = campaignGoals(g),
    values = metrics(g);
  return (
    <section className="mission-card panel campaign-objectives">
      <span className="eyebrow">
        {c.daily ? 'DAILY BLUEPRINT' : c.stage >= 100 ? 'CHALLENGE' : 'CHAPTER ' + d.chapter} ·{' '}
        {String(c.stage).padStart(2, '0')} / {d.type}
      </span>
      <h1>{d.title[lang]}</h1>
      {c.continued ? (
        <p>{lang === 'ko' ? '완료 후 자유 건설 · 기록 확정' : 'Free building · result sealed'}</p>
      ) : (
        <>
          <p>
            {lang === 'ko' ? '동시 조건 유지' : 'Hold all objectives'} {c.hold.toFixed(1)} /{' '}
            {d.hold}s
          </p>
          <ul className="objectives">
            {d.goals.map((o, i) => (
              <li key={o.id + i} className={goals[i] ? 'done' : ''}>
                <span className="goal-check">{goals[i] ? '✓' : ''}</span>
                <span>{o.text[lang]}</span>
                <small>{o.metric ? Math.round(values[o.metric] * 10) / 10 : '—'}</small>
              </li>
            ))}
          </ul>
          {d.limit && (
            <p>
              {lang === 'ko' ? '사용한 블록' : 'Blocks used'} {c.used}/{d.limit}
            </p>
          )}
          {d.timeLimit && (
            <p>
              {lang === 'ko' ? '남은 시간' : 'Time left'}{' '}
              {Math.max(0, Math.ceil(d.timeLimit - g.elapsed))}s
            </p>
          )}
        </>
      )}
      <details>
        <summary>{lang === 'ko' ? '도움말·선택 목표' : 'Help & optional goals'}</summary>
        <p>{d.story[lang]}</p>
        {c.stage === 1 && (
          <p>
            {lang === 'ko'
              ? 'WASD 이동 · Q/E 회전 · Space 배치 · 오른쪽 드래그 회전 · 휠 확대. 첫 집은 도로 왼쪽 (-1,-1)에 놓을 수 있습니다.'
              : 'WASD move · Q/E rotate · Space place · Right drag orbit · Wheel zoom. Place the first home at (-1,-1), beside the road.'}
          </p>
        )}
        {d.optional.map((o) => (
          <p key={o.id}>☆ {o.text[lang]}</p>
        ))}
      </details>
      <div className="campaign-mini-actions">
        <button onClick={() => useGame.getState().checkpoint()} disabled={!!c.result}>
          {lang === 'ko' ? '체크포인트' : 'Checkpoint'}
        </button>
        <button onClick={() => useGame.getState().pause()}>
          {lang === 'ko' ? '기록·지도' : 'Journal / map'}
        </button>
      </div>
    </section>
  );
}
