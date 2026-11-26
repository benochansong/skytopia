import type { Game } from '../../types/game';
import type { Profile } from '../../types/campaign';
import { worldReport } from './management';
export function worldAchievements(
  profile: Profile,
  g: Game,
  now = new Date().toISOString(),
): Profile {
  const w = g.world;
  if (!w || w.mode === 'lab' || g.campaign) return profile;
  const r = worldReport(g),
    conditions: Record<string, boolean> = {
      beyondClouds: w.stats.explored > 0,
      explorer10: w.stats.explored >= 10,
      secondHome: w.cities.length >= 2,
      firstTrade: w.stats.deliveries > 0,
      fiveRoutes: r.routes >= 5,
      threeCities: r.stable >= 3,
      ancientTech: w.stats.recovered > 0,
      advancedAether: w.research.completed.includes('advancedAether'),
      rescueNetwork: w.stats.rescued >= 80,
      federation: r.tier >= 4,
      nexus: r.nexus,
    };
  const earned = Object.keys(conditions).filter(
    (id) => conditions[id] && !profile.achievements[id],
  );
  return earned.length
    ? {
        ...profile,
        xp: profile.xp + earned.length * 40,
        achievements: {
          ...profile.achievements,
          ...Object.fromEntries(earned.map((id) => [id, now])),
        },
      }
    : profile;
}
