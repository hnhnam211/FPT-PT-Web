import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { BOT_POLICY } from '../src/simulator/bot-policy.ts';
import { DEFAULT_CONFIG } from '../src/simulator/game.ts';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const before = read('.tools/bot-final-before.json'), after = read('.tools/bot-final-after.json');
const search = read('.tools/bot-training-search.json');
const normalize = text => text.replace(/\r\n/g, '\n');
const baseline = normalize(fs.readFileSync('.tools/bot-baseline-20261117.ts', 'utf8'));
let baselineCommit = null;
const commits = execFileSync('git', ['log', '--format=%H', '-n', '20', '--', 'src/simulator/game.ts'], { encoding: 'utf8' }).trim().split('\n');
for (const commit of commits) {
  try {
    const text = execFileSync('git', ['show', commit + ':ftcfptpt/src/simulator/game.ts'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (normalize(text) === baseline) { baselineCommit = commit; break; }
  } catch { /* Older revisions may have different paths. */ }
}
const report = {
  date: '2026-11-17', simulator: 'BIOBUZZ TU09 / AUTO 30s', config: DEFAULT_CONFIG,
  method: {
    type: 'Heuristic controller calibration by seeded Rapier rollouts',
    parameterSearch: { seeds: search.seeds, candidates: search.candidates.length,
      rollouts: search.seeds.length * search.candidates.length, fitness: search.fitness },
    refinement: 'After parameter search, chassis steering was aligned for mecanum lanes and flower approaches.',
    validation: { pairedSeeds: after.seeds, excludedFromParameterSearch: true,
      physicalModel: 'Same nominal colliders, gravity, mass, friction, damping, CCD and 60Hz step as Scene.tsx.' },
    limitations: 'Simulation-only measurements on this nominal field. Controller tuning, not neural-network training or real-robot certification.',
  },
  baseline: { commit: baselineCommit, file: 'ftcfptpt/src/simulator/game.ts',
    sha256Normalized: createHash('sha256').update(baseline).digest('hex') },
  selectedPolicy: BOT_POLICY,
  before: before.summary, after: after.summary,
  improvements: {
    hitRatePercentagePoints: (after.summary.hitRate - before.summary.hitRate) * 100,
    meanScoreFactor: after.summary.meanScore / before.summary.meanScore,
    blockedTimeReductionPercent: (1 - after.summary.meanBlockedSeconds / before.summary.meanBlockedSeconds) * 100,
  },
  metricDefinitions: {
    hitRate: 'Actual CELL aperture entries / launched balls; excludes FLOWER entries.',
    meanScore: 'Combined red + blue AUTO points per match.',
    meanBlockedSeconds: 'Summed over four robots: commanded speed >0.2m/s but actual progress <0.1m/s during AUTO.',
    meanPickups: 'Actual loose-ball / flower-POLLEN transfers into hoppers per match.',
  },
  validationMatches: { before: before.matches, after: after.matches },
  searchResults: search.candidates,
};
fs.writeFileSync('docs/bot-training-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ baselineCommit, before: before.summary, after: after.summary, improvements: report.improvements }, null, 2));
