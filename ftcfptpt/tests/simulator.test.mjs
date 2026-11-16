import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, DEFAULT_CONFIG, FLOWERS, HALF, MAX_ROBOT_SPEED, ROBOT_HALF, hiveTarget, launchVelocity, loading } from "../src/simulator/game.ts";

const autoGame = () => { const game = new Game(); game.start(); return game; };
const mockBody = (position, velocity = { x: 0, y: 0, z: 0 }) => ({
  enabled: true, position: { ...position }, velocity: { ...velocity },
  translation() { return this.position; }, linvel() { return this.velocity; },
  setTranslation(value) { this.position = { ...value }; }, setLinvel(value) { this.velocity = { ...value }; },
  setAngvel() {}, setRotation() {}, setEnabled(value) { this.enabled = value; },
});

test("TU09 stages 40 pollen, 8 nectar per alliance, four preloads per robot and four pollen per flower", () => {
  const game = new Game();
  assert.equal(game.balls.filter(b => b.kind === "pollen").length, 40);
  for (const team of ["red", "blue"]) {
    assert.equal(game.balls.filter(b => b.kind === team).length, 8);
    assert.equal(game.balls.filter(b => b.kind === team && b.status === "reserve").length, 5);
    assert.equal(game.hives[team].load.length, 3);
  }
  assert.ok(game.robots.every(r => r.inventory.length === 4));
  assert.ok(game.flowers.every(f => f.stack.length === 4));
  assert.equal(new Set(game.balls.map(b => b.id)).size, 56);
});

test("AUTO ends after 30s, settles, and never enters transition or TELEOP", () => {
  const game = autoGame(), phases = new Set();
  for (let frame = 0; frame < 60 * 34; frame++) { game.tick(1 / 60); phases.add(game.phase); }
  assert.deepEqual([...phases], ["auto", "settling", "ended"]);
  assert.equal(game.remaining, 0); assert.equal(game.paused, true); assert.equal(game.settled, true);
});

test("old practice and disabled-bot settings cannot enable manual control", () => {
  const game = new Game({ ...DEFAULT_CONFIG, mode: "practice", bots: false }); game.start();
  for (const r of game.robots) game.bodies.set(`robot-${r.id}`, mockBody(r.position));
  game.tick(1 / 60);
  assert.equal(game.phase, "auto"); assert.ok(game.remaining < 30 && game.remaining > 29);
  for (const r of game.robots) {
    const v = game.bodies.get(`robot-${r.id}`).linvel();
    assert.ok(Math.hypot(v.x, v.z) > 0, `robot ${r.id} runs autonomously`);
  }
});

test("pause freezes AUTO time and resume continues the countdown", () => {
  const game = autoGame(); game.tick(5); assert.equal(game.remaining, 25);
  game.start(); const elapsed = game.elapsed; game.tick(15);
  assert.equal(game.elapsed, elapsed); assert.equal(game.remaining, 25);
  game.start(); game.tick(5); assert.equal(game.remaining, 20);
});

test("no CELL, GARDEN, or FLOWER bonuses are included in AUTO results", () => {
  const game = autoGame();
  const nectar = game.balls.find(b => b.kind === "red" && b.status === "reserve");
  nectar.status = "flower"; game.flowers[0].stack.push(nectar.id);
  game.earned.red = 20; game.finish();
  assert.deepEqual(game.score, { red: 20, blue: 0 });
});

test("LEAVE and AUTO PARK are assessed at 0:00 and are not counted twice after settling", () => {
  const game = autoGame(), robot = game.robot;
  robot.left = true;
  game.bodies.set("robot-0", mockBody({ x: -1.62, y: .13, z: -.9 }));
  game.tick(30); assert.equal(game.phase, "settling"); assert.equal(game.movement.red, 8);
  game.bodies.get("robot-0").setTranslation({ x: 0, y: .13, z: 1 });
  game.tick(3.01); assert.equal(game.phase, "ended"); assert.equal(game.movement.red, 8);
  const total = game.score.red; game.finish(); assert.equal(game.score.red, total);
});

test("NECTAR unlocks one per hive tip with no 60-second endgame release", () => {
  const game = autoGame(); assert.equal(game.nectarAvailable("red"), 0);
  game.remaining = 20; assert.equal(game.nectarAvailable("red"), 0);
  game.hives.red.tips = 2; assert.equal(game.nectarAvailable("red"), 2);
  game.feed("red"); game.feed("red"); game.feed("red");
  assert.equal(game.nectarAvailable("red"), 0);
  assert.equal(game.balls.filter(b => b.kind === "red" && b.status === "reserve").length, 3);
  assert.ok(game.balls.filter(b => b.kind === "red" && b.status === "field").every(b => loading("red", b.position)));
  assert.equal(game.balls.length, 56);
});

test("simulated human player introduces exactly one unlocked NECTAR automatically", () => {
  const game = autoGame(); game.hives.red.tips = 1;
  game.tick(.1); game.tick(.1);
  const introduced = game.balls.filter(b => b.kind === "red" && b.status === "field");
  assert.equal(introduced.length, 1); assert.ok(loading("red", introduced[0].position));
  assert.equal(game.balls.filter(b => b.kind === "red" && b.status === "reserve").length, 4);
});

test("shots use real preloads and never add points merely for firing", () => {
  const game = autoGame(); game.fire();
  assert.equal(game.robot.inventory.length, 3); assert.equal(game.robot.shots, 1);
  assert.equal(game.balls.filter(b => b.status === "field" && b.launchedBy === 0).length, 1);
  assert.deepEqual(game.score, { red: 0, blue: 0 });
  game.fire(); assert.equal(game.robot.inventory.length, 3);
  game.start(); game.elapsed += 1; game.fire(); assert.equal(game.robot.inventory.length, 3);
});

test("ballistic solution reaches the CELL and rejects an impossible trajectory", () => {
  const game = autoGame(), from = { x: -1, y: .43, z: 1 };
  const target = hiveTarget(game.hives.red), velocity = launchVelocity(from, target, 5.8);
  assert.ok(velocity);
  const t = (target.z - from.z) / velocity.z;
  assert.ok(Math.abs(from.x + velocity.x * t - target.x) < 1e-6);
  assert.ok(Math.abs(from.y + velocity.y * t - 4.905 * t * t - target.y) < 1e-6);
  assert.equal(launchVelocity(from, { x: 10, y: 4, z: 10 }, 1), null);
});

test("an aperture crossing tips a loaded hive, scores 20, and spills existing elements", () => {
  const game = autoGame(); game.config.tipLoad = 5;
  const ball = game.ball(game.robot.inventory.shift()), target = hiveTarget(game.hives.red);
  ball.status = "field"; ball.launchedBy = 0; ball.releasedAt = -1;
  ball.position = { ...target, y: target.y + .06, z: target.z + .06 };
  game.bodies.set(ball.id, mockBody({ ...target, y: target.y - .02, z: target.z - .02 }));
  game.tick(1 / 60);
  assert.equal(game.hives.red.tips, 1); assert.equal(game.earned.red, 20);
  assert.equal(game.hives.red.load.length, 0); assert.equal(ball.status, "field");
  game.tick(1); assert.equal(game.hives.red.side, -1); assert.equal(game.earned.red, 20);
});

test("autonomous intake respects capacity and cannot control opponent NECTAR", () => {
  const game = autoGame(), robot = game.robot;
  game.bodies.set("robot-0", mockBody(robot.position));
  const nectar = game.balls.find(b => b.kind === "blue" && b.status === "reserve");
  game.spawn(nectar, { ...robot.position, y: .05 }); game.bodies.set(nectar.id, mockBody(nectar.position));
  game.tick(1); assert.equal(robot.inventory.length, 4);
  game.ball(robot.inventory.shift()).status = "reserve";
  game.tick(1); assert.equal(robot.inventory.length, 3); assert.equal(nectar.status, "field");
});

test("autonomous retrieval removes bottom POLLEN and stops at bottom NECTAR", () => {
  const game = autoGame(), robot = game.robot;
  robot.inventory.forEach(id => game.ball(id).status = "reserve"); robot.inventory = [];
  game.bodies.set("robot-0", mockBody({ ...FLOWERS[0], y: .13 }));
  game.tick(1); assert.equal(robot.inventory.length, 1); assert.equal(game.flowers[0].stack.length, 3);
  const nectar = game.balls.find(b => b.kind === "red" && b.status === "reserve");
  nectar.status = "flower"; game.flowers[0].stack.unshift(nectar.id);
  game.tick(1); assert.equal(robot.inventory.length, 1);
});

test("a robot shooting NECTAR into a flower during AUTO incurs +20 opponent, no flower points", () => {
  const game = autoGame(), nectar = game.balls.find(b => b.kind === "red" && b.status === "reserve");
  nectar.status = "field"; nectar.launchedBy = 0; nectar.position = { ...FLOWERS[0], y: .56 };
  game.bodies.set(nectar.id, mockBody({ ...FLOWERS[0], y: .53 })); game.tick(1 / 60);
  assert.equal(nectar.status, "flower"); assert.equal(game.penalties.blue, 20);
  assert.deepEqual(game.score, { red: 0, blue: 20 });
});

test("settling waits for moving balls without permitting new autonomous shots", () => {
  const game = autoGame(); game.tick(30);
  const ball = game.balls.find(b => b.status === "field"), body = mockBody(ball.position, { x: .2, y: 0, z: 0 });
  game.bodies.set(ball.id, body);
  game.tick(3.01); assert.equal(game.phase, "settling");
  const shots = game.robots.map(r => r.shots);
  game.fire(); assert.deepEqual(game.robots.map(r => r.shots), shots);
  body.setLinvel({ x: 0, y: 0, z: 0 }); game.tick(.3);
  assert.equal(game.phase, "ended");
});

test("explosive contacts cannot carry a robot and following camera off the field", () => {
  const game = autoGame(), robot = game.robot, lastGood = { ...robot.position };
  const body = mockBody({ x: -2230.12, y: .13, z: 1167.59 }, { x: -41331.99, y: 0, z: -7089.64 });
  game.bodies.set("robot-0", body); game.syncRobotPoses();
  assert.ok(Math.abs(robot.position.x - lastGood.x) < 1e-6); assert.ok(Math.abs(robot.position.z - lastGood.z) < 1e-6);
  assert.deepEqual(body.translation(), robot.position); assert.deepEqual(body.linvel(), { x: 0, y: 0, z: 0 });
  assert.equal(robot.inventory.length, 4);
});

test("rotated chassis bounds and finite velocities are enforced before rendering", () => {
  const game = autoGame(), robot = game.robot; robot.heading = Math.PI / 4;
  const body = mockBody({ x: 1.8, y: .13, z: 1.8 }, { x: 400, y: 0, z: 500 });
  game.bodies.set("robot-0", body); game.syncRobotPoses();
  const extent = (ROBOT_HALF.x + ROBOT_HALF.z) / Math.sqrt(2);
  assert.ok(robot.position.x <= HALF - extent + 1e-8); assert.ok(robot.position.z <= HALF - extent + 1e-8);
  assert.ok(Math.hypot(body.linvel().x, body.linvel().z) <= MAX_ROBOT_SPEED);
  body.setTranslation({ x: NaN, y: Infinity, z: -Infinity }); body.setLinvel({ x: NaN, y: 0, z: NaN }); game.syncRobotPoses();
  assert.ok(Object.values(robot.position).every(Number.isFinite)); assert.deepEqual(body.linvel(), { x: 0, y: 0, z: 0 });
});

test("autonomous steering uses angular velocity, preserving gravity and contact response", () => {
  const game = autoGame(), robot = game.robot, body = mockBody(robot.position, { x: 0, y: -.2, z: 0 });
  let teleports = 0, angular;
  body.rotation = () => ({ x: 0, y: 1, z: 0, w: 0 }); body.setRotation = () => { teleports++; }; body.setAngvel = value => { angular = value; };
  game.bodies.set("robot-0", body); game.tick(1 / 60);
  assert.equal(teleports, 0); assert.ok(Math.abs(angular.y) > 0 && Math.abs(angular.y) <= 2.4);
  assert.equal(body.linvel().y, -.2);
});
