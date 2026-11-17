import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { DEFAULT_CONFIG, FLOWERS, HALF, ROBOT_HALF, radius } from '../../src/simulator/game.ts';

let initialized;
export const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// The same nominal collider geometry, materials, fixed step and body settings as Scene.tsx.
export async function simulateMatch(GameClass, seed, tuning = {}, recordTrace = false) {
  initialized ??= RAPIER.init(); await initialized;
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1 / 60;
  const game = new GameClass({ ...DEFAULT_CONFIG, quality: 'low' }, seeded(seed), tuning);
  const fixed = (position, half, rotation) => {
    const desc = RAPIER.ColliderDesc.cuboid(...half).setTranslation(...position);
    if (rotation) desc.setRotation(rotation);
    return world.createCollider(desc);
  };
  fixed([0, -.04, 0], [HALF + .4, .04, HALF + .4]).setFriction(.9);
  for (const sign of [-1, 1]) {
    fixed([sign * (HALF + .012), .14, 0], [.012, .14, HALF + .025]);
    fixed([0, .14, sign * (HALF + .012)], [HALF + .025, .14, .012]);
  }
  const beam = (a, b, width) => {
    const from = new Vector3(...a), to = new Vector3(...b), delta = to.clone().sub(from);
    fixed(from.add(to).multiplyScalar(.5).toArray(), [width / 2, delta.length() / 2, width / 2],
      new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()));
  };
  for (const x of [-.62825, .62825]) {
    beam([x, .01, -.49475], [x, 1.1165, 0], .035);
    beam([x, .01, .49475], [x, 1.1165, 0], .035);
    beam([x, .025, -.49475], [x, .025, .49475], .028);
  }
  beam([-.65, 1.1165, 0], [.65, 1.1165, 0], .04);
  fixed([0, .98, 0], [.185, .06, .01]);
  for (const flower of FLOWERS) {
    fixed([flower.x, .01, flower.z], [.085, .012, .085]);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      fixed([flower.x + Math.cos(a) * .062, .32, flower.z + Math.sin(a) * .062], [.006, .225, .006]);
    }
  }
  const hives = {};
  for (const team of ['red', 'blue']) {
    const angle = game.hives[team].angle;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(team === 'red' ? -.32385 : .32385, 1.1165, 0)
      .setRotation({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) }));
    for (const side of [-1, 1]) {
      world.createCollider(RAPIER.ColliderDesc.cuboid(.254, .008, .1525).setTranslation(0, -.178, side * .3915), body);
      world.createCollider(RAPIER.ColliderDesc.cuboid(.254, .178, .005).setTranslation(0, 0, side * (.3915 - .1525)), body);
      for (const s of [-1, 1]) world.createCollider(RAPIER.ColliderDesc.cuboid(.006, .178, .1525).setTranslation(s * .254, 0, side * .3915), body);
    }
    hives[team] = body;
  }
  for (const robot of game.robots) {
    const p = robot.position;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
      .setCcdEnabled(true).setLinearDamping(.5).setAngularDamping(10));
    body.setEnabledRotations(false, true, false, true); body.setAdditionalSolverIterations(4);
    body.setRotation({ x: 0, y: Math.sin(robot.heading / 2), z: 0, w: Math.cos(robot.heading / 2) }, true);
    world.createCollider(RAPIER.ColliderDesc.cuboid(ROBOT_HALF.x, ROBOT_HALF.y, ROBOT_HALF.z)
      .setMass(15).setFriction(.5).setRestitution(.03), body);
    game.bodies.set('robot-' + robot.id, body);
  }
  for (const ball of game.balls) {
    const p = ball.position;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
      .setCcdEnabled(true).setLinearDamping(.01).setAngularDamping(.6));
    world.createCollider(RAPIER.ColliderDesc.ball(radius(ball.kind)).setMass(ball.kind === 'pollen' ? .015 : .0225)
      .setFriction(.8).setRestitution(.38), body);
    body.setEnabled(ball.status === 'field'); game.bodies.set(ball.id, body);
  }
  let hiveHits = 0, flowerHits = 0, pickups = 0, blockedSeconds = 0, travel = 0, maxSpeed = 0, escapes = 0;
  const originalHide = game.hide.bind(game);
  game.hide = (ball, status) => { if (status === 'hive') hiveHits++; if (status === 'flower') flowerHits++; if (status === 'held') pickups++; originalHide(ball, status); };
  const last = game.robots.map(r => ({ ...r.position }));
  const trace = [];
  game.start();
  try {
    for (let step = 0; step < 60 * 45 && !game.settled; step++) {
      for (const team of ['red', 'blue']) {
        const angle = game.hives[team].angle;
        hives[team].setNextKinematicRotation({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) });
      }
      game.tick(1 / 60);
      if (game.paused) break;
      const commanded = game.robots.map(r => { const v = game.bodies.get('robot-' + r.id).linvel(); return Math.hypot(v.x, v.z); });
      world.step();
      for (const r of game.robots) {
        const body = game.bodies.get('robot-' + r.id), p = body.translation(), v = body.linvel();
        const distance = Math.hypot(p.x - last[r.id].x, p.z - last[r.id].z);
        if (game.phase === 'auto') {
          travel += distance;
          if (commanded[r.id] > .2 && distance * 60 < .1) blockedSeconds += 1 / 60;
        }
        if (![p.x, p.y, p.z].every(Number.isFinite) || Math.abs(p.x) > HALF + .05 || Math.abs(p.z) > HALF + .05) escapes++;
        maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.z)); last[r.id] = { ...p };
      }
      game.syncRobotPoses();
      if (recordTrace && step % 300 === 0) trace.push({ elapsed: game.elapsed, hives: game.hives,
        robots: game.robots.map(r => ({ id: r.id, position: { ...r.position }, inventory: r.inventory.length, shots: r.shots,
          plan: JSON.parse(JSON.stringify(game.botPlans?.get(r.id) ?? null)) })) });
    }
    const shots = game.robots.reduce((n, r) => n + r.shots, 0);
    return { seed, shots, hiveHits, flowerHits, pickups, hitRate: shots ? hiveHits / shots : 0,
      tips: game.hives.red.tips + game.hives.blue.tips, score: game.score.red + game.score.blue,
      blockedSeconds, travel, maxSpeed, escapes, ended: game.settled,
      robots: game.robots.map(r => ({ number: r.number, shots: r.shots, hits: r.hits })), ...(recordTrace ? { trace } : {}) };
  } finally { world.free(); }
}

export function summarize(matches) {
  const sum = key => matches.reduce((n, m) => n + m[key], 0);
  const shots = sum('shots'), hits = sum('hiveHits');
  return { matches: matches.length, shots, hiveHits: hits, hitRate: shots ? hits / shots : 0,
    meanScore: sum('score') / matches.length, meanTips: sum('tips') / matches.length, meanPickups: sum('pickups') / matches.length,
    meanBlockedSeconds: sum('blockedSeconds') / matches.length, meanTravel: sum('travel') / matches.length,
    escapes: sum('escapes'), maxSpeed: Math.max(...matches.map(m => m.maxSpeed)) };
}
