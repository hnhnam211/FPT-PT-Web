import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { simulateMatch, summarize } from '../tests/helpers/physics-world.mjs';

const args = process.argv.slice(2);
const value = (flag, fallback) => { const i = args.indexOf(flag); return i < 0 ? fallback : args[i + 1]; };
const modulePath = path.resolve(value('--game', 'src/simulator/game.ts'));
const { Game } = await import(pathToFileURL(modulePath).href);
const seeds = value('--seeds', '1,2,3,4,5,6,7,8').split(',').map(Number);
const tuning = JSON.parse(value('--tuning', '{}'));
const matches = [];
for (const seed of seeds) {
  const result = await simulateMatch(Game, seed, tuning, args.includes('--trace')); matches.push(result);
  console.log(JSON.stringify({ seed, score: result.score, shots: result.shots, hits: result.hiveHits, blockedSeconds: +result.blockedSeconds.toFixed(2) }));
}
const report = { summary: summarize(matches), seeds, tuning, matches };
console.log(JSON.stringify(report.summary, null, 2));
const output = value('--output', null);
if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
