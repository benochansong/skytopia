import { mkdirSync, writeFileSync } from 'node:fs';
import { ONLINE, OPERATION, BLOCKS, VERTICAL_KINDS, DISASTER_KINDS } from '../src/data/rules';
import { onlineCity, newHand, execute, advanceCity, scoreCity } from '../src/game/online/match';
import { cityReport } from '../src/game/city/report';
import { analyze } from '../src/game/analysis';
import type { Kind } from '../src/types/game';

// Deliberately small policies. All receive the same actual online supply, economy and clock.
// No injected buildings, extra resources or client authority. This is not a human win-rate test.
const policies: [string, (k: Kind) => boolean][] = [
  [
    'residential',
    (k) => BLOCKS[k].capacity > 0 || ['road', 'farm', 'power', 'platform'].includes(k),
  ],
  [
    'structural',
    (k) => ['liftSmall', 'liftLarge', 'brace', 'power', 'road', 'platform'].includes(k),
  ],
  [
    'industrial',
    (k) =>
      OPERATION[k].materials > 0 ||
      OPERATION[k].aether > 0 ||
      ['road', 'power', 'home'].includes(k),
  ],
  ['vertical', (k) => VERTICAL_KINDS.includes(k)],
  ['wide', (k) => ['home', 'farm', 'platform', 'metalPlatform', 'road', 'power'].includes(k)],
  [
    'defensive',
    (k) => DISASTER_KINDS.includes(k) || ['liftSmall', 'power', 'farm', 'road'].includes(k),
  ],
];
const results = [];
for (const seed of [11, 2478, 70127])
  for (const [policy, wants] of policies) {
    let g = onlineCity(seed, false),
      h = newHand(seed),
      placed = 0,
      recycled = 0,
      unplaceable = 0;
    const offered: Kind[] = [],
      built: Kind[] = [];
    for (let turn = 0; turn < 12 && !g.structure.loss; turn++) {
      offered.push(h.active.kind);
      let success = false;
      if (wants(h.active.kind)) {
        const cells = Array.from({ length: 100 }, (_, i) => ({
          x: (i % 10) - 5,
          z: Math.floor(i / 10) - 5,
          y: 0,
        }));
        cells.sort(
          (a, b) =>
            (policy === 'wide' ? -1 : 1) * (Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)) ||
            a.z - b.z ||
            a.x - b.x,
        );
        for (const cell of cells) {
          // The authority's execute path checks placement, resource payment and hand token.
          const out = execute(
            g,
            h,
            { type: 'place', hand: h.token, cell, rotation: 0, pitch: 0, roll: 0 },
            true,
            false,
          );
          if (!out.error) {
            built.push(h.active.kind);
            g = out.game;
            h = out.hand;
            placed++;
            success = true;
            break;
          }
        }
        if (!success) unplaceable++;
      }
      if (!success) {
        const out = execute(g, h, { type: 'recycle', hand: h.token }, true, false);
        if (!out.error) {
          g = out.game;
          h = out.hand;
          recycled++;
        }
      }
      for (let i = 0; i < 20; i++) g = advanceCity(g, 0.25);
    }
    const c = cityReport(g),
      s = analyze(g);
    const r = {
      seed,
      policy,
      seconds: g.elapsed,
      placed,
      recycled,
      unplaceable,
      offered,
      built,
      population: g.population,
      credits: g.city.credits,
      food: c.stocks.food,
      foodNet: c.foodProduction - c.foodConsumption,
      powerDeficit: c.deficit,
      stability: s.stability,
      loss: g.structure.loss?.reason ?? null,
      score: scoreCity(g),
    };
    results.push(r);
    console.log(seed, policy, placed, recycled, r.loss ?? 'survived', r.score.total);
  }
mkdirSync('docs/verification', { recursive: true });
writeFileSync(
  'docs/verification/phase11-strategies.json',
  JSON.stringify(
    {
      onlineVersion: ONLINE.version,
      rounds: 12,
      secondsPerRound: 5,
      note: 'Fixed short policies; no human win rates, no disasters, no rotation search. Vertical-only policy reveals the current online supply limitation.',
      results,
    },
    null,
    2,
  ),
);
