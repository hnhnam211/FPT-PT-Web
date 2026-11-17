import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAfterPhysicsStep } from "@react-three/rapier";
import * as THREE from "three";
import { Game, type Vec } from "./game";

const ARC_SEGMENTS = 128;
const TRAIL_SAMPLES = 64;
const TRAIL_CAPACITY = 56 * (TRAIL_SAMPLES - 1);
const UP = new THREE.Vector3(0, 1, 0);
const YELLOW = "#ffe76b";
type Sample = { position: Vec; at: number };
type Trace = { shot: number; samples: Sample[]; active: boolean; lastActive: number; team: "red" | "blue" };

// Instanced tubes keep their thickness in 3D and add just four draws for all paths.
// Sampling uses fixed physics steps, so a slower render frame does not skip the arc.
export default function ShotPaths({ game }: { game: Game }) {
  const root = useRef<THREE.Group>(null), preview = useRef<THREE.Group>(null);
  const arcCore = useRef<THREE.InstancedMesh>(null), arcHalo = useRef<THREE.InstancedMesh>(null);
  const trailCore = useRef<THREE.InstancedMesh>(null), trailHalo = useRef<THREE.InstancedMesh>(null);
  const arrow = useRef<THREE.Mesh>(null), dot = useRef<THREE.Mesh>(null), targetRing = useRef<THREE.Mesh>(null);
  const traces = useMemo(() => new Map<string, Trace>(), [game]);
  const colors = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(TRAIL_CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage), []);
  const scratch = useMemo(() => ({ transform: new THREE.Object3D(), direction: new THREE.Vector3(), color: new THREE.Color(),
    arc: Array.from({ length: ARC_SEGMENTS + 1 }, () => new THREE.Vector3()) }), []);

  useAfterPhysicsStep(() => {
    for (const ball of game.balls) {
      let trace = traces.get(ball.id);
      const active = ball.status === "field" && ball.launchedBy !== null && (!!ball.flight || ball.deliveryFlower !== undefined);
      if (active) {
        const body = game.bodies.get(ball.id);
        if (!body) continue;
        const position = body.translation();
        if (![position.x, position.y, position.z].every(Number.isFinite)) continue;
        if (!trace || trace.shot !== ball.releasedAt) {
          trace = { shot: ball.releasedAt, samples: [{ position: { ...ball.position }, at: game.elapsed - 1 / 60 }],
            active: true, lastActive: game.elapsed, team: game.robots[ball.launchedBy!].team };
          traces.set(ball.id, trace);
        }
        trace.active = true; trace.lastActive = game.elapsed;
        if (game.elapsed - trace.samples[trace.samples.length - 1].at >= .025) {
          trace.samples.push({ position: { ...position }, at: game.elapsed });
          if (trace.samples.length > TRAIL_SAMPLES) trace.samples.shift();
        }
      } else if (trace?.active) {
        // Keep the final impact point; never connect a reused/reloaded ball to its old shot.
        if (trace.shot === ball.releasedAt) trace.samples.push({ position: { ...ball.position }, at: game.elapsed });
        if (trace.samples.length > TRAIL_SAMPLES) trace.samples.shift();
        trace.active = false; trace.lastActive = game.elapsed;
      }
    }
  });

  const segment = (mesh: THREE.InstancedMesh, index: number, a: Vec, b: Vec, radius: number) => {
    const { transform, direction } = scratch;
    direction.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const length = direction.length();
    transform.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    transform.quaternion.setFromUnitVectors(UP, direction.multiplyScalar(1 / Math.max(length, .000001)));
    transform.scale.set(radius, Math.max(length, .00001), radius); transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  };
  useFrame(() => {
    if (!root.current || !preview.current || !arcCore.current || !arcHalo.current || !trailCore.current || !trailHalo.current) return;
    root.current.visible = game.config.trajectory;
    if (!game.config.trajectory) return;
    let trailCount = 0;
    for (const [id, trace] of traces) {
      const fade = trace.active ? 1 : Math.max(0, 1 - (game.elapsed - trace.lastActive) / .85);
      if (fade <= 0) { traces.delete(id); continue; }
      scratch.color.set(trace.team === "red" ? "#ff7186" : "#66dcff");
      for (let i = 1; i < trace.samples.length && trailCount < TRAIL_CAPACITY; i++) {
        const previous = trace.samples[i - 1], current = trace.samples[i];
        const ageFade = Math.max(0, 1 - (game.elapsed - previous.at) / 2.2);
        if (ageFade < .05) continue;
        const width = fade * (.45 + ageFade * .55);
        segment(trailCore.current, trailCount, previous.position, current.position, .0055 * width);
        segment(trailHalo.current, trailCount, previous.position, current.position, .014 * width);
        trailCore.current.setColorAt(trailCount, scratch.color); trailCount++;
      }
    }
    trailCore.current.count = trailHalo.current.count = trailCount;
    trailCore.current.instanceMatrix.needsUpdate = trailHalo.current.instanceMatrix.needsUpdate = true;
    colors.needsUpdate = true;

    const shot = game.shotPreview();
    preview.current.visible = !!shot && game.aimValid && (game.activePlay || game.phase === "settling");
    if (!shot || !preview.current.visible) return;
    const points = scratch.arc, p = { ...shot.from }, v = { ...shot.velocity };
    points[0].copy(p); let count = 1;
    // Same barrel offset as fire(), followed by a 60Hz free-flight prediction.
    p.x += v.x * .045; p.y += v.y * .045 - 4.905 * .045 ** 2; p.z += v.z * .045; v.y -= 9.81 * .045;
    points[count++].copy(p);
    const signed = (position: Vec) => (position.y - shot.target.y) * .5 + (position.z - shot.target.z) * shot.side * Math.sqrt(.75);
    for (let i = 0; count <= ARC_SEGMENTS; i++) {
      const last = points[count - 1], before = signed(last), drag = 1 / (1 + .01 / 60);
      v.x *= drag; v.y = (v.y - 9.81 / 60) * drag; v.z *= drag;
      p.x += v.x / 60; p.y += v.y / 60; p.z += v.z / 60;
      points[count].set(p.x, Math.max(.02, p.y), p.z);
      const after = signed(points[count]);
      if (i > 5 && before > 0 && after <= 0) {
        points[count].lerpVectors(last, points[count], before / (before - after)); count++; break;
      }
      count++;
      if (p.y <= .02) break;
    }
    for (let i = 0; i < count - 1; i++) {
      segment(arcCore.current, i, points[i], points[i + 1], .007);
      segment(arcHalo.current, i, points[i], points[i + 1], .019);
    }
    arcCore.current.count = arcHalo.current.count = count - 1;
    arcCore.current.instanceMatrix.needsUpdate = arcHalo.current.instanceMatrix.needsUpdate = true;
    const end = points[count - 1], direction = scratch.direction.subVectors(end, points[count - 2]).normalize();
    if (arrow.current) {
      arrow.current.position.copy(end).addScaledVector(direction, -.04);
      arrow.current.quaternion.setFromUnitVectors(UP, direction);
    }
    if (targetRing.current) {
      targetRing.current.position.copy(end);
      targetRing.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    }
    if (dot.current) {
      const progress = (game.elapsed % 1.2) / 1.2 * (count - 1), index = Math.floor(progress);
      dot.current.position.lerpVectors(points[index], points[Math.min(index + 1, count - 1)], progress - index);
    }
  });
  const dynamic = (mesh: THREE.InstancedMesh) => mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return <group ref={root}>
    <instancedMesh ref={trailHalo} args={[undefined, undefined, TRAIL_CAPACITY]} instanceColor={colors} count={0} onUpdate={dynamic} frustumCulled={false} renderOrder={31}>
      <cylinderGeometry args={[1, 1, 1, 6, 1, true]} /><meshBasicMaterial transparent opacity={.18} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
    </instancedMesh>
    <instancedMesh ref={trailCore} args={[undefined, undefined, TRAIL_CAPACITY]} instanceColor={colors} count={0} onUpdate={dynamic} frustumCulled={false} renderOrder={32}>
      <cylinderGeometry args={[1, 1, 1, 6, 1, true]} /><meshBasicMaterial transparent opacity={.95} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
    </instancedMesh>
    <group ref={preview}>
      <instancedMesh ref={arcHalo} args={[undefined, undefined, ARC_SEGMENTS]} count={0} onUpdate={dynamic} frustumCulled={false} renderOrder={33}>
        <cylinderGeometry args={[1, 1, 1, 6, 1, true]} /><meshBasicMaterial color={YELLOW} transparent opacity={.2} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
      </instancedMesh>
      <instancedMesh ref={arcCore} args={[undefined, undefined, ARC_SEGMENTS]} count={0} onUpdate={dynamic} frustumCulled={false} renderOrder={34}>
        <cylinderGeometry args={[1, 1, 1, 6, 1, true]} /><meshBasicMaterial color={YELLOW} transparent opacity={.95} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
      </instancedMesh>
      <mesh ref={arrow} renderOrder={35}><coneGeometry args={[.026, .08, 12]} /><meshBasicMaterial color={YELLOW} depthTest={false} depthWrite={false} toneMapped={false} fog={false} /></mesh>
      <mesh ref={targetRing} renderOrder={35}><torusGeometry args={[.055, .005, 6, 24]} /><meshBasicMaterial color={YELLOW} depthTest={false} depthWrite={false} toneMapped={false} fog={false} /></mesh>
      <mesh ref={dot} renderOrder={35}><sphereGeometry args={[.021, 10, 8]} /><meshBasicMaterial color="#fffbe2" depthTest={false} depthWrite={false} toneMapped={false} fog={false} /></mesh>
    </group>
  </group>;
}
