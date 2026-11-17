import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/simulator/game.ts';
import { simulateMatch, summarize } from './helpers/physics-world.mjs';

test('calibrated bots throw accurately and complete productive AUTO runs in full scene physics', async () => {
  const matches = [];
  for (const seed of [201, 202]) matches.push(await simulateMatch(Game, seed));
  const result = summarize(matches);
  assert.ok(matches.every(m => m.ended), 'every run ends after AUTO and settling');
  assert.equal(result.escapes, 0);
  assert.ok(result.hitRate >= .95, 'at least 95% of throws enter the physical CELL aperture');
  assert.ok(result.meanScore >= 100, 'both alliances make repeated scoring cycles');
  assert.ok(result.meanPickups >= 20, 'bots reach and collect new balls after their preloads');
  assert.ok(result.maxSpeed < 3.5);
});
