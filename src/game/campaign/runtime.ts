import type { Game, Kind } from '../../types/game';
import { BLOCKS } from '../../data/rules';
import { stage } from './definitions';
import { campaignGoals, evaluateResult, metrics, goalMet } from './objectives';
import { forecastSupply, random } from '../supply';
import { adjustStock, inventory, pay, canPay } from '../city/inventory';
import { reconcileResidents } from '../city/population';
export function canUse(g: Game, kind: Kind) {
  return (
    !g.campaign ||
    g.campaign.continued ||
    stage(g.campaign.stage).allowed.includes(kind) ||
    (g.campaign.choice === 'research' && kind === 'aetherPower')
  );
}
export function campaignDraw(g: Game): Game {
  const d = stage(g.campaign!.stage);
  const n = g.supply.draws;
  const [r, seed] = random(g.supply.seed);
  const pool = [
    ...d.allowed,
    ...(g.disaster?.phase === 'forecast'
      ? forecastSupply(g.disaster.threat!.kind).filter((k) => d.allowed.includes(k))
      : []),
  ];
  const kind = d.script[n] ?? pool[Math.floor(r * pool.length)];
  const [shapeRoll, nextSeed] = random(seed);
  const shapes = BLOCKS[kind].shapes;
  const piece = {
    kind,
    shape: shapes[d.script[n] ? 0 : Math.floor(shapeRoll * shapes.length)],
    rotation: 0,
  };
  return {
    ...g,
    active: g.next[0],
    next: [...g.next.slice(1), piece],
    supply: { seed: nextSeed, draws: n + 1, bag: [], policy: 'classic' },
    remaining: 20,
    holdUsed: false,
  };
}
export function advanceDialogue(g: Game, skip = false): Game {
  const c = g.campaign;
  if (!c?.dialogue) return g;
  const id = c.dialogue;
  return {
    ...g,
    campaign: {
      ...c,
      dialogue: !skip && c.line === 0 ? 'briefing' : null,
      line: !skip && c.line === 0 ? 1 : 0,
      history: [...new Set([...c.history, id])].slice(-64),
      seen: [...new Set([...c.seen, id])].slice(-64),
      intro: false,
    },
  };
}
export function chooseStory(g: Game, choice: string): Game {
  const c = g.campaign;
  if (!c || c.choice || c.result) return g;
  const d = stage(c.stage);
  if (d.choice === 'survivors' && choice === 'accept')
    g = reconcileResidents({
      ...g,
      population: g.population + 8,
      city: { ...g.city, displaced: g.city.displaced + 8, shelterTime: 30 },
    });
  else if (d.choice === 'research' && choice === 'research') {
    const cost = { materials: 60, credits: 0, aether: 0 };
    if (!canPay(g, cost)) return g;
    g = pay(g, cost);
    g = adjustStock(g, inventory(g).root, 'aether', 10);
  } else if (choice !== 'defer') return g;
  return { ...g, campaign: { ...g.campaign!, choice } };
}
export function campaignStep(g: Game, dt: number): Game {
  const c = g.campaign;
  if (!c || c.result || c.failed || c.continued) return g;
  const d = stage(c.stage),
    v = metrics(g);
  const failure =
    g.structure.loss?.reason ??
    (c.protectedIds.some((id) => !g.buildings.some((b) => b.id === id))
      ? 'protected'
      : d.timeLimit && g.elapsed >= d.timeLimit
        ? 'timeout'
        : d.limit && c.used >= d.limit && (v.homes < 3 || v.connection < 1)
          ? 'blocks'
          : null);
  const latched = [
    ...new Set([...c.latched, ...d.goals.filter((o) => o.once && goalMet(o, v)).map((o) => o.id)]),
  ];
  const hold = d.goals.every((o) => goalMet(o, v, latched)) ? c.hold + dt : 0;
  const seen = [...c.seen];
  const history = [...c.history];
  if (v.stability < 50 && !seen.includes('crisis')) {
    seen.push('crisis');
    history.push('crisis');
  }
  if (d.goals.some((o) => goalMet(o, v, latched)) && !seen.includes('milestone')) {
    seen.push('milestone');
    history.push('milestone');
  }
  let next: Game = {
    ...g,
    campaign: {
      ...c,
      seen,
      history: history.slice(-64),
      latched,
      hold,
      failed: failure,
      peakPopulation: Math.max(c.peakPopulation, g.population),
      peakStability: Math.max(c.peakStability, v.stability),
      safeTime: v.overloads === 0 && v.collapse === 0 ? c.safeTime + dt : 0,
      profitTime: v.net > 0 ? c.profitTime + dt : 0,
    },
  };
  if (!failure && campaignGoals(next).every(Boolean) && hold + 1e-7 >= d.hold) {
    const result = evaluateResult(next);
    next = { ...next, won: true, campaign: { ...next.campaign!, result } };
  }
  return next;
}
