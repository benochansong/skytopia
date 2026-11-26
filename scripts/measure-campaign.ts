import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { loadStage } from '../src/game/campaign/loader';
import { DEFAULT_SETTINGS } from '../src/data/rules';
import { freshCampaign, decodeCampaign } from '../src/game/campaign/storage';
import { metrics, campaignGoals } from '../src/game/campaign/objectives';
import { tick } from '../src/game/engine';
import { advanceDialogue } from '../src/game/campaign/runtime';
import { updateProfile } from '../src/game/campaign/progress';
const g = advanceDialogue(loadStage(15, DEFAULT_SETTINGS), true),
  save = { ...freshCampaign(), current: g, checkpoint: structuredClone(g) },
  raw = JSON.stringify(save);
function measure(name: string, fn: () => unknown, n = 50) {
  for (let i = 0; i < 5; i++) fn();
  const times = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    name,
    samples: n,
    medianMs: times[Math.floor(n * 0.5)],
    p95Ms: times[Math.floor(n * 0.95)],
  };
}
const report = {
  environment: { node: process.version, cpu: cpus()[0]?.model, platform: process.platform },
  fixture: {
    stage: 15,
    platforms: g.platforms.length,
    buildings: g.buildings.length,
    population: g.population,
    saveBytes: Buffer.byteLength(raw),
  },
  results: [
    measure('load stage 1', () => loadStage(1, DEFAULT_SETTINGS)),
    measure('load stage 15', () => loadStage(15, DEFAULT_SETTINGS), 20),
    measure('campaign goals', () => campaignGoals(g), 500),
    measure('quarter-second engine', () => tick(g, 0.25)),
    measure('profile update', () => updateProfile(save.profile, g, g)),
    measure('validated campaign plus checkpoint decode', () => decodeCampaign(raw)),
  ],
  initial: metrics(g),
};
writeFileSync('docs/performance-campaign.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
