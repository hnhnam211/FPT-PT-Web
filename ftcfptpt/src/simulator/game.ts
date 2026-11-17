// BIOBUZZ TU09, sections 9–11. Distances in metres, time in seconds.
// The hive load threshold is a tunable simulation parameter, not an official rule.
import { BOT_POLICY, type BotTuning } from "./bot-policy.ts";
import { navigable, planPath, safePoint, type Point } from "./bot-navigation.ts";
export type Team = "red" | "blue";
export type BallKind = "pollen" | Team;
export type Phase = "ready" | "auto" | "settling" | "ended";
export type Vec = { x: number; y: number; z: number };
export type Body = {
  translation(): Vec;
  linvel(): Vec;
  rotation?(): { x: number; y: number; z: number; w: number };
  setTranslation(v: Vec, wake: boolean): void;
  setLinvel(v: Vec, wake: boolean): void;
  setAngvel(v: Vec, wake: boolean): void;
  setRotation(q: { x: number; y: number; z: number; w: number }, wake: boolean): void;
  setEnabled(enabled: boolean): void;
};
export const FIELD = 3.6576;
export const HALF = FIELD / 2;
export const ROBOT_HALF = { x: 0.2, y: 0.13, z: 0.21 };
export const MAX_ROBOT_SPEED = 3.5;
export const COLORS = { red: "#ed4e59", blue: "#4c8dff", pollen: "#f4cc36" };
export const other = (team: Team): Team => team === "red" ? "blue" : "red";
export const radius = (kind: BallKind) => kind === "pollen" ? 0.0355 : 0.0455;
export const FLOWERS = [
  { x: -0.6096, z: -1.765, name: "Xa · trái" },
  { x: 1.765, z: -0.6096, name: "Phải · xa" },
  { x: 0.6096, z: 1.765, name: "Gần · phải" },
  { x: -1.765, z: 0.6096, name: "Trái · gần" },
];
export const POINTS = { leave: 3, park: 5, tip: 20 };
export const loading = (team: Team, p: Vec, margin = 0) => team === "red"
  ? p.x < -HALF + 0.2795 + margin && p.z > -1.2192 - margin && p.z < -0.635 + margin
  : p.x > HALF - 0.2795 - margin && p.z > 0.635 - margin && p.z < 1.2192 + margin;
export interface Config {
  team: Team;
  speed: number;
  power: number;
  tipLoad: number;
  trajectory: boolean;
  quality: "high" | "low";
}
export const DEFAULT_CONFIG: Config = {
  team: "red", speed: 1.55,
  power: 5.8, tipLoad: 8, trajectory: true, quality: "high",
};
export interface Ball {
  id: string; kind: BallKind; status: "field" | "held" | "hive" | "flower" | "reserve";
  position: Vec; previous: Vec; launchedBy: number | null; releasedAt: number;
  mustTouchFloor: boolean;
  flight?: { team: Team; side: number; arrivalAt: number };
}
export interface Robot {
  id: number; number: string; team: Team; position: Vec; heading: number;
  turret: number; hood: number; inventory: string[]; intake: boolean;
  lastShot: number; lastPickup: number; shots: number; hits: number;
  speed: number; left: boolean;
  task: "idle" | "move" | "collect" | "aim" | "wait" | "park";
}
export interface Hive {
  team: Team; side: number; angle: number; tips: number; load: string[];
  tipping: number; nextSide: number;
}
export interface Flower { stack: string[] }
export interface Event { id: number; text: string; team?: Team; at: number }
interface BotPlan {
  mode: "shoot" | "collect" | "park" | "roam";
  target: Point;
  resource?: string;
  hiveSide: number;
  path: Point[];
  rerouteAt: number;
  expiresAt: number;
  nextShotAt: number;
  readyFor: number;
  lastPosition: Point;
  stuckFor: number;
}
type Score = { red: number; blue: number };
const zeroScore = (): Score => ({ red: 0, blue: 0 });
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function hiveTarget(hive: Hive): Vec {
  const angle = -hive.side * Math.PI / 6;
  return { x: hive.team === "red" ? -0.32385 : 0.32385,
    y: 1.1165 - Math.sin(angle) * hive.side * 0.544,
    z: Math.cos(angle) * hive.side * 0.544 };
}
export function launchVelocity(from: Vec, to: Vec, speed: number): Vec | null {
  const dx = to.x - from.x, dz = to.z - from.z;
  const d = Math.hypot(dx, dz), h = to.y - from.y, g = 9.81;
  if (d < 0.02) return null;
  const disc = speed ** 4 - g * (g * d * d + 2 * h * speed * speed);
  if (disc < 0) return null;
  const angle = Math.atan((speed * speed + Math.sqrt(disc)) / (g * d));
  const horizontal = speed * Math.cos(angle);
  return { x: dx / d * horizontal, y: speed * Math.sin(angle), z: dz / d * horizontal };
}

export class Game {
  readonly id = Math.random().toString(36).slice(2);
  config: Config;
  phase: Phase = "ready";
  remaining = 30;
  elapsed = 0;
  paused = true;
  controlled = 0;
  robots: Robot[];
  balls: Ball[] = [];
  hives: Record<Team, Hive>;
  flowers: Flower[] = FLOWERS.map(() => ({ stack: [] }));
  bodies = new Map<string, Body>();
  events: Event[] = [];
  earned = zeroScore();
  movement = zeroScore();
  penalties = zeroScore();
  score = zeroScore();
  settled = false;
  private settlingElapsed = 0;
  private autoMovementAssessed = false;
  aimValid = false;
  device = "keyboard";
  history: number[] = [];
  private revision = 0;
  private lastEmit = -1;
  private eventId = 0;
  private listeners = new Set<() => void>();
  private spawnPositions: Vec[];
  private random: () => number;
  private botPlans = new Map<number, BotPlan>();
  private tuning: BotTuning;
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  getSnapshot = () => this.revision;
  emit() { this.revision++; this.listeners.forEach(fn => fn()); }
  constructor(config: Config = DEFAULT_CONFIG, random: () => number = Math.random, tuning: Partial<BotTuning> = {}) {
    this.config = { ...config };
    this.random = random;
    this.tuning = { ...BOT_POLICY, ...tuning };
    this.controlled = config.team === "red" ? 0 : 2;
    this.robots = [
      { team: "red", number: "23321", x: -0.7, z: HALF - 0.21, heading: Math.PI },
      { team: "red", number: "28668", x: -HALF + 0.2, z: -0.35, heading: Math.PI / 2 },
      { team: "blue", number: "3141", x: 0.7, z: -HALF + 0.21, heading: 0 },
      { team: "blue", number: "5927", x: HALF - 0.2, z: 0.35, heading: -Math.PI / 2 },
    ].map((r, id) => ({ id, number: r.number, team: r.team as Team,
      position: { x: r.x, y: 0.13, z: r.z }, heading: r.heading, turret: 0, hood: 1,
      inventory: [], intake: false, lastShot: -10, lastPickup: -10, shots: 0, hits: 0, speed: 0, left: false, task: "idle" }));
    this.spawnPositions = this.robots.map(robot => ({ ...robot.position }));
    this.hives = {
      red: { team: "red", side: 1, nextSide: -1, angle: -Math.PI / 6, tips: 0, load: [], tipping: 0 },
      blue: { team: "blue", side: -1, nextSide: 1, angle: Math.PI / 6, tips: 0, load: [], tipping: 0 },
    };
    for (const robot of this.robots) for (let i = 0; i < 4; i++) robot.inventory.push(this.addBall("pollen", "held"));
    for (const flower of this.flowers) for (let i = 0; i < 4; i++) flower.stack.push(this.addBall("pollen", "flower"));
    for (const team of ["red", "blue"] as const) {
      for (let i = 0; i < 4; i++) this.addBall("pollen", "field", {
        x: (team === "red" ? -1 : 1) * (HALF - 0.055 - i * 0.073), y: 0.04,
        z: (team === "red" ? 1 : -1) * (HALF - 0.038),
      });
      for (let i = 0; i < 3; i++) this.hives[team].load.push(this.addBall(team, "hive"));
      for (let i = 0; i < 5; i++) this.addBall(team, "reserve");
    }
    this.note("BIOBUZZ · Sẵn sàng trên sân");
  }
  private addBall(kind: BallKind, status: Ball["status"], position: Vec = { x: 0, y: -5, z: 0 }) {
    const id = `ball-${this.balls.length}`;
    this.balls.push({ id, kind, status, position: { ...position }, previous: { ...position }, launchedBy: null, releasedAt: -10, mustTouchFloor: false });
    return id;
  }
  ball(id: string) { return this.balls[Number(id.slice(5))]; }
  get robot() { return this.robots[this.controlled]; }
  note(text: string, team?: Team) {
    this.events.unshift({ id: ++this.eventId, text, team, at: this.elapsed });
    this.events = this.events.slice(0, 30);
  }
  start() {
    if (this.phase === "ended") return;
    if (this.phase === "ready") {
      this.phase = "auto";
      this.note("AUTO · Bot tự tìm đường, lấy bóng và căn ném trong 30 giây");
    }
    this.paused = !this.paused;
    this.emit();
  }
  selectRobot(id: number) { this.controlled = id; this.config.team = this.robot.team; this.emit(); }
  targetPosition(robot: Robot = this.robot): Vec {
    return hiveTarget(this.hives[robot.team]);
  }
  private hide(ball: Ball, status: Ball["status"]) {
    ball.status = status; this.bodies.get(ball.id)?.setEnabled(false);
  }
  spawn(ball: Ball, position: Vec, velocity: Vec = { x: 0, y: 0, z: 0 }) {
    ball.flight = undefined;
    ball.status = "field"; ball.position = { ...position }; ball.previous = { ...position };
    ball.releasedAt = this.elapsed;
    const body = this.bodies.get(ball.id);
    if (body) {
      body.setEnabled(true); body.setTranslation(position, true); body.setLinvel(velocity, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }
  nectarAvailable(team: Team) {
    const remaining = this.balls.filter(b => b.kind === team && b.status === "reserve").length;
    const entered = 5 - remaining;
    return Math.min(remaining, Math.max(0, this.hives[team].tips - entered));
  }
  feed(team: Team, silent = false) {
    if (this.paused || this.phase !== "auto") return;
    if (this.nectarAvailable(team) < 1) { if (!silent) { this.note("NECTAR chưa mở khóa · Cần lật HIVE", team); this.emit(); } return; }
    const ball = this.balls.find(b => b.kind === team && b.status === "reserve");
    if (!ball) return;
    const index = this.balls.filter(b => b.kind === team && b.status === "field" && loading(team, b.position)).length;
    this.spawn(ball, { x: team === "red" ? -1.765 : 1.765, y: radius(team) + 0.01,
      z: (team === "red" ? -1 : 1) * (0.7 + index % 5 * 0.093) });
    this.note("HUMAN PLAYER · Đã nạp 1 NECTAR vào loading zone", team); this.emit();
  }
  fire(robot = this.robot) {
    if (this.paused || this.phase !== "auto" || this.elapsed - robot.lastShot < 0.48 || !robot.inventory.length) return;
    const target = this.targetPosition(robot);
    const from = { x: robot.position.x, y: 0.43, z: robot.position.z };
    const velocity = this.shotVelocity(robot);
    if (!velocity) { if (robot.id === this.controlled) { this.note("Mục tiêu ngoài tầm bắn · Tăng lực hoặc tiến gần hơn"); this.emit(); } return; }
    const ball = this.ball(robot.inventory.shift()!);
    ball.launchedBy = robot.id; ball.mustTouchFloor = false;
    // Barrel extends beyond the chassis collider; preserve the solved trajectory.
    const t = 0.045;
    this.spawn(ball, { x: from.x + velocity.x * t, y: from.y + velocity.y * t - 4.905 * t * t, z: from.z + velocity.z * t },
      { ...velocity, y: velocity.y - 9.81 * t });
    ball.flight = { team: robot.team, side: this.hives[robot.team].side,
      arrivalAt: this.elapsed + Math.hypot(target.x - from.x, target.z - from.z) / Math.hypot(velocity.x, velocity.z) - t };
    robot.lastShot = this.elapsed; robot.shots++;
  }
  private shotVelocity(robot: Robot): Vec | null {
    const target = this.targetPosition(robot);
    return launchVelocity({ ...robot.position, y: .43 }, { ...target, y: target.y + this.tuning.aimLift }, this.config.power);
  }
  shotPreview(robot: Robot = this.robot) {
    const velocity = this.shotVelocity(robot);
    return velocity ? { from: { ...robot.position, y: .43 }, velocity, target: this.targetPosition(robot), side: this.hives[robot.team].side } : null;
  }
  private hiveCommitted(team: Team): number {
    const hive = this.hives[team];
    const weight = (ball: Ball) => ball.kind === "pollen" ? 1 : 1.5;
    return hive.load.reduce((sum, id) => sum + weight(this.ball(id)), 0) + this.balls.reduce((sum, ball) =>
      sum + (ball.status === "field" && ball.flight?.team === team && ball.flight.side === hive.side &&
        this.elapsed <= ball.flight.arrivalAt + .2 ? weight(ball) : 0), 0);
  }
  private scoreFlower(ball: Ball, fi: number) {
    if (ball.kind !== "pollen" && ball.launchedBy !== null) {
      const team = this.robots[ball.launchedBy].team;
      this.penalties[other(team)] += 20;
      this.note("G410 · NECTAR vào FLOWER sớm · +20 đối phương", team);
    }
    this.hide(ball, "flower"); this.flowers[fi].stack.push(ball.id);
    if (ball.launchedBy !== null) this.robots[ball.launchedBy].hits++;
    this.note(`FLOWER ${fi + 1} · ${ball.kind === "pollen" ? "POLLEN" : "NECTAR"} đã vào`, ball.kind === "pollen" ? undefined : ball.kind);
  }
  private tip(hive: Hive) {
    hive.tips++; this.earned[hive.team] += POINTS.tip;
    hive.tipping = 1; hive.nextSide = -hive.side;
    const target = hiveTarget(hive);
    hive.load.forEach((id, index) => {
      const ball = this.ball(id); ball.launchedBy = null; ball.mustTouchFloor = true;
      const spread = (index - hive.load.length / 2) * 0.055;
      this.spawn(ball, { x: target.x + spread, y: target.y - 0.07, z: target.z },
        { x: spread * 1.5, y: 0.3 + index * 0.04, z: hive.side * 0.65 });
    });
    hive.load = [];
    this.note(`HIVE ${hive.team === "red" ? "ĐỎ" : "XANH"} TIP! +20 (AUTO)`, hive.team);
  }
  private collect(robot: Robot) {
    if (robot.inventory.length >= 4 || this.elapsed - robot.lastPickup < 0.22) return;
    const candidate = this.balls.find(ball => ball.status === "field" && !ball.mustTouchFloor &&
      (ball.kind === "pollen" || ball.kind === robot.team) && ball.position.y < 0.17 &&
      this.elapsed - ball.releasedAt > 0.45 && dist(ball.position, robot.position) < 0.34);
    if (candidate) { this.hide(candidate, "held"); robot.inventory.push(candidate.id); robot.lastPickup = this.elapsed; return; }
    const fi = FLOWERS.findIndex((f, index) => dist(f, robot.position) < 0.34 &&
      this.flowers[index].stack.length && this.ball(this.flowers[index].stack[0]).kind === "pollen");
    if (fi >= 0) {
      const id = this.flowers[fi].stack.shift()!;
      this.hide(this.ball(id), "held"); robot.inventory.push(id); robot.lastPickup = this.elapsed;
    }
  }
  syncRobotPoses() {
    for (const robot of this.robots) {
      const body = this.bodies.get(`robot-${robot.id}`);
      if (!body) continue;
      const pose = body.translation(), velocity = body.linvel();
      const finite = (v: Vec) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
      const valid = (v: Vec) => finite(v) && Math.abs(v.x) <= HALF + 0.5 && Math.abs(v.z) <= HALF + 0.5 && v.y > -0.5 && v.y < 3;
      const rotation = body.rotation?.();
      if (rotation && Object.values(rotation).every(Number.isFinite))
        robot.heading = Math.atan2(2 * (rotation.w * rotation.y + rotation.x * rotation.z), 1 - 2 * (rotation.y ** 2 + rotation.z ** 2));
      if (!Number.isFinite(robot.heading)) robot.heading = 0;
      const c = Math.abs(Math.cos(robot.heading)), s = Math.abs(Math.sin(robot.heading));
      const limitX = HALF - ROBOT_HALF.x * c - ROBOT_HALF.z * s;
      const limitZ = HALF - ROBOT_HALF.x * s - ROBOT_HALF.z * c;
      const source = valid(pose) ? pose : valid(robot.position) ? robot.position : this.spawnPositions[robot.id];
      const bounded = { x: clamp(source.x, -limitX, limitX), y: source.y, z: clamp(source.z, -limitZ, limitZ) };
      const recovered = !valid(pose);
      const hitX = bounded.x !== pose.x, hitZ = bounded.z !== pose.z;
      if (recovered || hitX || hitZ) {
        body.setTranslation(bounded, true);
        if (recovered) {
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          body.setRotation({ x: 0, y: Math.sin(robot.heading / 2), z: 0, w: Math.cos(robot.heading / 2) }, true);
        }
      }
      let nextVelocity = finite(velocity) && !recovered ? { ...velocity } : { x: 0, y: 0, z: 0 };
      const planarSpeed = Math.hypot(nextVelocity.x, nextVelocity.z);
      if (planarSpeed > MAX_ROBOT_SPEED) {
        nextVelocity.x *= MAX_ROBOT_SPEED / planarSpeed; nextVelocity.z *= MAX_ROBOT_SPEED / planarSpeed;
      }
      if (hitX && nextVelocity.x * bounded.x > 0) nextVelocity.x = 0;
      if (hitZ && nextVelocity.z * bounded.z > 0) nextVelocity.z = 0;
      nextVelocity.y = clamp(nextVelocity.y, -4, 4);
      if (nextVelocity.x !== velocity.x || nextVelocity.y !== velocity.y || nextVelocity.z !== velocity.z)
        body.setLinvel(nextVelocity, true);
      robot.position = bounded;
      robot.speed = Math.hypot(nextVelocity.x, nextVelocity.z);
    }
  }
  private drive(robot: Robot, x: number, z: number, turn: number, dt: number, speed: number) {
    const body = this.bodies.get(`robot-${robot.id}`);
    if (!body) return;
    const norm = Math.max(1, Math.hypot(x, z));
    x /= norm; z /= norm;
    // Let the solver rotate the chassis. Teleporting a dynamic body's rotation
    // each tick can create deep overlaps and explosive contact impulses.
    const angularSpeed = clamp(turn, -1, 1) * 2.4;
    if (!body.rotation) robot.heading += angularSpeed * dt;
    const current = body.linvel(), response = Math.min(1, dt * 12);
    // Velocity control represents wheel traction. Compensate ground friction so
    // small final approach commands can overcome static friction and reach the goal.
    const traction = speed > 0 && robot.position.y < .16 ? 9.81 * Math.min(dt, 1 / 30) * this.tuning.tractionCompensation : 0;
    body.setLinvel({ x: current.x + (x * speed - current.x) * response + x * traction, y: current.y,
      z: current.z + (z * speed - current.z) * response + z * traction }, true);
    body.setAngvel({ x: 0, y: angularSpeed, z: 0 }, true);
    robot.speed = Math.hypot(current.x, current.z);
  }
  private bot(robot: Robot, dt: number) {
    const side = robot.team === "red" ? -1 : 1, hive = this.hives[robot.team];
    const neighbors = this.robots.filter(other => other.id !== robot.id);
    let plan = this.botPlans.get(robot.id);
    if (plan) {
      if (dist(robot.position, plan.lastPosition) >= .06) { plan.stuckFor = 0; plan.lastPosition = { ...robot.position }; }
      else if (dist(robot.position, plan.target) > this.tuning.arrivalRadius) plan.stuckFor += dt;
    }
    const park = this.remaining < this.tuning.parkLead && (!robot.inventory.length || this.hiveCommitted(robot.team) >= this.config.tipLoad);
    const resource = plan?.resource ? this.resourceTarget(plan.resource, side) : null;
    const needsPlan = !plan || park && plan.mode !== "park" ||
      plan.mode === "shoot" && (!robot.inventory.length || plan.hiveSide !== hive.side) ||
      plan.mode === "collect" && (!resource || robot.inventory.length >= 4) ||
      plan.mode === "roam" && this.elapsed >= plan.expiresAt;
    if (needsPlan) {
      let mode: BotPlan["mode"], target: Point, resourceId: string | undefined;
      const source = this.pickResource(robot);
      if (park) { mode = "park"; target = { x: side * 1.48, z: side * .93 }; }
      else if (robot.inventory.length && (plan?.mode !== "collect" || robot.inventory.length >= 4 || !source || dist(source.target, robot.position) > .55)) {
        mode = "shoot";
        target = { x: side * (robot.id % 2 ? this.tuning.outerStation : 1.03), z: hive.side * (robot.id % 2 ? .78 : 1.28) };
        target.x += (this.random() - .5) * .025; target.z += (this.random() - .5) * .025;
      } else if (source) { mode = "collect"; target = source.target; resourceId = source.id; }
      else if (robot.inventory.length) {
        mode = "shoot"; target = { x: side * 1.1, z: hive.side * 1.15 };
      } else {
        mode = "roam"; target = { x: side * (1.05 + this.random() * .4), z: (this.random() * 2 - 1) * 1.4 };
      }
      target = safePoint(target, side);
      plan = {
        mode, target, resource: resourceId, hiveSide: hive.side, path: [], rerouteAt: 0,
        expiresAt: this.elapsed + 1.8, nextShotAt: plan?.nextShotAt ?? this.elapsed + .2 + this.random() * .12,
        readyFor: 0, lastPosition: { ...robot.position }, stuckFor: 0,
      };
      this.botPlans.set(robot.id, plan);
    }
    if (!plan) return;
    if (resource && plan.mode === "collect") plan.target = resource;
    if (plan.stuckFor > .8) {
      const escapes = [{ x: robot.position.x + side * .35, z: robot.position.z },
        { x: robot.position.x - side * .3, z: robot.position.z },
        { x: robot.position.x, z: robot.position.z + .4 }, { x: robot.position.x, z: robot.position.z - .4 }]
        .map(p => safePoint(p, side)).filter(navigable);
      escapes.sort((a, b) => this.clearanceScore(b, neighbors) - this.clearanceScore(a, neighbors));
      const escape = escapes[Math.min(1, Math.floor(this.random() * Math.min(2, escapes.length)))];
      if (escape) plan.path = [...planPath(robot.position, escape, side), ...planPath(escape, plan.target, side)];
      plan.rerouteAt = this.elapsed + .8; plan.stuckFor = 0; plan.lastPosition = { ...robot.position };
    } else if (this.elapsed >= plan.rerouteAt) {
      plan.path = planPath(robot.position, plan.target, side, neighbors.map(r => r.position), this.tuning.avoidanceRadius);
      plan.rerouteAt = this.elapsed + .5;
    }
    while (plan.path.length > 1 && dist(robot.position, plan.path[0]) < .13) plan.path.shift();
    const target = plan.path[0] ?? plan.target;
    const dx = target.x - robot.position.x, dz = target.z - robot.position.z;
    const distance = Math.hypot(dx, dz);
    const sourcePosition = plan.resource?.startsWith("flower-") ? FLOWERS[Number(plan.resource.slice(7))] : plan.resource ? this.ball(plan.resource)?.position : null;
    const arrived = plan.mode === "collect" ? !!sourcePosition && dist(robot.position, sourcePosition) < .325 : dist(robot.position, plan.target) < this.tuning.arrivalRadius;
    let speed = arrived ? 0 : Math.min(distance * 3.2, Math.sqrt(2 * 2.3 * distance), this.config.speed * this.tuning.cruiseFactor);
    for (const other of neighbors) {
      const separation = dist(robot.position, other.position);
      const toward = dx * (other.position.x - robot.position.x) + dz * (other.position.z - robot.position.z);
      if (separation < this.tuning.avoidanceRadius && toward > 0 && (other.id < robot.id || other.speed < .08))
        speed *= clamp((separation - .4) / Math.max(.01, this.tuning.avoidanceRadius - .4), .15, 1);
    }
    // Mecanum drive can strafe without spinning the chassis. Keep it aligned in
    // narrow lanes; face a flower only when approaching its retrieval opening.
    const nearFlower = FLOWERS.find(f => dist(robot.position, f) < .45);
    const desired = nearFlower ? Math.atan2(nearFlower.x - robot.position.x, nearFlower.z - robot.position.z)
      : robot.team === "red" ? Math.PI : 0;
    const delta = Math.atan2(Math.sin(desired - robot.heading), Math.cos(desired - robot.heading));
    if (nearFlower && Math.abs(delta) > .25) speed = Math.min(speed, .1);
    robot.intake = plan.mode === "collect" && robot.inventory.length < 4;
    this.drive(robot, dx / Math.max(distance, .001), dz / Math.max(distance, .001), Math.abs(delta) < .025 ? 0 : delta * 2, dt, speed);
    if (robot.intake) this.collect(robot);
    const ready = plan.mode === "shoot" && arrived && robot.speed <= this.tuning.shootSpeed && !hive.tipping;
    robot.task = plan.mode === "park" ? "park" : plan.mode === "collect" ? "collect" : plan.mode === "shoot"
      ? hive.tipping || this.hiveCommitted(robot.team) >= this.config.tipLoad ? "wait" : arrived ? "aim" : "move" : "move";
    plan.readyFor = ready ? plan.readyFor + dt : 0;
    if (plan.readyFor >= .12 && this.elapsed >= plan.nextShotAt && this.hiveCommitted(robot.team) < this.config.tipLoad) {
      this.fire(robot); plan.nextShotAt = this.elapsed + this.tuning.shotInterval;
    }
  }
  private clearanceScore(point: Point, neighbors: Robot[]): number {
    return neighbors.reduce((score, robot) => Math.min(score, dist(point, robot.position)), 2);
  }
  private resourceTarget(id: string, side: number): Point | null {
    if (id.startsWith("flower-")) {
      const index = Number(id.slice(7)), flower = this.flowers[index];
      if (!flower?.stack.length || this.ball(flower.stack[0]).kind !== "pollen") return null;
      const f = FLOWERS[index]; return f.x * side > 0 ? safePoint({ x: f.x, z: f.z }, side) : null;
    }
    const ball = this.ball(id);
    if (!ball || ball.status !== "field" || ball.mustTouchFloor || ball.position.y > .18 ||
      this.elapsed - ball.releasedAt < .45 || (ball.kind !== "pollen" && ball.kind !== (side < 0 ? "red" : "blue")) || ball.position.x * side < .1) return null;
    const target = safePoint(ball.position, side);
    return navigable(target) && dist(target, ball.position) < .31 ? target : null;
  }
  private pickResource(robot: Robot): { id: string; target: Point } | null {
    const side = robot.team === "red" ? -1 : 1;
    const options: { id: string; target: Point; cost: number }[] = [];
    for (const id of [...this.balls.map(b => b.id), ...FLOWERS.map((_, i) => "flower-" + i)]) {
      const target = this.resourceTarget(id, side);
      if (!target || target.x * side < 0) continue;
      const claimed = [...this.botPlans.entries()].some(([idOther, plan]) => idOther !== robot.id && plan.resource === id && plan.mode === "collect");
      options.push({ id, target, cost: dist(target, robot.position) + (claimed ? 1.6 : 0) + this.random() * .04 });
    }
    options.sort((a, b) => a.cost - b.cost);
    return options[0] ?? null;
  }
  private assessMovement() {
    if (this.autoMovementAssessed) return;
    this.autoMovementAssessed = true;
    for (const robot of this.robots) {
      if (robot.left) this.movement[robot.team] += POINTS.leave;
      if (loading(robot.team, robot.position, 0.2)) this.movement[robot.team] += POINTS.park;
    }
  }
  private advance() {
    if (this.phase === "auto") { this.assessMovement(); this.phase = "settling"; this.remaining = 3; this.settlingElapsed = 0; this.note("AUTO KẾT THÚC · Chờ bóng và HIVE dừng để chốt điểm"); }
    else if (this.phase === "settling") {
      const moving = Object.values(this.hives).some(h => h.tipping > 0) || this.balls.some(ball => {
        if (ball.status !== "field") return false;
        const velocity = this.bodies.get(ball.id)?.linvel();
        return velocity && Math.hypot(velocity.x, velocity.y, velocity.z) > 0.06;
      });
      if (moving && this.settlingElapsed < 12) this.remaining = 0.25;
      else this.finish();
    }
  }
  finish() {
    if (this.settled) return;
    this.assessMovement();
    this.phase = "ended"; this.remaining = 0; this.paused = true; this.settled = true;
    this.updateScore(); this.note("KẾT THÚC AUTO · Đã chốt điểm HIVE, LEAVE và AUTO PARK"); this.emit();
  }
  updateScore() {
    for (const team of ["red", "blue"] as const) this.score[team] = this.earned[team] + this.movement[team] + this.penalties[team];
  }
  tick(dt: number) {
    if (this.paused || this.phase === "ready" || this.phase === "ended") return;
    this.elapsed += dt;
    this.syncRobotPoses();
    if (this.phase === "settling") this.settlingElapsed += dt;
    this.remaining -= dt; if (this.remaining <= 0) this.advance();
    if (this.phase === "auto") for (const team of ["red", "blue"] as const) if (this.nectarAvailable(team) > 0) this.feed(team, true);
    for (const robot of this.robots) {
      if (this.phase === "auto" && Math.abs(robot.position.x) < HALF - 0.23 && Math.abs(robot.position.z) < HALF - 0.23) robot.left = true;
      if (this.phase !== "auto") { robot.intake = false; robot.task = "idle"; this.drive(robot, 0, 0, 0, dt, 0); continue; }
      this.bot(robot, dt);
      const velocity = this.shotVelocity(robot);
      const target = this.targetPosition(robot);
      robot.turret = Math.atan2(target.x - robot.position.x, target.z - robot.position.z) - robot.heading;
      if (velocity) robot.hood = Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z));
      if (robot.id === this.controlled) this.aimValid = !!velocity && !this.hives[robot.team].tipping;
    }
    for (const hive of Object.values(this.hives)) if (hive.tipping > 0) {
      hive.tipping = Math.max(0, hive.tipping - dt / 0.9);
      const progress = 1 - hive.tipping;
      const smooth = progress * progress * (3 - 2 * progress);
      hive.angle = (-hive.side + (hive.side - hive.nextSide) * smooth) * Math.PI / 6;
      if (hive.tipping === 0) { hive.side = hive.nextSide; hive.angle = -hive.side * Math.PI / 6; }
    }
    for (const ball of this.balls) {
      if (ball.status !== "field") continue;
      const body = this.bodies.get(ball.id);
      if (!body) continue;
      ball.previous = ball.position; ball.position = { ...body.translation() };
      if (ball.position.y < radius(ball.kind) + 0.025) { ball.mustTouchFloor = false; ball.flight = undefined; }
      if (ball.position.y < -0.3 || Math.abs(ball.position.x) > HALF + 0.3 || Math.abs(ball.position.z) > HALF + 0.3) {
        // Out-of-bounds elements return through a loading zone, never duplicate.
        const team = ball.kind === "pollen" ? (ball.position.x < 0 ? "red" : "blue") : ball.kind;
        this.spawn(ball, { x: team === "red" ? -1.72 : 1.72, y: 0.08, z: team === "red" ? -0.9 : 0.9 });
        continue;
      }
      const fi = FLOWERS.findIndex((f, index) => {
        const height = this.flowers[index].stack.reduce((n, id) => n + radius(this.ball(id).kind) * 2, 0.09);
        return height + radius(ball.kind) * 2 <= 0.56 && dist(f, ball.position) < 0.055 && ball.previous.y >= 0.546 && ball.position.y < 0.546;
      });
      if (fi >= 0) { this.scoreFlower(ball, fi); continue; }
      if (ball.launchedBy === null) continue;
      // A score is an actual aperture crossing; pressing shoot never adds points.
      for (const hive of Object.values(this.hives)) {
        if (hive.tipping || this.elapsed - ball.releasedAt < 0.1) continue;
        const target = hiveTarget(hive), angle = -hive.side * Math.PI / 6;
        const normal = { y: -hive.side * Math.sin(angle), z: hive.side * Math.cos(angle) };
        const signed = (p: Vec) => (p.y - target.y) * normal.y + (p.z - target.z) * normal.z;
        const before = signed(ball.previous), after = signed(ball.position);
        if (before > 0 && after <= 0) {
          const t = before / (before - after);
          const x = ball.previous.x + (ball.position.x - ball.previous.x) * t;
          const y = ball.previous.y + (ball.position.y - ball.previous.y) * t;
          const z = ball.previous.z + (ball.position.z - ball.previous.z) * t;
          const vertical = (y - target.y) * Math.cos(angle) + (z - target.z) * Math.sin(angle);
          if (Math.abs(x - target.x) < 0.254 - radius(ball.kind) * 0.3 && Math.abs(vertical) < 0.178 - radius(ball.kind) * 0.3) {
            this.hide(ball, "hive"); hive.load.push(ball.id); this.robots[ball.launchedBy].hits++;
            const weight = hive.load.reduce((n, id) => n + (this.ball(id).kind === "pollen" ? 1 : 1.5), 0);
            if (weight >= this.config.tipLoad) this.tip(hive);
            break;
          }
        }
      }
    }
    this.updateScore();
    if (this.elapsed - this.lastEmit >= 0.1) {
      this.lastEmit = this.elapsed; this.history.push(this.robot.speed); this.history = this.history.slice(-80); this.emit();
    }
  }
}
