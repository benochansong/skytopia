import type { Kind } from '../types/game';
export const MISSIONS = {
  1: {
    ko: '최초의 빛',
    en: 'First Light',
    subtitle: 'FIRST LIGHT',
    hold: 0,
    resources: 100,
    script: [] as Kind[],
  },
  2: {
    ko: '발전의 무게',
    en: 'The Weight of Progress',
    subtitle: 'THE WEIGHT OF PROGRESS',
    hold: 20,
    resources: 240,
    script: ['largeHome', 'liftSmall', 'road', 'power', 'platform', 'largeHome'] as Kind[],
  },
  3: {
    ko: '하늘의 균형',
    en: 'Balance of the Sky',
    subtitle: 'BALANCE OF THE SKY',
    hold: 10,
    resources: 260,
    script: ['liftSmall', 'brace', 'power', 'metalPlatform', 'liftLarge'] as Kind[],
  },
  4: {
    ko: '추락에 맞서다',
    en: 'Against the Fall',
    subtitle: 'AGAINST THE FALL',
    hold: 5,
    resources: 300,
    script: ['power', 'brace', 'liftSmall', 'brace', 'metalPlatform'] as Kind[],
  },
};
export const MISSION_GOALS = {
  ko: {
    2: ['인구 50명', '소형 부양장치 설치', '총중량 300t', '안정도 75% 이상', '과부하 연결부 없음'],
    3: [
      '두 중심의 거리 25% 감소',
      '부양장치 설치',
      '연결부 보강',
      '안정도 80% 회복',
      '추가 붕괴 방지',
    ],
    4: [
      '위험 구조물 수리',
      '연결부 2개 보강',
      '유효 부양력 ≥ 총중량',
      '에테르 코어 보호',
      '60초 생존',
    ],
  },
  en: {
    2: [
      'Reach 50 inhabitants',
      'Install a small levitator',
      'Reach 300t mass',
      'Maintain 75% stability',
      'No overloaded connections',
    ],
    3: [
      'Reduce center separation by 25%',
      'Install a levitator',
      'Reinforce a connection',
      'Recover 80% stability',
      'Prevent further collapse',
    ],
    4: [
      'Repair a damaged structure',
      'Reinforce 2 connections',
      'Effective lift ≥ mass',
      'Protect the Aether core',
      'Survive for 60 seconds',
    ],
  },
};
export const LAB_EXAMPLES = {
  A: {
    ko: '무게중심',
    en: 'Center of mass',
    hintKo: '공장을 한쪽에 배치한 뒤 균형추와 비교하세요.',
    hintEn: 'Place factories to one side, then compare with a counterweight.',
  },
  B: {
    ko: '부양력',
    en: 'Local lift',
    hintKo: '동쪽 도로 옆에 부양장치를 설치하고 두 중심을 확인하세요.',
    hintEn: 'Install levitators beside the eastern road and compare both centers.',
  },
  C: {
    ko: '하중 분산',
    en: 'Load paths',
    hintKo: '좁은 외팔보의 연결부를 보강하거나 옆에 두 번째 경로를 만드세요.',
    hintEn: 'Reinforce the narrow cantilever or add a parallel support path.',
  },
  D: {
    ko: '연쇄 붕괴',
    en: 'Cascade',
    hintKo: '시간을 재개해 손상된 발전 구역과 부양 출력의 변화를 관찰하세요.',
    hintEn: 'Resume time to observe the damaged power district and lift output.',
  },
};
