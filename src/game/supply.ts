import type { Hazard } from '../types/disaster';
import { OPERATION } from '../data/cityRules';
import { BLOCKS, VERTICAL_KINDS, DISASTER_KINDS } from '../data/rules';
import type { Kind, Piece, Supply } from '../types/game';
const BAG: Kind[] = [
  'platform',
  'platform',
  'road',
  'road',
  'home',
  'home',
  'power',
  'farm',
  'park',
];
export function random(seed: number): [number, number] {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return [next / 4294967296, next];
}
export function draw(
  source: Supply,
  training = false,
  context: {
    script?: Kind[];
    vertical?: boolean;
    disaster?: boolean;
    hazard?: Hazard;
    needsLift?: boolean;
    needsSpace?: boolean;
    needsRoad?: boolean;
    city?: { tier: number; needFood: boolean; needPower: boolean };
  } = {},
): [Piece, Supply] {
  let { seed } = source;
  let bag = [...source.bag];
  if (!bag.length) {
    bag = [...BAG, ...(context.vertical ? VERTICAL_KINDS : [])];
    if (context.disaster) bag.push(...DISASTER_KINDS);
    if (context.hazard) bag.push(...forecastSupply(context.hazard));
    if (source.policy === 'adaptive' && !training) {
      bag.push(
        'metalPlatform',
        'largeHome',
        'factory',
        'liftSmall',
        'liftLarge',
        'brace',
        'ballast',
      );
      if (context.needsLift) bag.push('liftSmall');
      else if (context.needsSpace) bag.push('platform');
      else if (context.needsRoad) bag.push('road');
    }
    if (context.city) {
      const extra: Kind[] = [
        'apartment',
        'workshop',
        'warehouse',
        'greenhouse',
        'advancedPower',
        'battery',
        'clinic',
        'shop',
        'housingEstate',
        'refinery',
        'logisticsDepot',
        'aetherStore',
        'hydroponics',
        'manufacturer',
        'aetherPower',
        'plaza',
        'relay',
        'powerLink',
      ];
      bag.push(...extra.filter((k) => OPERATION[k].unlock <= context.city!.tier));
      if (context.city.needFood) bag.push('farm');
      else if (context.city.needPower) bag.push('power');
    }
    for (let i = bag.length - 1; i > 0; i--) {
      const [r, s] = random(seed);
      seed = s;
      const j = Math.floor(r * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  const tutorialKinds: Kind[] = ['home', 'platform', 'road', 'power', 'park'];
  const scripted = training ? tutorialKinds[source.draws] : context.script?.[source.draws];
  const kind = scripted ?? bag.pop()!;
  const [r, nextSeed] = random(seed);
  const shapes = BLOCKS[kind].shapes;
  return [
    {
      kind,
      shape: training || scripted ? shapes[0] : shapes[Math.floor(r * shapes.length)],
      rotation: 0,
    },
    {
      seed: nextSeed,
      bag,
      draws: source.draws + 1,
      ...(source.policy ? { policy: source.policy } : {}),
    },
  ];
}

export function forecastSupply(hazard: Hazard): Kind[] {
  return hazard === 'meteor'
    ? ['shieldSmall', 'emergencyBattery']
    : hazard === 'thunder'
      ? ['lightningRod', 'surgeRelay']
      : ['aether', 'gravity', 'compound'].includes(hazard)
        ? ['stabilizer', 'emergencyBattery']
        : ['cold', 'heat'].includes(hazard)
          ? ['climateControl', 'emergencyGranary']
          : ['windbreak', 'reinforcedWindbreak'];
}
