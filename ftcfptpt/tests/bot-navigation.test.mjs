import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, DEFAULT_CONFIG, FLOWERS } from '../src/simulator/game.ts';
import { planPath, segmentClear, safePoint, navigable } from '../src/simulator/bot-navigation.ts';
import { avoidTraffic } from '../src/simulator/bot-traffic.ts';

const body = (position, velocity = { x: 0, y: 0, z: 0 }) => ({
  p: { ...position }, v: { ...velocity },
  translation() { return this.p; }, linvel() { return this.v; },
  setTranslation(p) { this.p = { ...p }; }, setLinvel(v) { this.v = { ...v }; },
  setAngvel() {}, setRotation() {}, setEnabled() {},
});
const create = () => { const game = new Game(DEFAULT_CONFIG, () => .5); game.start(); return game; };

test('predictive steering brakes for another chassis before reaching physical contact', () => {
  const self = { id: 1, position: { x: -1.3, z: -.8 }, velocity: { x: 0, z: .5 }, heading: 0 };
  const other = { id: 0, position: { x: -1.3, z: 0 }, velocity: { x: 0, z: 0 }, heading: 0 };
  const safe = avoidTraffic(self,{x:0,z:1.2},[other],-1,{x:-1.3,z:1});
  assert.ok(safe.z < .8);
  for (const t of [.2,.4,.6,.8]) {
    const response = .08 * (1 - Math.exp(-t/.08));
    const dx = self.position.x + safe.x*t - safe.x*response - other.position.x;
    const dz = self.position.z + safe.z*t + (.5-safe.z)*response - other.position.z;
    assert.ok(Math.abs(dx) > .4 || Math.abs(dz) > .42, 'the planned rectangles remain separated');
  }
});

test('passing maneuvers respect frame clearance and do not brake unobstructed routes', () => {
  const self = { id: 1, position: { x: -1.05, z: 0 }, velocity: { x: 0, z: 0 }, heading: Math.PI };
  const desired = { x: .8, z: 0 };
  assert.deepEqual(avoidTraffic(self,desired,[],-1),desired);
  const safe = avoidTraffic(self,desired,[{id:0,position:{x:-1.4,z:1.2},velocity:{x:0,z:0},heading:0}],-1);
  assert.ok(segmentClear(self.position,{x:self.position.x+safe.x*.8,z:self.position.z+safe.z*.8}));
});

test('routes pass around the inflated A-frame on the correct alliance half', () => {
  for (const side of [-1, 1]) {
    const start = { x: side * .6, z: 1.4 }, goal = { x: side * .6, z: -1.4 };
    assert.equal(segmentClear(start, goal), false);
    const route = planPath(start, goal, side);
    assert.ok(route.length >= 2); assert.deepEqual(route.at(-1), goal);
    let last = start;
    for (const point of route) {
      assert.ok(point.x * side > 0); assert.ok(navigable(point));
      assert.ok(segmentClear(last, point)); last = point;
    }
  }
});
test('clear short routes stay direct and unreachable perimeter targets are bounded', () => {
  const start = { x: -1.4, z: .1 }, goal = { x: -1.2, z: .5 };
  assert.deepEqual(planPath(start, goal, -1), [goal]);
  assert.deepEqual(safePoint({ x: -10, z: 10 }, -1), { x: -1.49, z: 1.49 });
});
test('a bot brakes and stabilizes before throwing, rather than firing while moving', () => {
  const game = create(), robot = game.robot;
  const chassis = body({ x: -1.03, y: .13, z: 1.28 }, { x: .8, y: 0, z: 0 });
  game.bodies.set('robot-0', chassis);
  for (let frame = 0; frame < 90; frame++) { chassis.v = { x: .8, y: 0, z: 0 }; game.tick(1 / 60); }
  assert.equal(robot.shots, 0);
  for (let frame = 0; frame < 15; frame++) { chassis.v = { x: 0, y: 0, z: 0 }; game.tick(1 / 60); }
  assert.equal(robot.shots, 1); assert.equal(robot.inventory.length, 3);
});
test('teammates reserve enough in-flight pollen for one tip and avoid excess shots', () => {
  const game = create();
  for (const robot of game.robots) {
    const side = robot.team === 'red' ? -1 : 1, hive = game.hives[robot.team];
    game.bodies.set('robot-' + robot.id, body({ x: side * (robot.id % 2 ? 1.47 : 1.03), y: .13,
      z: hive.side * (robot.id % 2 ? .78 : 1.28) }));
  }
  for (let frame = 0; frame < 60; frame++) game.tick(1 / 60);
  for (const team of ['red', 'blue']) {
    assert.equal(game.robots.filter(r => r.team === team).reduce((sum, r) => sum + r.shots, 0), 4);
    assert.equal(game.balls.filter(b => b.flight?.team === team && b.status === 'field').length, 4);
  }
});
test('retrieval approaches the actual flower and fills the hopper before leaving', () => {
  const game = create(), robot = game.robot;
  robot.inventory.forEach(id => game.ball(id).status = 'reserve'); robot.inventory = [];
  game.bodies.set('robot-0', body({ x: FLOWERS[0].x, y: .13, z: -1.49 }));
  for (let frame = 0; frame < 50; frame++) game.tick(1 / 60);
  assert.equal(robot.inventory.length, 4); assert.equal(game.flowers[0].stack.length, 0);
});
test('resource selection never redirects a bot to an opponent-side flower', () => {
  const game = create(), robot = game.robot;
  robot.inventory.forEach(id => game.ball(id).status = 'reserve'); robot.inventory = [];
  for (const ball of game.balls) if (ball.status === 'field') ball.status = 'reserve';
  game.flowers[0].stack = []; game.flowers[3].stack = [];
  game.bodies.set('robot-0', body(robot.position)); game.tick(1 / 60);
  assert.equal(robot.intake, false); assert.equal(robot.inventory.length, 0);
});
