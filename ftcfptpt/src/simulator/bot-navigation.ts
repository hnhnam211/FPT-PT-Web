export type Point = { x: number; z: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const safePoint = (p: Point, side: number): Point => ({
  x: side * clamp(p.x * side, 0.33, 1.49), z: clamp(p.z, -1.49, 1.49),
});
export function navigable(p: Point): boolean {
  return Math.abs(p.x) >= 0.97 || Math.abs(p.z) >= 0.9;
}
export function segmentClear(a: Point, b: Point): boolean {
  // Inflate the A-frame footprint by chassis clearance. All routes remain on their own half.
  let enter = 0, leave = 1;
  for (const [start, delta, low, high] of [[a.x, b.x - a.x, -.95, .95], [a.z, b.z - a.z, -.85, .85]]) {
    if (Math.abs(delta) < 1e-9) { if (start < low || start > high) return true; }
    else {
      const p = (low - start) / delta, q = (high - start) / delta;
      enter = Math.max(enter, Math.min(p, q)); leave = Math.min(leave, Math.max(p, q));
      if (enter > leave) return true;
    }
  }
  return leave < 0 || enter > 1;
}
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  const t = length ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / length, 0, 1) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
export function planPath(start: Point, goal: Point, side: number, neighbors: Point[] = [], clearance = .56): Point[] {
  const nodes: Point[] = [{ ...start }, { ...goal }];
  for (const x of [.42, .74, 1.08, 1.47]) for (const z of [-1.44, -1.08, 1.08, 1.44]) nodes.push({ x: side * x, z });
  for (const other of neighbors) for (const dx of [-clearance, clearance]) for (const dz of [-clearance, clearance]) {
    const p = safePoint({ x: other.x + dx, z: other.z + dz }, side);
    if (navigable(p)) nodes.push(p);
  }
  const cost = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>();
  cost[0] = 0;
  for (let step = 0; step < nodes.length; step++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || cost[i] < cost[current])) current = i;
    if (current < 0 || !Number.isFinite(cost[current])) break;
    if (current === 1) {
      const path: Point[] = []; let cursor = 1;
      while (cursor > 0) { path.unshift(nodes[cursor]); cursor = previous[cursor]; }
      return path;
    }
    visited.add(current);
    for (let next = 1; next < nodes.length; next++) {
      if (visited.has(next) || !segmentClear(nodes[current], nodes[next])) continue;
      let penalty = 0;
      for (const other of neighbors) penalty += Math.max(0, clearance - segmentDistance(other, nodes[current], nodes[next])) * 5;
      const candidate = cost[current] + distance(nodes[current], nodes[next]) + penalty;
      if (candidate < cost[next]) { cost[next] = candidate; previous[next] = current; }
    }
  }
  // Escape vertically if a contact moved the chassis inside the inflated footprint.
  const exit = { x: start.x, z: (start.z < 0 ? -1 : 1) * 1.08 };
  return navigable(start) ? [] : [exit, ...planPath(exit, goal, side, neighbors, clearance)];
}
