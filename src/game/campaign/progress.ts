import type { Game } from '../../types/game';
import type { Profile } from '../../types/campaign';
import { available, stage, t, STAGES } from './definitions';
import { metrics } from './objectives';
export const ACHIEVEMENTS = [
  ['foundation', t('첫 건축 블록', 'First Foundation')],
  ['expansion', t('하늘의 확장', 'Sky Expansion')],
  ['builder', t('백 개의 건축물', 'Master Builder')],
  ['connection', t('완벽한 연결', 'Perfect Connection')],
  ['balance', t('완벽한 균형', 'Perfect Balance')],
  ['reinforce', t('함께 더 강하게', 'Stronger Together')],
  ['rescue', t('추락에서 구하다', 'Saved from Falling')],
  ['unbreakable', t('흔들리지 않는 도시', 'Unbreakable')],
  ['harvest', t('첫 수확', 'First Harvest')],
  ['industry', t('산업의 힘', 'Industrial Power')],
  ['prosperity', t('번영하는 도시', 'Prosperous City')],
  ['happy', t('행복한 주민', 'Happy Citizens')],
  ['chapter1', t('최초의 하늘', 'First Sky')],
  ['chapter2', t('하늘의 기술자', 'Engineer of the Sky')],
  ['chapter3', t('살아있는 문명', 'Living Civilization')],
  ['perfect', t('완벽한 챕터', 'Perfect Chapter')],
  ['firstFloor', t('첫 번째 상층', 'First Upper Floor')],
  ['threeFloors', t('세 겹의 하늘', 'Three Skies')],
  ['pillar', t('하늘을 떠받치다', 'Pillars of Civilization')],
  ['skyBridge', t('이어진 하늘', 'Connected Skies')],
  ['underCity', t('도시 아래의 도시', 'The City Beneath')],
  ['cargo', t('수직 물류', 'Vertical Freight')],
  ['gardens', t('공중 정원', 'Hanging Gardens')],
  ['chapter4', t('수직 문명', 'Vertical Civilization')],
  ['stormSurvivor', t('폭풍 생존자', 'Storm Survivor')],
  ['lightningGuardian', t('낙뢰의 수호자', 'Lightning Guardian')],
  ['meteorDefender', t('떨어지는 별의 수호자', 'Falling Star Defender')],
  ['civilizationShield', t('문명의 방패', 'Shield of Civilization')],
  ['aetherGuardian', t('에테르 수호자', 'Aether Guardian')],
  ['noOneLeft', t('모두의 피난처', 'No One Left Behind')],
  ['rebuildSky', t('하늘을 재건하다', 'Rebuild the Sky')],
  ['resilient', t('회복력의 거장', 'Master of Resilience')],
  ['allStorms', t('모든 폭풍을 넘어', 'Against All Storms')],
  ['chapter5', t('마지막 피난처', 'The Last Refuge')],
] as const;
export const freshProfile = (name = 'Architect'): Profile => ({
  version: 1,
  name: name.trim().slice(0, 32) || 'Architect',
  records: {},
  achievements: {},
  xp: 0,
  seen: [],
  unlocked: available(1),
  choices: {},
  stats: { time: 0, built: 0, expanded: 0, population: 0, stability: 0, repairs: 0 },
  legacyImported: false,
});
export function starsFor(p: Profile, id: number) {
  return Math.max(
    0,
    ...Object.entries(p.records)
      .filter(([k]) => k.startsWith(id + ':') && !k.includes(':daily:'))
      .map(([, v]) => v.stars),
  );
}
export function canStart(p: Profile, id: number) {
  return id >= 100 || id === 1 || starsFor(p, id) > 0 || starsFor(p, id - 1) > 0;
}
export function recordKey(g: Game) {
  return (
    g.campaign!.stage +
    ':' +
    g.difficulty +
    (g.campaign!.daily ? ':daily:' + g.campaign!.daily : '')
  );
}
export function updateProfile(
  p: Profile,
  previous: Game,
  g: Game,
  now = new Date().toISOString(),
): Profile {
  const c = g.campaign;
  if (!c || c.continued) return p;
  const v = metrics(g),
    campaign = c.stage < 100;
  let next: Profile = {
    ...p,
    stats: campaign
      ? {
          time: p.stats.time + Math.max(0, g.elapsed - previous.elapsed),
          built: p.stats.built + Math.max(0, c.placed - (previous.campaign?.placed ?? c.placed)),
          expanded: p.stats.expanded + Math.max(0, g.platforms.length - previous.platforms.length),
          population: Math.max(p.stats.population, g.population),
          stability: Math.max(p.stats.stability, v.stability),
          repairs:
            p.stats.repairs + Math.max(0, g.structure.repairsDone - previous.structure.repairsDone),
        }
      : p.stats,
    seen: [...new Set([...p.seen, ...c.seen.map((s) => c.stage + ':' + s)])].slice(-256),
    choices: c.choice ? { ...p.choices, [c.stage]: c.choice } : p.choices,
  };
  if (c.result && !c.claimed) {
    const k = recordKey(g),
      old = p.records[k],
      maxStars = starsFor(p, c.stage),
      r = c.result,
      d = stage(c.stage);
    const unlocked = [...new Set([...p.unlocked, ...(campaign ? available(d.next ?? 25) : [])])];
    const freshUnlocks = unlocked.length - p.unlocked.length;
    const deltaStars = Math.max(0, r.stars - (c.daily ? (old?.stars ?? 0) : maxStars));
    const xp = c.daily ? 0 : (maxStars === 0 ? d.xp : 0) + deltaStars * 25 + freshUnlocks * 10;
    next = {
      ...next,
      xp: next.xp + xp,
      unlocked,
      records: {
        ...p.records,
        [k]: {
          best: old && old.best.score >= r.score ? old.best : r,
          latest: r,
          stars: Math.max(old?.stars ?? 0, r.stars),
        },
      },
    };
  }
  if (campaign) {
    const chapterDone = (ch: number, n = 1) =>
      STAGES.filter((s) => s.chapter === ch).every((s) => starsFor(next, s.id) >= n);
    const conditions: Record<string, boolean> = {
      foundation: next.stats.built >= 1,
      expansion: next.stats.expanded >= 25,
      builder: next.stats.built >= 100,
      connection: v.homes >= 3 && v.connection === 1,
      balance: v.stability >= 95 && v.liftMargin >= 0,
      reinforce: v.reinforced >= 10,
      rescue: [9, 14].includes(c.stage) && !!c.result,
      unbreakable: c.safeTime >= 120,
      harvest: v.farms > 0 && g.elapsed >= 1,
      industry: v.materials >= 1,
      prosperity: c.profitTime >= 60,
      happy: v.happiness >= 85,
      chapter1: chapterDone(1),
      chapter2: chapterDone(2),
      chapter3: chapterDone(3),
      firstFloor: v.upperHomes >= 1,
      threeFloors: v.usedFloors >= 3,
      pillar: v.columns >= 3 && v.overloads === 0,
      skyBridge: v.bridges >= 2,
      underCity: v.lowerIndustry > 0,
      cargo: v.cargoLifts > 0,
      gardens: v.skyGardens >= 2,
      chapter4: chapterDone(4),
      chapter5: chapterDone(5),
      stormSurvivor: (g.disaster?.stats.storms ?? 0) > 0,
      lightningGuardian: (g.disaster?.stats.lightningProtected ?? 0) > 0,
      meteorDefender: (g.disaster?.stats.intercepted ?? 0) > 0,
      civilizationShield: (g.disaster?.stats.absorbed ?? 0) >= 200,
      aetherGuardian: (g.disaster?.stats.aether ?? 0) > 0,
      noOneLeft:
        (g.disaster?.reports.some((r) => r.evacuated > 0 && r.evacuated >= r.before.population) ??
          false) &&
        v.evacuated === 0,
      rebuildSky: g.campaign?.stage === 24 && !!g.campaign.result,
      resilient: v.resilience >= 70,
      allStorms: false,
      perfect: [1, 2, 3, 4, 5].some((n) => chapterDone(n, 3)),
    };
    const earned = Object.keys(conditions).filter((k) => conditions[k] && !next.achievements[k]);
    if (earned.length)
      next = {
        ...next,
        xp: next.xp + earned.length * 40,
        achievements: { ...next.achievements, ...Object.fromEntries(earned.map((k) => [k, now])) },
      };
  }
  return next;
}
export function dailySeed(date: string) {
  return [...date].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 2478);
}
export function localDate(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}
