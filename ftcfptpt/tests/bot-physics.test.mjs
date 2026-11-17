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
  assert.ok(matches.every(m => m.robotContactSeconds < 3), 'separate parking goals and predictive steering limit robot contact');
  assert.ok(matches.every(m => m.movement.red <= 8 && m.movement.blue <= 8));
});

test('physical AUTO runs respect every selected per-alliance tip cap', async () => {
  for (const limit of [1, 2, 3]) {
    const match = await simulateMatch(Game, 201, {}, false, { autoTipLimit: limit });
    assert.deepEqual(match.autoTips, { red: limit, blue: limit });
    assert.equal(match.tips, limit * 2); assert.equal(match.ballCount, 56);
    assert.equal(match.escapes, 0); assert.equal(match.ended, true);
  }
});

test('full and TELEOP-only physical runs finish and continue tipping beyond the AUTO cap', async () => {
  for (const matchMode of ['full', 'teleop']) {
    const match = await simulateMatch(Game, 202, {}, false, { matchMode, autoTipLimit: 1 });
    assert.equal(match.ended, true); assert.equal(match.escapes, 0); assert.equal(match.ballCount, 56);
    assert.ok(match.tips > 2); assert.ok(match.shots > 16);
    assert.deepEqual(match.phases, matchMode === 'full' ? ['auto', 'transition', 'teleop', 'settling', 'ended'] : ['teleop', 'settling', 'ended']);
    assert.deepEqual(match.autoTips, matchMode === 'full' ? { red: 1, blue: 1 } : { red: 0, blue: 0 });
    assert.ok(match.flowerDeliveries.pollen > 0, 'bots put actual pollen into FLOWER openings');
    assert.ok(match.flowerDeliveries.red + match.flowerDeliveries.blue > 0, 'bots deliver ownership nectar');
    assert.ok(match.flowerScore.red + match.flowerScore.blue > 0);
    assert.ok(match.robotContactSeconds < 20, 'bots avoid prolonged mutual pushing during TELEOP');
  }
});
