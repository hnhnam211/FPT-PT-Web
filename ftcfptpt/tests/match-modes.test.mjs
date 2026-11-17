import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, DEFAULT_CONFIG, FLOWERS, hiveTarget } from '../src/simulator/game.ts';

const body = (p, v = { x: 0, y: 0, z: 0 }) => ({
  p: { ...p }, v: { ...v }, translation() { return this.p; }, linvel() { return this.v; },
  setTranslation(p) { this.p = { ...p }; }, setLinvel(v) { this.v = { ...v }; },
  setAngvel() {}, setRotation() {}, setEnabled() {},
});
const create = (config = {}) => new Game({ ...DEFAULT_CONFIG, ...config }, () => .5);
function crossing(game, team) {
  const robot = game.robots.find(r => r.team === team), hive = game.hives[team];
  const ball = game.ball(robot.inventory.shift()), target = hiveTarget(hive);
  ball.status = 'field'; ball.launchedBy = robot.id; ball.releasedAt = game.elapsed - 1;
  ball.position = { ...target, y: target.y + .06, z: target.z + hive.side * .06 };
  game.bodies.set(ball.id, body({ ...target, y: target.y - .02, z: target.z - hive.side * .02 }));
  game.tick(1 / 60);
}

test('each selected mode starts with the correct period and clock', () => {
  for (const mode of ['auto', 'teleop', 'full']) {
    const game = create({ matchMode: mode });
    assert.equal(game.remaining, mode === 'teleop' ? 120 : 30);
    game.start(); assert.equal(game.phase, mode === 'teleop' ? 'teleop' : 'auto');
    assert.equal(game.paused, false);
  }
  assert.equal(create({ matchMode: 'practice', autoTipLimit: 99 }).config.matchMode, 'auto');
  assert.equal(create({ autoTipLimit: 99 }).config.autoTipLimit, 3);
});

test('full match preserves the field across AUTO, an eight-second transition and TELEOP', () => {
  const game = create({ matchMode: 'full' }); game.start();
  game.robot.inventory.pop(); game.robot.left = true;
  game.earned.red = 20; game.autoEarned.red = 20;
  const balls = game.balls, robots = game.robots;
  game.tick(30); assert.equal(game.phase, 'transition'); assert.equal(game.remaining, 8);
  assert.equal(game.movement.red, 3);
  game.start(); const elapsed = game.elapsed; game.tick(20);
  assert.equal(game.remaining, 8); assert.equal(game.elapsed, elapsed);
  game.start(); game.tick(7); assert.equal(game.phase, 'transition');
  game.tick(1); assert.equal(game.phase, 'teleop'); assert.equal(game.remaining, 120);
  assert.equal(game.balls, balls); assert.equal(game.robots, robots);
  assert.equal(game.robot.inventory.length, 3); assert.equal(game.earned.red, 20);
  game.tick(120); assert.equal(game.phase, 'settling');
  game.tick(3.01); assert.equal(game.phase, 'ended'); assert.equal(game.movement.red, 3);
});

test('TELEOP-only ends after 120 seconds and settling without AUTO movement bonuses', () => {
  const game = create({ matchMode: 'teleop' }); game.start(); game.robot.left = true;
  game.bodies.set('robot-0', body({ x: -1.62, y: .13, z: -.9 }));
  game.tick(120); assert.equal(game.phase, 'settling'); assert.equal(game.teleopPark.red, 5);
  assert.equal(game.movement.red, 0); game.tick(3.01); assert.equal(game.phase, 'ended');
  const score = { ...game.score }; game.finish(); assert.deepEqual(game.score, score);
});

for (const limit of [1, 2, 3]) test(`AUTO caps actual aperture-scored tips at ${limit} per alliance, including settling`, () => {
  const game = create({ autoTipLimit: limit, tipLoad: 1 }); game.start();
  for (let i = 0; i < limit; i++) for (const team of ['red', 'blue']) {
    crossing(game, team); game.tick(1);
    assert.equal(game.autoTips[team], i + 1);
  }
  for (const team of ['red', 'blue']) crossing(game, team);
  assert.deepEqual(game.autoTips, { red: limit, blue: limit });
  assert.deepEqual(game.earned, { red: limit * 20, blue: limit * 20 });
  const shots = game.robot.shots; game.fire(); assert.equal(game.robot.shots, shots);
  game.remaining = .001; game.tick(.01); assert.equal(game.phase, 'settling');
  assert.equal(game.autoTipLimitReached('red'), true);
});

test('AUTO cap is lifted in TELEOP and further tips retain their own period points', () => {
  const game = create({ matchMode: 'full', autoTipLimit: 1, tipLoad: 1 }); game.start();
  crossing(game, 'red'); game.tick(1); assert.equal(game.autoTipLimitReached('red'), true);
  game.remaining = .001; game.tick(.01); game.tick(8);
  assert.equal(game.phase, 'teleop'); assert.equal(game.autoTipLimitReached('red'), false);
  crossing(game, 'red'); assert.equal(game.hives.red.tips, 2);
  assert.equal(game.autoTips.red, 1); assert.equal(game.autoEarned.red, 20); assert.equal(game.earned.red, 40);
});

test('manual TELEOP drives and shoots only the selected robot, while other bots keep moving', () => {
  const game = create({ matchMode: 'teleop', teleopControl: 'manual' }); game.start();
  for (const r of game.robots) game.bodies.set('robot-' + r.id, body(r.position));
  game.input = { x: 0, z: 1, turn: 0, shoot: true }; game.tick(1 / 60);
  assert.ok(game.bodies.get('robot-0').linvel().z < 0); assert.equal(game.robot.shots, 1);
  assert.ok(Math.hypot(game.bodies.get('robot-1').linvel().x, game.bodies.get('robot-1').linvel().z) > 0);
  game.toggleIntake(); assert.equal(game.robot.intake, true);
  game.selectRobot(2); assert.deepEqual(game.input, { x: 0, z: 0, turn: 0, shoot: false });
  game.input.shoot = true; game.start(); assert.equal(game.input.shoot, false);
  const shots = game.robot.shots; game.tick(1); assert.equal(game.robot.shots, shots);
});

test('manual inputs cannot drive or launch during AUTO and transition', () => {
  const game = create({ matchMode: 'full', teleopControl: 'manual' }); game.start();
  game.input = { x: 1, z: 1, turn: 1, shoot: true }; game.tick(1 / 60);
  assert.equal(game.robot.shots, 0); assert.equal(game.manualDriving, false);
  game.remaining = .001; game.tick(.01); const inventory = game.robot.inventory.length;
  game.fire(); assert.equal(game.robot.inventory.length, inventory); assert.equal(game.phase, 'transition');
});

test('TELEOP unlocks all remaining nectar at 1:00, and shots do not unlock it early', () => {
  const game = create({ matchMode: 'teleop' }); game.start();
  game.remaining = 61; assert.equal(game.nectarAvailable('red'), 0);
  game.tick(1); assert.equal(game.balls.filter(b => b.kind === 'red' && b.status === 'reserve').length, 4);
  assert.equal(game.nectarAvailable('red'), 4);
});

test('manual FLOWER placement requires proximity and penalizes early nectar only', () => {
  for (const remaining of [61, 60]) {
    const game = create({ matchMode: 'teleop', teleopControl: 'manual' }); game.start(); game.remaining = remaining;
    const nectar = game.balls.find(b => b.kind === 'red' && b.status === 'reserve');
    const old = game.robot.inventory.shift(); game.ball(old).status = 'reserve';
    nectar.status = 'held'; game.robot.inventory.unshift(nectar.id);
    game.place(); assert.equal(nectar.status, 'held');
    game.robot.position = { ...FLOWERS[0], z: FLOWERS[0].z + .3, y: .13 };
    game.bodies.set(nectar.id, body(nectar.position)); game.place();
    assert.equal(nectar.status, 'field'); assert.equal(nectar.position.y, .63);
    game.bodies.get(nectar.id).setTranslation({ ...FLOWERS[0], y: .53 }); game.tick(.01);
    assert.equal(nectar.status, 'flower'); assert.equal(game.penalties.blue, remaining === 61 ? 20 : 0);
  }
});

test('TELEOP live and final breakdowns sum correctly without duplicating points', () => {
  const game = create({ matchMode: 'teleop' }); game.start();
  game.earned.red = 40; game.updateScore();
  assert.equal(game.cellScore.red, 6); assert.equal(game.gardenScore.red, 4);
  const nectar = game.balls.find(b => b.kind === 'red' && b.status === 'reserve');
  nectar.status = 'flower'; game.flowers[0].stack.push(nectar.id);
  // One pollen and one nectar intersect the modeled upper scoring volume: 2*2 + 5.
  game.updateScore(); assert.equal(game.flowerScore.red, 9);
  assert.equal(game.score.red, 59); game.updateScore(); assert.equal(game.score.red, 59);
});

test('AUTO LEAVE and PARK count once per alliance for a maximum of eight points', () => {
  for (const parked of [false, true]) {
    const game = create(); game.start();
    for (const robot of game.robots) {
      robot.left = true;
      if (parked) robot.position = { x: robot.team === 'red' ? -1.6 : 1.6, y: .13, z: robot.team === 'red' ? -.9 : .9 };
    }
    game.tick(30); assert.deepEqual(game.movement, { red: parked ? 8 : 3, blue: parked ? 8 : 3 });
    game.finish(); assert.deepEqual(game.movement, { red: parked ? 8 : 3, blue: parked ? 8 : 3 });
  }
});

test('manual placement selects POLLEN or NECTAR without throwing away the other ball', () => {
  const game = create({ matchMode: 'teleop', teleopControl: 'manual' }); game.start(); game.remaining = 60;
  const nectar = game.balls.find(b => b.kind === 'red' && b.status === 'reserve');
  game.ball(game.robot.inventory.pop()).status = 'reserve'; nectar.status = 'held'; game.robot.inventory.push(nectar.id);
  game.robot.position = { ...FLOWERS[0], y: .13, z: FLOWERS[0].z + .3 };
  game.place(game.robot, 'red'); assert.equal(nectar.status, 'field');
  assert.equal(game.robot.inventory.length, 3); assert.ok(game.robot.inventory.every(id => game.ball(id).kind === 'pollen'));
});

test('pending FLOWER deliveries reserve capacity before gravity completes the drop', () => {
  const game = create({ matchMode: 'teleop', teleopControl: 'manual' }); game.start(); game.remaining = 60;
  game.robot.inventory.forEach(id => { game.ball(id).status = 'reserve'; });
  const nectar = game.balls.filter(b => b.kind === 'red' && b.status === 'reserve').slice(0,3);
  nectar.forEach(ball => { ball.status = 'held'; }); game.robot.inventory = nectar.map(b => b.id);
  game.robot.position = { ...FLOWERS[0], y: .13, z: FLOWERS[0].z + .3 };
  game.place(); game.elapsed += .5; game.place(); game.elapsed += .5; game.place();
  assert.equal(game.robot.inventory.length, 1); assert.equal(game.flowers[0].stack.length, 4);
  assert.equal(game.balls.filter(b => b.status === 'field' && b.deliveryFlower === 0).length, 2);
});

test('a missed FLOWER drop releases its reservation when the ball lands on the floor', () => {
  const game = create({ matchMode: 'teleop', teleopControl: 'manual' }); game.start(); game.remaining = 59;
  game.robot.position = { ...FLOWERS[0], y: .13, z: FLOWERS[0].z + .3 };
  const ball = game.ball(game.robot.inventory[0]); game.place();
  assert.equal(ball.deliveryFlower,0);
  game.bodies.set(ball.id,body({x:FLOWERS[0].x+.2,y:.04,z:FLOWERS[0].z+.2})); game.tick(.01);
  assert.equal(ball.deliveryFlower,undefined); assert.equal(game.flowerDeposits.pollen,0);
});

test('a bot physically drops foundation pollen then ownership nectar into its reserved FLOWER', () => {
  const game = create({ matchMode: 'teleop' }); game.start(); game.remaining = 60;
  for (const id of game.flowers[0].stack) game.ball(id).status = 'reserve'; game.flowers[0].stack = [];
  const nectar = game.balls.find(b => b.kind === 'red' && b.status === 'reserve');
  game.ball(game.robot.inventory.pop()).status = 'reserve'; nectar.status = 'held'; game.robot.inventory.push(nectar.id);
  game.robot.position = { ...FLOWERS[0], y: .13, z: FLOWERS[0].z + .3 }; game.robot.heading = Math.PI;
  game.bodies.set('robot-0',body(game.robot.position));
  for (const ball of game.balls) game.bodies.set(ball.id,body(ball.position));
  for (let i = 0; i < 180; i++) {
    game.tick(1/60);
    for (const ball of game.balls) if (ball.status === 'field') {
      const b = game.bodies.get(ball.id); const v = b.linvel();
      b.setLinvel({ ...v, y: v.y - 9.81/60 });
      b.setTranslation({ x: b.p.x + v.x/60, y: Math.max(.04, b.p.y + b.v.y/60), z: b.p.z + v.z/60 });
    }
  }
  assert.deepEqual(game.flowers[0].stack.map(id => game.ball(id).kind),['pollen','pollen','pollen','red']);
  assert.equal(game.flowerOwner(0),'red'); assert.equal(game.flowerDeposits.pollen,3); assert.equal(game.flowerDeposits.red,1);
  assert.equal(game.penalties.blue,0); assert.ok(game.flowerScore.red > 0);
});
