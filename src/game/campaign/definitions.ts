import type { Goal, LocalText, Metric, Stage } from '../../types/campaign';
import type { Kind } from '../../types/game';
import { KINDS } from '../../data/rules';
export const t = (ko: string, en: string): LocalText => ({ ko, en });
const goal = (
  id: Metric,
  ko: string,
  en: string,
  target: number,
  max = false,
  once = false,
): Goal => ({ id, text: t(ko, en), metric: id, target, max, once });
const pop = (n: number) => goal('population', '인구 ' + n + '명', n + ' inhabitants', n);
const stable = (n: number) => goal('stability', '안정도 ' + n + '%', n + '% stability', n);
const power = goal('powerMargin', '전력 자급', 'Power balance', 0);
const food = goal('foodMargin', '식량 자급', 'Food self-sufficiency', 0);
const connected = goal('connection', '주거 도로 연결 100%', 'Connect all homes', 1);
const noOver = goal('overloads', '과부하 연결부 없음', 'No overloaded connections', 0, true);
const happy = (n: number) => goal('happiness', '행복도 ' + n, n + ' happiness', n);
const industry = (n: number) =>
  goal('industry', '산업시설 ' + n + '개 가동', n + ' working industries', n);
const base: Kind[] = ['platform', 'home', 'road', 'power'];
export const available = (id: number): Kind[] =>
  id >= 11
    ? [...KINDS]
    : [
        ...base,
        ...(id >= 4 ? (['farm', 'warehouse', 'park', 'largeHome'] as Kind[]) : []),
        ...(id >= 6 ? (['metalPlatform', 'brace', 'liftSmall', 'ballast'] as Kind[]) : []),
        ...(id >= 7 ? (['liftLarge'] as Kind[]) : []),
        ...(id >= 10 ? (['factory', 'workshop'] as Kind[]) : []),
      ];
export const CHAPTERS = [
  {
    id: 1,
    title: t('최초의 하늘', 'The First Sky'),
    region: 'First Sky',
    color: '#8bd4c5',
    sky: '#abd7e3',
    rock: '#71836e',
    music: [261.63, 329.63, 392],
    planned: false,
  },
  {
    id: 2,
    title: t('문명의 무게', 'The Weight of Civilization'),
    region: 'Stone Canyon',
    color: '#dba877',
    sky: '#dec3a4',
    rock: '#a17a61',
    music: [146.83, 174.61, 220],
    planned: false,
  },
  {
    id: 3,
    title: t('살아있는 문명', 'A Living Civilization'),
    region: 'Emerald Archipelago',
    color: '#e6ce8b',
    sky: '#d7b7c0',
    rock: '#5c8b79',
    music: [196, 246.94, 293.66, 392],
    planned: false,
  },
  {
    id: 4,
    title: t('수직의 지평선', 'Vertical Horizons'),
    region: 'Vertical Highlands',
    color: '#b8cbd6',
    planned: true,
  },
  {
    id: 5,
    title: t('부서진 하늘', 'The Broken Sky'),
    region: 'Broken Sky',
    color: '#899aae',
    planned: true,
  },
  {
    id: 6,
    title: t('구름 너머', 'Beyond the Clouds'),
    region: 'Beyond the Clouds',
    color: '#d3c39e',
    planned: true,
  },
];
export const CHARACTERS: Record<
  string,
  { name: LocalText; role: LocalText; color: string; initials: string }
> = {
  elena: {
    name: t('엘레나 보스', 'Elena Voss'),
    role: t('수석 구조 기술자', 'Chief structural engineer'),
    color: '#9ed6d2',
    initials: 'EV',
  },
  kael: {
    name: t('카엘 렌 박사', 'Dr. Kael Ren'),
    role: t('에테르 연구 과학자', 'Aether scientist'),
    color: '#b8a5df',
    initials: 'KR',
  },
  maya: {
    name: t('마야 솔렌', 'Maya Solen'),
    role: t('도시 운영 책임자', 'City operations director'),
    color: '#dfc084',
    initials: 'MS',
  },
  orion: {
    name: t('오리온 베일', 'Orion Vale'),
    role: t('공중 탐험대장', 'Sky expedition captain'),
    color: '#e49b83',
    initials: 'OV',
  },
};
const seedStage = (
  id: number,
  title: LocalText,
  type: Stage['type'],
  source: Stage['source'],
  layout: string,
  goals: Goal[],
  story: LocalText,
  patch: Partial<Stage> = {},
): Stage => ({
  id,
  chapter: Math.ceil(id / 5),
  title,
  type,
  source,
  layout,
  goals,
  story,
  seed: 2478 + id * 131,
  resources: 600,
  food: id >= 4,
  structure: id > 1,
  fall: id > 1,
  allowed: available(id),
  script: available(id),
  hold: id === 1 ? 0 : 10,
  optional: [stable(90), goal('collapse', '추가 붕괴 없음', 'No additional collapse', 0, true)],
  speaker: id <= 3 ? 'elena' : id <= 5 ? 'maya' : id <= 10 ? 'elena' : 'maya',
  next: id < 15 ? id + 1 : undefined,
  xp: 100 + id * 10,
  ...patch,
});
export const STAGES: Stage[] = [
  seedStage(
    1,
    t('최초의 빛', 'First Light'),
    'BUILD',
    1,
    'square',
    [
      goal('placed', '블록 5개 배치', 'Place 5 blocks', 5, false, true),
      goal('homes', '주거시설 3개', 'Build 3 homes', 3),
      connected,
      pop(15),
    ],
    t(
      '2478년, 지상을 떠난 인류의 첫 보금자리입니다. 도로 옆에 집을 세워 새로운 삶을 시작하세요.',
      'In 2478, humanity takes to the sky. Build homes beside roads and begin again.',
    ),
    {
      script: ['home', 'road', 'home', 'power', 'road', 'home'],
      optional: [connected, stable(90)],
    },
  ),
  seedStage(
    2,
    t('삶의 터전', 'A Place to Live'),
    'BUILD',
    1,
    'long',
    [pop(30), connected, power, stable(70)],
    t(
      '전력은 연결된 도로를 따라 흐릅니다. 여섯 가구가 살아갈 공간을 마련하세요.',
      'Power follows connected roads. Make room for six households.',
    ),
    { script: ['home', 'road', 'home', 'home', 'power', 'road', 'home'] },
  ),
  seedStage(
    3,
    t('섬의 경계를 넘어', 'Beyond the Edge'),
    'EXPAND',
    1,
    'L',
    [
      goal('expansion', '플랫폼 12칸 확장', 'Expand by 12 tiles', 12, false, true),
      goal('outerHome', '확장 구역의 연결 주거', 'Connected home on new ground', 1),
      connected,
      stable(75),
    ],
    t(
      '섬 밖으로 길을 이어 보세요. 무거운 시설은 중심 가까이 배치하면 균형을 지키기 쉽습니다.',
      'Extend the island. Keep heavy facilities near its center.',
    ),
    { script: ['platform', 'platform', 'road', 'home', 'platform', 'platform', 'road', 'power'] },
  ),
  seedStage(
    4,
    t('첫 번째 수확', 'The First Harvest'),
    'OPTIMIZE',
    5,
    'cross',
    [
      pop(40),
      goal('farms', '농업시설 2개 가동', 'Operate two farms', 2),
      food,
      goal('foodStock', '저장 식량 60', 'Store 60 food', 60),
    ],
    t(
      '주민들은 매일 식량이 필요합니다. 연결된 농장과 비축량을 함께 확인하세요.',
      'Residents need food every day. Connect farms and watch the reserves.',
    ),
    { script: ['farm', 'home', 'farm', 'road', 'largeHome'], choice: 'survivors' },
  ),
  seedStage(
    5,
    t('하늘의 정착지', 'Sky Settlement'),
    'SURVIVE',
    5,
    'square',
    [pop(75), power, food, stable(75), goal('amenities', '생활시설 운영', 'Operate an amenity', 1)],
    t(
      '이제 마을의 하루를 지켜봅시다. 모든 조건을 30초 동안 유지하세요.',
      'Keep the settlement safe, fed and powered for 30 seconds.',
    ),
    {
      hold: 30,
      population: 40,
      script: ['largeHome', 'farm', 'power', 'park', 'liftSmall'],
      allowed: [...available(5), 'liftSmall'],
    },
  ),
  seedStage(
    6,
    t('발전의 무게', 'The Weight of Progress'),
    'EXPAND',
    2,
    'long',
    [
      pop(60),
      goal('lifts', '소형 부양장치 설치', 'Install a levitator', 1),
      goal('expansion', '플랫폼 6칸 확장', 'Expand by 6 tiles', 6, false, true),
      stable(75),
    ],
    t(
      '새 건물은 새로운 무게입니다. 확장과 함께 부양력을 확보하세요.',
      'Every building adds weight. Extend support as you extend the island.',
    ),
    { food: false, script: ['largeHome', 'liftSmall', 'power', 'platform', 'road', 'largeHome'] },
  ),
  seedStage(
    7,
    t('하늘의 균형', 'Balance of the Sky'),
    'BALANCE',
    3,
    'overcrowded',
    [
      goal('separationGain', '두 중심 거리 25% 감소', 'Reduce center separation by 25%', 0.25),
      goal('lifts', '부양장치 설치', 'Install a levitator', 1),
      stable(80),
    ],
    t(
      '산업시설이 동쪽에 집중되어 있습니다. 분석 화면에서 질량과 부양 중심을 비교하세요.',
      'Industry weighs down the east. Compare mass and lift centers before building.',
    ),
    {
      food: false,
      script: ['liftSmall', 'brace', 'power', 'liftLarge'],
      optional: [
        stable(90),
        {
          id: 'efficient',
          text: t('무붕괴·자재 360 이상 보유', 'No collapse; retain 360 materials'),
          all: [
            goal('collapse', '', '', 0, true),
            {
              id: 'spend',
              text: t('자재 절약', 'Conserve materials'),
              metric: 'credits',
              target: 360,
            },
          ],
        },
      ],
    },
  ),
  seedStage(
    8,
    t('위태로운 연결', 'Fragile Connection'),
    'PRESERVE',
    4,
    'bottleneck',
    [
      goal('reinforced', '연결부 2개 이상 보강', 'Reinforce two connections', 2),
      goal('alternatePath', '병목에 대체 지지 경로', 'Create a parallel support path', 1),
      noOver,
    ],
    t(
      '좁은 목이 산업 구역 전체를 지탱합니다. 공장을 보존하고 옆으로 새 지지 경로를 만드세요.',
      'A narrow neck supports the industrial district. Preserve the factories and build a parallel path.',
    ),
    {
      food: false,
      protect: ['factory'],
      script: ['metalPlatform', 'metalPlatform', 'brace', 'liftSmall', 'power'],
    },
  ),
  seedStage(
    9,
    t('추락에 맞서다', 'Against the Fall'),
    'REPAIR',
    4,
    'damaged',
    [
      goal('repairs', '손상 구조물 수리', 'Complete a repair', 1),
      power,
      stable(80),
      goal('survive', '60초 생존', 'Survive 60 seconds', 60),
    ],
    t(
      '동쪽 외곽 일부를 잃었습니다. 남은 발전소와 연결부를 수리하고 코어를 지키세요.',
      'Part of the eastern rim is gone. Repair power and connections to protect the core.',
    ),
    { food: false, script: ['power', 'brace', 'liftSmall', 'metalPlatform'] },
  ),
  seedStage(
    10,
    t('기술자의 도시', "The Engineer's City"),
    'BUILD',
    7,
    'square',
    [
      pop(120),
      industry(2),
      stable(85),
      goal('liftMargin', '부양 여유 80t', '80t lift reserve', 80),
      noOver,
    ],
    t(
      '안전은 완성된 도시에서도 계속 설계해야 합니다. 생산과 구조를 함께 안정화하세요.',
      'Safety remains a design task in a growing city. Stabilize production and structure.',
    ),
    {
      hold: 30,
      allowed: [
        ...available(10),
        'advancedPower',
        'greenhouse',
        'housingEstate',
        'warehouse',
        'clinic',
        'shop',
        'plaza',
        'battery',
        'refinery',
      ],
      script: ['liftSmall', 'park', 'factory', 'power'],
    },
  ),
  seedStage(
    11,
    t('문명의 에너지', 'Power of Civilization'),
    'REPAIR',
    6,
    'damaged',
    [
      power,
      goal('powerMargin', '발전 여유 30', '30 power reserve', 30),
      goal('newPower', '발전시설 1개 확충', 'Build one new generator', 1),
      connected,
      goal('lifts', '부양장치 3개 정상 가동', 'Power three levitators', 3),
    ],
    t(
      '발전소가 정지했고 접속부가 끊겼습니다. 연결을 수리한 뒤 가동하고 발전 여유를 확보하세요.',
      'Power plants are stopped and a feed is broken. Repair, restart and build a reserve.',
    ),
    {
      allowed: available(11).filter((k) => k !== 'aetherPower'),
      script: ['advancedPower', 'power', 'relay', 'battery'],
      choice: 'research',
      speaker: 'kael',
    },
  ),
  seedStage(
    12,
    t('산업의 시대', 'The Industrial Age'),
    'OPTIMIZE',
    7,
    'overcrowded',
    [
      pop(150),
      industry(3),
      goal('materials', '자재 생산 0.8/초', 'Produce 0.8 materials/sec', 0.8),
      goal('workers', '필요 노동력 충족', 'Meet workforce demand', 0),
      goal('net', '경제 흑자', 'Positive cash flow', 0.01),
    ],
    t(
      '사람과 에너지가 산업을 움직입니다. 인력 우선순위와 실제 생산량을 확인하세요.',
      'People and energy power industry. Check priorities and actual throughput.',
    ),
    { script: ['workshop', 'factory', 'warehouse', 'park'] },
  ),
  seedStage(
    13,
    t('우리의 하늘 도시', 'A City to Call Home'),
    'OPTIMIZE',
    8,
    'overcrowded',
    [
      happy(85),
      goal('amenities', '공원 운영', 'Operate a park', 1),
      goal('clinic', '병원 운영', 'Operate a clinic', 1),
      goal('housingSpare', '여유 주거 10명', 'Room for 10 more people', 10),
      food,
      power,
      goal('noise', '산업 소음 영향 5 이하', 'Noise impact at most 5', 5, true),
    ],
    t(
      '도시의 성장은 삶의 질로 완성됩니다. 공원으로 산업 소음을 완충하고 이웃의 공간을 지키세요.',
      'A city thrives through quality of life. Buffer industry with parks and make room for neighbors.',
    ),
    { script: ['park', 'plaza', 'apartment', 'park', 'clinic'] },
  ),
  seedStage(
    14,
    t('침묵의 도시', 'The Silent City'),
    'REPAIR',
    9,
    'damaged',
    [
      power,
      food,
      goal('foodStock', '저장 식량 60', 'Store 60 food', 60),
      goal('net', '경제 흑자', 'Positive cash flow', 0.01),
      noOver,
      stable(80),
      goal('repairs', '손상 구조 수리', 'Repair damaged structure', 1),
      happy(70),
    ],
    t(
      '정전, 굶주림, 적자가 겹쳤습니다. 먼저 기반시설을 살리고 주민들의 신뢰를 되찾으세요.',
      'Blackout, hunger and debt converge. Restore essentials, then rebuild trust.',
    ),
    { script: ['farm', 'power', 'liftSmall', 'park'] },
  ),
  seedStage(
    15,
    t('부상하는 문명', 'The Rising Civilization'),
    'SURVIVE',
    8,
    'metropolis',
    [
      pop(250),
      power,
      food,
      goal('materials', '자재 생산 0.5/초', 'Produce 0.5 materials/sec', 0.5),
      stable(85),
      happy(80),
      goal('net', '경제 흑자', 'Positive cash flow', 0.01),
    ],
    t(
      '이제 250명이 함께 살아갈 문명을 완성하세요. 구름 너머의 여정이 우리를 기다립니다.',
      'Build a lasting home for 250 people. Beyond the clouds, another journey awaits.',
    ),
    {
      hold: 60,
      population: 200,
      resources: 600,
      script: ['housingEstate', 'liftLarge', 'greenhouse', 'park', 'advancedPower'],
      speaker: 'orion',
    },
  ),
];
export const CHALLENGES: Stage[] = [
  {
    ...STAGES[0],
    id: 101,
    next: undefined,
    chapter: 1,
    title: t('연결의 설계도', 'Limited Blueprint'),
    type: 'PUZZLE',
    limit: 6,
    script: ['home', 'road', 'home', 'power', 'road', 'home'],
    timeLimit: 300,
    goals: [
      goal('placed', '블록 5개 배치', 'Place five blocks', 5, false, true),
      goal('homes', '주거시설 3개', 'Three homes', 3),
      connected,
      pop(15),
    ],
    xp: 80,
  },
  {
    ...STAGES[8],
    id: 102,
    next: undefined,
    title: t('구조대의 선택', 'Rescue Challenge'),
    timeLimit: 300,
    xp: 80,
  },
  {
    ...STAGES[11],
    id: 103,
    next: undefined,
    title: t('효율의 도시', 'Efficiency Challenge'),
    timeLimit: 360,
    resources: 200,
    xp: 80,
  },
];
export const allStages = [...STAGES, ...CHALLENGES];
export function stage(id: number) {
  const s = allStages.find((s) => s.id === id);
  if (!s) throw Error('Unknown campaign stage');
  return s;
}
export const LEGACY_MAP: Record<number, number> = {
  1: 1,
  2: 6,
  3: 7,
  4: 9,
  5: 4,
  6: 11,
  7: 12,
  8: 13,
  9: 14,
};
export const LEVELS = [
  t('견습 건축가', 'Apprentice Architect'),
  t('하늘 건설자', 'Sky Builder'),
  t('구조 기술자', 'Structural Engineer'),
  t('도시 설계자', 'City Designer'),
  t('수석 건축가', 'Master Architect'),
  t('하늘 개척자', 'Sky Pioneer'),
  t('문명 설계자', 'Civilization Architect'),
];
export const level = (xp: number) => Math.min(6, Math.floor(xp / 500));

export const FUTURE_STAGES = [
  [16, 4, t('구름보다 높이', 'Above the Clouds')],
  [17, 4, t('하늘의 기둥', 'Pillars of the Sky')],
  [18, 4, t('희망의 다리', 'Bridges of Hope')],
  [19, 4, t('도시 아래의 도시', 'The City Beneath')],
  [20, 4, t('수직 대도시', 'Vertical Metropolis')],
  [21, 5, t('다가오는 폭풍', 'Gathering Storm')],
  [22, 5, t('떨어지는 별', 'Falling Stars')],
  [23, 5, t('에테르 위기', 'Aether Crisis')],
  [24, 5, t('재난 이후', 'After the Disaster')],
  [25, 5, t('마지막 피난처', 'The Last Refuge')],
  [26, 6, t('잃어버린 섬들', 'The Lost Islands')],
  [27, 6, t('고대의 빛', 'Ancient Light')],
  [28, 6, t('하늘의 교역로', 'Sky Trade Routes')],
  [29, 6, t('하나로 연결된 도시들', 'United Cities')],
  [30, 6, t('새로운 문명', 'SKYTOPIA')],
] as const;
