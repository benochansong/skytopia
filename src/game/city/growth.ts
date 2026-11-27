import type { Game } from '../../types/game';
import { CITY_RULES } from '../../data/rules';
import { cityReport } from './report';
import { analyze } from '../analysis';
import { evacuatedTotal } from '../disasters/effects';
/** Read-only explanation of the existing populationStep gates, not a second growth engine. */
export function growthStatus(g: Game) {
  const r = cityReport(g),
    s = analyze(g);
  if (
    g.city.grace <= 0 &&
    (g.city.hungerTime > CITY_RULES.starvationGrace ||
      g.city.blackoutTime > CITY_RULES.departureGrace ||
      g.city.distressTime > CITY_RULES.departureGrace ||
      g.city.shelterTime > CITY_RULES.shelterGrace)
  )
    return 'departure';
  if (g.city.displaced > 0.1) return 'shelter';
  if (evacuatedTotal(g) > 0) return 'evacuation';
  if (g.city.hungerTime > 0) return 'food';
  if (r.deficit >= 0.1) return 'power';
  if (s.stability < 65) return 'safety';
  if (g.city.happiness < 55) return 'happiness';
  if (r.availableHousing - g.population < 0.1) return 'housing';
  return 'growing';
}
