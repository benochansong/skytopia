import type { Game } from '../../types/game';
import type { WorldState } from '../../types/world';
import { technologies } from './definitions';
import { working, moveCargo, mutableWorld, cargoRoom } from './logistics';
import { canPay, pay } from '../city/inventory';
import { attachWorld, syncWorld } from './state';
export function startResearch(g: Game, id: string): Game {
  if (!g.world) return g;
  const w = mutableWorld(syncWorld(g)),
    t = technologies.find((t) => t.id === id),
    c = w.cities.find((c) => c.id === w.active)!;
  if (
    !t ||
    w.research.active ||
    w.research.completed.includes(id) ||
    (t.prerequisite && !w.research.completed.includes(t.prerequisite)) ||
    !working(c.game, 'researchLab').length ||
    w.research.points < t.points ||
    c.rare.data < t.data
  )
    return { ...g, world: { ...g.world, notice: 'researchRequirements' } };
  const cost = { materials: t.materials, aether: t.aether, credits: t.materials };
  if (!canPay(c.game, cost)) return { ...g, world: { ...g.world, notice: 'resources' } };
  c.game = pay(c.game, cost);
  c.rare.data -= t.data;
  w.research.points -= t.points;
  w.research.active = { id, remaining: t.seconds, city: c.id };
  return attachWorld(g, w);
}
export function researchStep(w: WorldState, dt: number) {
  for (const c of w.cities) {
    if (c.game.structure.loss) continue;
    const labs = working(c.game, 'researchLab').length,
      bonus = c.specialty === 'research' ? 1.5 : 1;
    w.research.points = Math.min(1e6, w.research.points + labs * 0.5 * bonus * dt);
    if (working(c.game, 'artifactAnalysis').length && c.rare.data > 0) {
      const used = Math.min(c.rare.data, 0.1 * dt);
      c.rare.data -= used;
      w.research.points = Math.min(1e6, w.research.points + used * 5);
    }
    const recipes = [
      ['metalRefinery', 'materials', 'metal', 0.15, 0.3],
      ['advancedAetherRefinery', 'aether', 'pureAether', 0.08, 0.2],
    ] as const;
    for (const [kind, input, output, rate, cost] of recipes) {
      const count = working(c.game, kind).length;
      if (!count) continue;
      const wanted = Math.min(cargoRoom(c, output), rate * count * dt);
      const used = moveCargo(c, input, (-wanted * cost) / rate);
      c.rare[output] += (used * rate) / cost;
    }
  }
  const active = w.research.active;
  if (active) {
    const c = w.cities.find((c) => c.id === active.city);
    if (c && working(c.game, 'researchLab').length && !c.game.structure.loss) {
      active.remaining = Math.max(0, active.remaining - dt * w.config.researchSpeed);
      if (!active.remaining) {
        if (!w.research.completed.includes(active.id))
          w.research.completed = [...w.research.completed, active.id];
        w.research.active = null;
        w.notice = 'researchComplete';
      }
    }
  }
}
