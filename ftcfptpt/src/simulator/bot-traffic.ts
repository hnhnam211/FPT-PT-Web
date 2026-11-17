import { navigable, segmentClear, type Point } from "./bot-navigation.ts";

export type TrafficRobot = { id: number; position: Point; velocity: Point; heading: number };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Test the chassis rectangles, including their headings, rather than their centers.
// Candidate velocities predict the wheel controller's acceleration over the next 0.8s.
export function avoidTraffic(self: TrafficRobot, desired: Point, neighbors: TrafficRobot[], side: number, goal?: Point): Point {
  if (!navigable(self.position)) return desired;
  const nearby = neighbors.filter(r => Math.hypot(r.position.x - self.position.x, r.position.z - self.position.z) < 2);
  if (!nearby.length) return desired;
  const axes = nearby.map(other => {
    const angles = [self.heading, other.heading];
    const directions = angles.flatMap(h => [{ x: Math.cos(h), z: -Math.sin(h) }, { x: Math.sin(h), z: Math.cos(h) }]);
    const extent = (axis: Point, h: number) => .2 * Math.abs(axis.x * Math.cos(h) - axis.z * Math.sin(h)) + .21 * Math.abs(axis.x * Math.sin(h) + axis.z * Math.cos(h));
    return { other, directions: directions.map(axis => ({ ...axis, radius: extent(axis, self.heading) + extent(axis, other.heading) })) };
  });
  const wantedSpeed = Math.hypot(desired.x, desired.z), speed = Math.max(.45, wantedSpeed);
  const heading = wantedSpeed > .01 ? Math.atan2(desired.z, desired.x) : Math.atan2(self.position.z - nearby[0].position.z, self.position.x - nearby[0].position.x);
  const candidates: Point[] = [desired, { x: 0, z: 0 }];
  for (const angle of [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2, Math.PI])
    for (const factor of [1, .45]) candidates.push({ x: Math.cos(heading + angle) * speed * factor, z: Math.sin(heading + angle) * speed * factor });
  let best = { x: 0, z: 0 }, bestCost = Infinity;
  for (let index = 0; index < candidates.length; index++) {
    const v = candidates[index];
    let cost = (v.x - desired.x) ** 2 + (v.z - desired.z) ** 2;
    cost += .06 * ((v.x - self.velocity.x) ** 2 + (v.z - self.velocity.z) ** 2);
    // A common passing side breaks symmetric head-on deadlocks.
    if (index > 1 && (desired.x * v.z - desired.z * v.x) < -.01) cost += .025;
    let valid = true;
    for (const t of [.1, .2, .35, .5, .65, .8]) {
      const response = .08 * (1 - Math.exp(-t / .08));
      const towardGoal = goal && v.x * desired.x + v.z * desired.z > .9 * Math.hypot(v.x, v.z) * wantedSpeed;
      const travel = towardGoal ? Math.min(t, Math.hypot(goal!.x - self.position.x, goal!.z - self.position.z) / Math.max(.01, Math.hypot(v.x, v.z))) : t;
      const p = { x: self.position.x + v.x * travel + (self.velocity.x - v.x) * response,
        z: self.position.z + v.z * travel + (self.velocity.z - v.z) * response };
      if (p.x * side < .32 || p.x * side > Math.max(1.52, self.position.x * side) + .005 ||
          Math.abs(p.z) > Math.max(1.52, Math.abs(self.position.z)) + .005 || !segmentClear(self.position, p)) { valid = false; break; }
      for (const { other, directions } of axes) {
        const dx = p.x - other.position.x - other.velocity.x * t, dz = p.z - other.position.z - other.velocity.z * t;
        const gap = Math.max(...directions.map(axis => Math.abs(dx * axis.x + dz * axis.z) - axis.radius));
        cost += 1600 * Math.max(0, .04 - gap) ** 2 / 6;
        cost += (self.id > other.id ? 4 : 2) * Math.max(0, .13 - gap) ** 2 / 6;
      }
    }
    if (valid && cost < bestCost) { bestCost = cost; best = v; }
  }
  return { x: clamp(best.x, -2.8, 2.8), z: clamp(best.z, -2.8, 2.8) };
}
