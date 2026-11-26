import { it, expect } from 'vitest';
import { allStages } from '../game/campaign/definitions';
import { solveCampaign } from './campaign-solutions';
import { metrics, campaignGoals } from '../game/campaign/objectives';
import { decodeCampaignGame } from '../game/campaign/storage';
for (const d of allStages)
  it(
    'campaign stage ' + d.id + ' has an engine-verified victory path',
    () => {
      const g = solveCampaign(d.id);
      console.log('stage', d.id, {
        seconds: g.elapsed,
        stars: g.campaign?.result?.stars,
        goals: campaignGoals(g),
        population: Math.round(g.population),
        stability: metrics(g).stability,
      });
      expect(g.campaign?.failed).toBeNull();
      expect(g.structure.loss).toBeNull();
      expect(g.campaign?.result).not.toBeNull();
      expect(g.won).toBe(true);
      expect(() => decodeCampaignGame(g)).not.toThrow();
    },
    60000,
  );
