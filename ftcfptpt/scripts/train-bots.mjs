import fs from 'node:fs';
import { Game } from '../src/simulator/game.ts';
import { simulateMatch, summarize } from '../tests/helpers/physics-world.mjs';

// Small, reproducible parameter search over the actual fixed-step game physics.
// Held-out seeds are evaluated separately after selection, never used for selection.
const candidates = [
  {},
  { outerStation: 1.47 },
  { outerStation: 1.47, avoidanceRadius: .48 },
  { outerStation: 1.4, avoidanceRadius: .48, cruiseFactor: .95 },
  { outerStation: 1.47, avoidanceRadius: .48, cruiseFactor: .95 },
  { outerStation: 1.47, avoidanceRadius: .48, cruiseFactor: .95, arrivalRadius: .16 },
  { outerStation: 1.47, avoidanceRadius: .48, cruiseFactor: .95, parkLead: 0 },
  { outerStation: 1.47, avoidanceRadius: .52, cruiseFactor: .75, arrivalRadius: .1 },
  { outerStation: 1.38, avoidanceRadius: .48, arrivalRadius: .16, parkLead: 1.5 },
  { outerStation: 1.47, avoidanceRadius: .48, cruiseFactor: .95, aimLift: .04 },
  { outerStation: 1.47, avoidanceRadius: .48, cruiseFactor: .95, tractionCompensation: .6 },
  { outerStation: 1.47, avoidanceRadius: .48, cruiseFactor: .95, tractionCompensation: .8 },
];
const searchBase = { cruiseFactor: .85, arrivalRadius: .12, shootSpeed: .1, aimLift: .08,
  shotInterval: .55, avoidanceRadius: .56, parkLead: 2.8, outerStation: 1.38, tractionCompensation: .7 };
const seeds = [1, 2, 3, 4], runs = [];
const reuse = process.argv.includes('--reuse');
if (reuse) runs.push(...JSON.parse(fs.readFileSync('.tools/bot-training-search.json', 'utf8')).candidates);
for (let index = 0; !reuse && index < candidates.length; index++) {
  const tuning = { ...searchBase, ...candidates[index] }, matches = [];
  for (const seed of seeds) matches.push(await simulateMatch(Game, seed, tuning));
  const summary = summarize(matches);
  const fitness = summary.meanScore + summary.hitRate * 12 - summary.meanBlockedSeconds * 3 - summary.escapes * 1000;
  runs.push({ tuning, summary, fitness });
  console.log(JSON.stringify({ candidate: index, score: summary.meanScore, hitRate: summary.hitRate, blocked: summary.meanBlockedSeconds, fitness }));
}
for (const run of runs) run.fitness = run.summary.meanScore + run.summary.hitRate * 12 - run.summary.meanBlockedSeconds * 3 - run.summary.escapes * 1000;
runs.sort((a, b) => b.fitness - a.fitness);
fs.writeFileSync('.tools/bot-training-search.json', JSON.stringify({ method: 'seeded parameter search', seeds, searchBase,
  fitness: 'meanScore + 12*hitRate - 3*blockedSeconds - 1000*escapes', candidates: runs, best: runs[0] }, null, 2) + '\n');
console.log('SELECTED', JSON.stringify(runs[0]));
