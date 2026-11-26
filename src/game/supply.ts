import { BLOCKS } from '../data/rules';
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
export function draw(source: Supply, training = false): [Piece, Supply] {
  let { seed } = source;
  let bag = [...source.bag];
  if (!bag.length) {
    bag = [...BAG];
    for (let i = bag.length - 1; i > 0; i--) {
      const [r, s] = random(seed);
      seed = s;
      const j = Math.floor(r * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  const tutorialKinds: Kind[] = ['home', 'platform', 'road', 'power', 'park'];
  const kind =
    training && source.draws < tutorialKinds.length ? tutorialKinds[source.draws] : bag.pop()!;
  const [r, nextSeed] = random(seed);
  const shapes = BLOCKS[kind].shapes;
  return [
    { kind, shape: training ? 'single' : shapes[Math.floor(r * shapes.length)], rotation: 0 },
    { seed: nextSeed, bag, draws: source.draws + 1 },
  ];
}
