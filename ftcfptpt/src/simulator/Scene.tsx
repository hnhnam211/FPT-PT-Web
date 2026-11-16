import { memo, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { BallCollider, CuboidCollider, Physics, RigidBody, useAfterPhysicsStep, useBeforePhysicsStep } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { COLORS, FIELD, FLOWERS, Game, HALF, ROBOT_HALF, hiveTarget, radius } from "./game";
import type { Ball, Hive, Robot, Team, Vec } from "./game";

export type CameraMode = "follow" | "overhead" | "orbit" | "driver";
export type CameraInfo = { visible: boolean; distance: number; yaw: number; tag: string };
export const useGame = (game: Game) => useSyncExternalStore(game.subscribe, game.getSnapshot, game.getSnapshot);

function Box({ position = [0, 0, 0], size, color = "#88939d", ...props }: {
  position?: [number, number, number]; size: [number, number, number]; color?: string;
  rotation?: [number, number, number]; metal?: boolean; transparent?: boolean; opacity?: number;
}) {
  return <mesh position={position} rotation={props.rotation} castShadow receiveShadow>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} metalness={props.metal ? 0.65 : 0.12} roughness={props.metal ? 0.4 : 0.8}
      transparent={props.transparent} opacity={props.opacity ?? 1} depthWrite={!props.transparent} />
  </mesh>;
}
function Beam({ from, to, width = 0.025, color = "#b2bbc1" }: { from: number[]; to: number[]; width?: number; color?: string }) {
  const { midpoint, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    return { midpoint: a.clone().add(b).multiplyScalar(0.5), length: direction.length(),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()) };
  }, [from.join(), to.join()]);
  return <mesh position={midpoint} quaternion={quaternion} castShadow receiveShadow>
    <boxGeometry args={[width, length, width]} /><meshStandardMaterial color={color} metalness={0.65} roughness={0.4} />
  </mesh>;
}
function Ring({ y, radius: r = 0.06, color = "#d1c78a" }: { y: number; radius?: number; color?: string }) {
  return <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
    <torusGeometry args={[r, 0.008, 6, 20]} /><meshStandardMaterial color={color} metalness={0.25} roughness={0.65} />
  </mesh>;
}
function makeFloor() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1536;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#969da3"; c.fillRect(0, 0, 1536, 1536);
  // Repeatable stipple and interlocking seams, generated locally without assets.
  let seed = 74;
  for (let i = 0; i < 45000; i++) {
    seed = (seed * 16807) % 2147483647; const x = seed % 1536;
    seed = (seed * 16807) % 2147483647; const y = seed % 1536;
    c.fillStyle = i % 2 ? "#8e959b" : "#a3a9ae"; c.fillRect(x, y, 1.5, 1.5);
  }
  c.strokeStyle = "#727c83"; c.lineWidth = 1.6;
  for (let i = 1; i < 6; i++) for (const horizontal of [true, false]) {
    c.beginPath();
    for (let k = 0; k <= 192; k++) {
      const a = k * 8, b = i * 256 + (k % 4 === 1 || k % 4 === 2 ? 3 : 0);
      if (k === 0) c.moveTo(horizontal ? a : b, horizontal ? b : a);
      else c.lineTo(horizontal ? a : b, horizontal ? b : a);
    }
    c.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; return texture;
}
function Floor() {
  const texture = useMemo(makeFloor, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <>
    <RigidBody type="fixed" colliders={false} friction={0.9}><CuboidCollider args={[HALF + 0.4, 0.04, HALF + 0.4]} position={[0, -0.04, 0]} /></RigidBody>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[FIELD, FIELD]} /><meshStandardMaterial map={texture} roughness={0.95} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow><planeGeometry args={[50, 50]} /><meshStandardMaterial color="#56616c" roughness={1} /></mesh>
    {[0, 1, 2, 3].map(side => <group key={side} rotation={[0, side * Math.PI / 2, 0]}>
      <RigidBody type="fixed" colliders={false}><CuboidCollider position={[0, 0.14, -HALF - 0.012]} args={[HALF + 0.025, 0.14, 0.012]} /></RigidBody>
      <Box position={[0, 0.14, -HALF - 0.012]} size={[FIELD + 0.05, 0.27, 0.012]} color="#a6bac5" transparent opacity={0.12} />
      {[0.018, 0.28].map(y => <Box key={y} position={[0, y, -HALF]} size={[FIELD + 0.06, 0.022, 0.025]} color="#232d35" metal />)}
      {Array.from({ length: 7 }, (_, i) => <Box key={i} position={[-HALF + i * FIELD / 6, 0.15, -HALF]} size={[0.018, 0.28, 0.025]} color="#303c43" metal />)}
    </group>)}
    <Zone team="red" /><Zone team="blue" />
    <Spectators />
  </>;
}
function Zone({ team }: { team: Team }) {
  const sign = team === "red" ? -1 : 1, color = COLORS[team];
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[sign * (HALF - 0.14), 0.002, sign * 0.9271]}>
      <planeGeometry args={[0.2795, 0.584]} /><meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} />
    </mesh>
    <Box position={[sign * (HALF - 0.2795), 0.004, sign * 0.9271]} size={[0.018, 0.003, 0.584]} color={color} />
    {[-0.292, 0.292].map(offset => <Box key={offset} position={[sign * (HALF - 0.14), 0.004, sign * 0.9271 + offset]} size={[0.2795, 0.003, 0.018]} color={color} />)}
    <Box position={[sign * (HALF - 0.292), 0.004, -sign * (HALF - 0.0255)]} size={[0.584, 0.003, 0.051]} color={color} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[sign * (HALF + 0.8), -0.076, 0]}>
      <planeGeometry args={[1.3715, 2.464]} /><meshBasicMaterial color={color} transparent opacity={0.1} />
    </mesh>
  </>;
}
function Spectators() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!mesh.current) return;
    const m = new THREE.Object3D(), color = new THREE.Color();
    let index = 0;
    for (const side of [-1, 1]) for (let row = 0; row < 4; row++) for (let seat = 0; seat < 38; seat++) {
      m.position.set(-4 + seat * 0.215, 0.12 + row * 0.21, side * (4 + row * 0.28));
      m.updateMatrix(); mesh.current.setMatrixAt(index, m.matrix);
      color.set(["#2d3c47", "#dbaf43", "#355c88", "#a74548", "#394c5a"][(seat * 7 + row * 3) % 5]);
      mesh.current.setColorAt(index++, color);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, []);
  return <group>
    {[-1, 1].map(side => <group key={side}>{Array.from({ length: 4 }, (_, row) =>
      <Box key={row} position={[0, row * 0.21, side * (4 + row * 0.28)]} size={[8.4, 0.15, 0.3]} color="#253039" />)}</group>)}
    <instancedMesh ref={mesh} args={[undefined, undefined, 304]}><boxGeometry args={[0.13, 0.16, 0.12]} /><meshStandardMaterial roughness={0.9} /></instancedMesh>
  </group>;
}
function FlowerModel({ game, index }: { game: Game; index: number }) {
  useGame(game);
  const flower = FLOWERS[index], stack = game.flowers[index].stack;
  let y = 0.09;
  return <group position={[flower.x, 0, flower.z]}>
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[0.085, 0.012, 0.085]} position={[0, 0.01, 0]} />
      {Array.from({ length: 4 }, (_, i) => {
        const a = Math.PI / 4 + i * Math.PI / 2;
        return <CuboidCollider key={i} args={[0.006, 0.225, 0.006]} position={[Math.cos(a) * 0.062, 0.32, Math.sin(a) * 0.062]} />;
      })}
    </RigidBody>
    <Box position={[0, 0.01, 0]} size={[0.2, 0.02, 0.2]} color="#343f45" />
    <Ring y={0.025} radius={0.044} /><Ring y={0.09} /><Ring y={0.546} />
    {Array.from({ length: 4 }, (_, i) => {
      const a = Math.PI / 4 + i * Math.PI / 2;
      return <Beam key={i} from={[Math.cos(a) * 0.062, 0.09, Math.sin(a) * 0.062]} to={[Math.cos(a) * 0.062, 0.546, Math.sin(a) * 0.062]} width={0.01} color="#70ae63" />;
    })}
    <mesh position={[0, 0.572, -0.045]} rotation={[Math.PI / 3, 0, 0]}><torusGeometry args={[0.064, 0.006, 5, 16, Math.PI]} /><meshStandardMaterial color="#b99fd6" /></mesh>
    {stack.map(id => {
      const ball = game.ball(id), r = radius(ball.kind); y += r;
      const at = y; y += r;
      return <mesh key={id} position={[0, at, 0]} castShadow><sphereGeometry args={[r, 16, 12]} /><meshStandardMaterial color={COLORS[ball.kind]} roughness={0.55} /></mesh>;
    })}
  </group>;
}
function Frame() {
  return <RigidBody type="fixed" colliders="cuboid">
    {[-0.62825, 0.62825].map(x => <group key={x}>
      <Beam from={[x, 0.01, -0.49475]} to={[x, 1.1165, 0]} width={0.035} />
      <Beam from={[x, 0.01, 0.49475]} to={[x, 1.1165, 0]} width={0.035} />
      <Beam from={[x, 0.025, -0.49475]} to={[x, 0.025, 0.49475]} width={0.028} color="#333d45" />
    </group>)}
    <Beam from={[-0.65, 1.1165, 0]} to={[0.65, 1.1165, 0]} width={0.04} />
    <Box position={[0, 0.98, 0]} size={[0.37, 0.12, 0.02]} color="#d5ce8f" />
  </RigidBody>;
}
function markerTexture(id: number) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 100;
  const c = canvas.getContext("2d")!; c.fillStyle = "white"; c.fillRect(0, 0, 100, 100);
  c.fillStyle = "#111"; c.fillRect(10, 10, 80, 80);
  // Visual navigation fiducial only. Camera telemetry uses scene geometry, not CV.
  let seed = id * 997 + 13;
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
    seed = (seed * 16807) % 2147483647;
    if (seed % 2) { c.fillStyle = "white"; c.fillRect(20 + x * 10, 20 + y * 10, 10, 10); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.magFilter = THREE.NearestFilter; texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function Marker({ id, position, rotation }: { id: number; position: [number, number, number]; rotation?: [number, number, number] }) {
  const texture = useMemo(() => markerTexture(id), [id]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position} rotation={rotation}><planeGeometry args={[0.0825, 0.0825]} /><meshBasicMaterial map={texture} side={THREE.DoubleSide} /></mesh>;
}
function HiveModel({ game, team }: { game: Game; team: Team }) {
  useGame(game);
  const ref = useRef<RapierRigidBody>(null), hive = game.hives[team];
  const initialAngle = useRef(hive.angle).current;
  const q = useMemo(() => new THREE.Quaternion(), []);
  useBeforePhysicsStep(() => {
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), hive.angle);
    ref.current?.setNextKinematicRotation(q);
  });
  return <RigidBody ref={ref} type="kinematicPosition" colliders={false} position={[team === "red" ? -0.32385 : 0.32385, 1.1165, 0]} rotation={[initialAngle, 0, 0]}>
    <Box size={[0.045, 0.035, 0.8]} color="#7b858d" metal />
    {[-1, 1].map(side => <group key={side} position={[0, 0, side * 0.3915]}>
      <CuboidCollider args={[0.254, 0.008, 0.1525]} position={[0, -0.178, 0]} />
      <CuboidCollider args={[0.254, 0.178, 0.005]} position={[0, 0, -side * 0.1525]} />
      {[-1, 1].map(s => <CuboidCollider key={s} args={[0.006, 0.178, 0.1525]} position={[s * 0.254, 0, 0]} />)}
      <Box position={[0, -0.178, 0]} size={[0.508, 0.009, 0.305]} color="#c9d4d9" transparent opacity={0.5} />
      <Box position={[0, 0, -side * 0.1525]} size={[0.508, 0.356, 0.008]} color="#bed0d5" transparent opacity={0.32} />
      {[-1, 1].map(s => <group key={s}>
        <Box position={[s * 0.254, 0, 0]} size={[0.008, 0.356, 0.305]} color="#bbd2db" transparent opacity={0.22} />
        <Box position={[s * 0.254, 0, side * 0.1525]} size={[0.015, 0.37, 0.015]} color={COLORS[team]} />
        <Box position={[0, s * 0.178, side * 0.1525]} size={[0.52, 0.015, 0.015]} color={COLORS[team]} />
      </group>)}
      {[0, 1, 2, 3].map(i => <Marker key={i} id={(team === "red" ? side === 1 ? 34 : 30 : side === 1 ? 38 : 42) + i}
        position={[-0.15 + i * 0.1, -0.184, 0]} rotation={[Math.PI / 2, 0, 0]} />)}
      {side === hive.side && hive.load.map((id, i) => <mesh key={id} position={[-0.18 + i % 5 * 0.085, -0.12 + Math.floor(i / 5) * 0.075, -side * 0.06]} castShadow>
        <sphereGeometry args={[radius(game.ball(id).kind), 16, 12]} /><meshStandardMaterial color={COLORS[game.ball(id).kind]} roughness={0.5} />
      </mesh>)}
    </group>)}
  </RigidBody>;
}
function RobotModel({ game, robot }: { game: Game; robot: Robot }) {
  useGame(game);
  const turret = useRef<THREE.Group>(null), barrel = useRef<THREE.Group>(null), roller = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (turret.current) turret.current.rotation.y = robot.turret;
    if (barrel.current) barrel.current.rotation.x = -robot.hood;
    if (roller.current && robot.intake && !game.paused) roller.current.rotation.x += dt * 20;
  });
  return <group>
    <Box position={[0, -0.035, 0]} size={[0.39, 0.06, 0.41]} color="#3c444c" metal />
    {[-1, 1].map(x => <group key={x}>
      {[-1, 1].map(z => <group key={z} position={[x * 0.19, -0.065, z * 0.143]} rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow><cylinderGeometry args={[0.058, 0.058, 0.045, 16]} /><meshStandardMaterial color="#1c242b" roughness={0.95} /></mesh>
        {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[Math.sin(i * Math.PI / 4) * 0.052, 0, Math.cos(i * Math.PI / 4) * 0.052]} rotation={[0, i * Math.PI / 4, Math.PI / 4]}>
          <cylinderGeometry args={[0.013, 0.013, 0.044, 6]} /><meshStandardMaterial color="#83909b" metalness={0.5} roughness={0.45} />
        </mesh>)}
      </group>)}
      <Box position={[x * 0.17, 0.105, -0.13]} size={[0.022, 0.27, 0.024]} color="#a8b2ba" metal />
      <Box position={[x * 0.17, 0.1, 0.12]} size={[0.022, 0.26, 0.024]} color="#a8b2ba" metal />
      <Box position={[x * 0.184, 0.065, -0.02]} size={[0.008, 0.14, 0.24]} color={robot.team === "red" ? "#703b43" : "#2d4e73"} />
      <Box position={[x * 0.17, 0.23, -0.005]} size={[0.026, 0.02, 0.3]} color={COLORS[robot.team]} />
    </group>)}
    <Box position={[0, 0.09, -0.16]} size={[0.3, 0.17, 0.016]} color="#4a565f" metal />
    <Box position={[0.07, 0.02, -0.04]} size={[0.1, 0.06, 0.14]} color="#d8bf62" />
    <mesh ref={roller} position={[0, -0.045, 0.205]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.036, 0.036, 0.29, 14]} /><meshStandardMaterial color={robot.intake ? "#ddbb53" : "#3f5360"} />
    </mesh>
    <group ref={turret} position={[0, 0.23, 0]}>
      <mesh><cylinderGeometry args={[0.105, 0.115, 0.025, 20]} /><meshStandardMaterial color="#39454f" metalness={0.6} roughness={0.5} /></mesh>
      <group ref={barrel}>
        <Box position={[0, 0.02, 0.065]} size={[0.17, 0.1, 0.2]} color="#29353e" metal />
        <Box position={[0, 0.025, 0.17]} size={[0.105, 0.065, 0.015]} color="#131c23" />
        {[-1, 1].map(x => <Box key={x} position={[x * 0.085, 0.035, 0.055]} size={[0.018, 0.12, 0.18]} color="#80909a" metal />)}
      </group>
    </group>
    {robot.inventory.map((id, i) => <mesh key={id} position={[-0.085 + i % 2 * 0.105, 0.02 + Math.floor(i / 2) * 0.075, 0.035]} castShadow>
      <sphereGeometry args={[radius(game.ball(id).kind), 14, 10]} /><meshStandardMaterial color={COLORS[game.ball(id).kind]} roughness={0.5} />
    </mesh>)}
    <Html position={[0, 0.5, 0]} center zIndexRange={[3, 0]} distanceFactor={5} style={{ pointerEvents: "none" }}>
      <div className={`sim-robot-tag ${robot.team} ${robot.id === game.controlled ? "selected" : ""}`}>{robot.number}</div>
    </Html>
    {robot.id === game.controlled && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.124, 0]}>
      <ringGeometry args={[0.29, 0.296, 48]} /><meshBasicMaterial color="#f4cc36" side={THREE.DoubleSide} />
    </mesh>}
  </group>;
}
function RobotBody({ game, robot }: { game: Game; robot: Robot }) {
  const initial = useRef({ position: [robot.position.x, robot.position.y, robot.position.z] as [number, number, number], heading: robot.heading }).current;
  const register = useCallback((body: RapierRigidBody | null) => {
    if (body) game.bodies.set(`robot-${robot.id}`, body); else game.bodies.delete(`robot-${robot.id}`);
  }, [game, robot.id]);
  return <RigidBody ref={register} position={initial.position}
    rotation={[0, initial.heading, 0]} colliders={false} enabledRotations={[false, true, false]}
    ccd additionalSolverIterations={4} linearDamping={0.5} angularDamping={10} canSleep={false}>
    <CuboidCollider args={[ROBOT_HALF.x, ROBOT_HALF.y, ROBOT_HALF.z]} mass={15} friction={0.5} restitution={0.03} />
    <RobotModel game={game} robot={robot} />
  </RigidBody>;
}
function BallBody({ game, ball }: { game: Game; ball: Ball }) {
  const initialPosition = useRef([ball.position.x, ball.position.y, ball.position.z] as [number, number, number]).current;
  const visual = useRef<THREE.Mesh>(null);
  const register = useCallback((body: RapierRigidBody | null) => {
    if (body) { game.bodies.set(ball.id, body); body.setEnabled(ball.status === "field"); } else game.bodies.delete(ball.id);
  }, [game, ball.id]);
  useFrame(() => { if (visual.current) visual.current.visible = ball.status === "field"; });
  return <RigidBody ref={register} position={initialPosition} colliders={false}
    ccd restitution={0.38} friction={0.8} linearDamping={0.01} angularDamping={0.6}>
    <BallCollider args={[radius(ball.kind)]} mass={ball.kind === "pollen" ? 0.015 : 0.0225} />
    <mesh ref={visual} castShadow><sphereGeometry args={[radius(ball.kind), 18, 14]} /><meshStandardMaterial color={COLORS[ball.kind]} roughness={0.5} metalness={0.04} /></mesh>
  </RigidBody>;
}
function Bridge({ game }: { game: Game }) {
  useBeforePhysicsStep(() => game.tick(1 / 60));
  // Repair the physical pose before Rapier updates meshes and the cameras follow it.
  useAfterPhysicsStep(() => game.syncRobotPoses());
  return null;
}
function Trajectory({ game }: { game: Game }) {
  const ref = useRef<THREE.Line>(null);
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(90 * 3), 3));
    const material = new THREE.LineDashedMaterial({ color: "#f4cc36", dashSize: 0.035, gapSize: 0.025, transparent: true, opacity: 0.5 });
    return new THREE.Line(geometry, material);
  }, []);
  useEffect(() => () => { line.geometry.dispose(); (line.material as THREE.Material).dispose(); }, [line]);
  useFrame(() => {
    const robot = game.robot, h = robot.heading + robot.turret;
    line.visible = game.aimValid && game.config.trajectory && !game.paused && game.phase === "auto";
    const data = line.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < 90; i++) {
      const t = i * 0.018;
      data[i * 3] = robot.position.x + Math.sin(h) * game.config.power * Math.cos(robot.hood) * t;
      data[i * 3 + 1] = Math.max(0.02, 0.43 + game.config.power * Math.sin(robot.hood) * t - 4.905 * t * t);
      data[i * 3 + 2] = robot.position.z + Math.cos(h) * game.config.power * Math.cos(robot.hood) * t;
    }
    line.geometry.attributes.position.needsUpdate = true; line.computeLineDistances();
  });
  return <primitive ref={ref} object={line} />;
}
const World = memo(function World({ game }: { game: Game }) {
  return <>
    <Floor /><Frame />
    <HiveModel game={game} team="red" /><HiveModel game={game} team="blue" />
    {FLOWERS.map((_, index) => <FlowerModel key={index} game={game} index={index} />)}
    {game.robots.map(robot => <RobotBody key={robot.id} game={game} robot={robot} />)}
    {game.balls.map(ball => <BallBody key={ball.id} game={game} ball={ball} />)}
    <Trajectory game={game} /><Bridge game={game} />
  </>;
});

function CameraRig({ game, mode, feedRef, hud, onCamera }: {
  game: Game; mode: CameraMode; feedRef: React.RefObject<HTMLDivElement | null>; hud: boolean;
  onCamera: (info: CameraInfo) => void;
}) {
  const { camera } = useThree();
  const onboard = useMemo(() => new THREE.PerspectiveCamera(68, 1.5, 0.02, 40), []);
  const desired = useMemo(() => new THREE.Vector3(), []), look = useMemo(() => new THREE.Vector3(), []);
  const tick = useRef(0), initialized = useRef(false);
  useEffect(() => { initialized.current = false; }, [mode, game.id]);
  useFrame(({ gl, scene, size }, dt) => {
    const robot = game.robot;
    const r = robot.position, heading = robot.heading;
    if (mode !== "orbit") {
      if (mode === "follow") { desired.set(r.x - Math.sin(heading) * 2.8, 2.4, r.z - Math.cos(heading) * 2.8); look.set(r.x * 0.55, 0.65, r.z * 0.4); }
      else if (mode === "overhead") { desired.set(0, 5.5, 0.001); look.set(0, 0, 0); }
      else { desired.set(r.x, 0.49, r.z); look.set(r.x + Math.sin(heading) * 2, 0.7, r.z + Math.cos(heading) * 2); }
      const validCamera = camera.position.toArray().every(Number.isFinite) && camera.position.length() < 12;
      if (!initialized.current || !validCamera) camera.position.copy(desired);
      else camera.position.lerp(desired, 1 - Math.exp(-dt * 5));
      camera.lookAt(look); initialized.current = true;
    }
    const a = robot.heading + robot.turret;
    onboard.position.set(r.x + Math.sin(a) * 0.06, 0.43, r.z + Math.cos(a) * 0.06);
    onboard.lookAt(r.x + Math.sin(a) * 2, 1.1, r.z + Math.cos(a) * 2);
    tick.current += dt;
    if (tick.current > 0.2) {
      tick.current = 0;
      const target = hiveTarget(game.hives[robot.team]);
      const yaw = Math.atan2(target.x - r.x, target.z - r.z) - a;
      const facing = Math.abs(Math.atan2(Math.sin(yaw), Math.cos(yaw)));
      const hive = game.hives[robot.team];
      const base = robot.team === "red" ? hive.side === 1 ? 34 : 30 : hive.side === 1 ? 38 : 42;
      onCamera({ visible: facing < 0.55 && dist3(onboard.position, target) < 3.2 && !hive.tipping,
        distance: dist3(onboard.position, target), yaw: yaw * 180 / Math.PI, tag: `${base}–${base + 3}` });
    }
    gl.setScissorTest(false); gl.setViewport(0, 0, size.width, size.height); gl.autoClear = true;
    gl.render(scene, camera);
    if (hud && feedRef.current) {
      const rect = feedRef.current.getBoundingClientRect(), canvasRect = gl.domElement.getBoundingClientRect();
      const w = rect.width, h = rect.height, x = rect.left - canvasRect.left, y = canvasRect.bottom - rect.bottom;
      if (w > 0 && h > 0) {
        onboard.aspect = w / h; onboard.updateProjectionMatrix();
        gl.setScissor(x, y, w, h); gl.setViewport(x, y, w, h); gl.setScissorTest(true);
        gl.render(scene, onboard); gl.setScissorTest(false); gl.setViewport(0, 0, size.width, size.height);
      }
    }
  }, 1);
  return <OrbitControls enabled={mode === "orbit"} makeDefault target={[0, 0.65, 0]} minDistance={0.5} maxDistance={9} maxPolarAngle={Math.PI / 2 - 0.03} />;
}
const dist3 = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function Scene({ game, mode, feedRef, hud, onCamera }: {
  game: Game; mode: CameraMode; feedRef: React.RefObject<HTMLDivElement | null>; hud: boolean;
  onCamera: (info: CameraInfo) => void;
}) {
  useGame(game);
  return <>
    <color attach="background" args={["#596773"]} /><fog attach="fog" args={["#596773", 7, 22]} />
    <ambientLight intensity={1.4} />
    <hemisphereLight args={["#e4efff", "#64717c", 1.2]} />
    <directionalLight position={[3, 7, 4]} intensity={2.8} castShadow={game.config.quality === "high"}
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3}
      shadow-bias={-0.0003} shadow-normalBias={0.015} />
    <Physics key={game.id} gravity={[0, -9.81, 0]} timeStep={1 / 60} paused={game.paused} interpolate>
      <World game={game} />
    </Physics>
    <CameraRig game={game} mode={mode} feedRef={feedRef} hud={hud} onCamera={onCamera} />
  </>;
}
export default function SimulatorScene(props: Parameters<typeof Scene>[0]) {
  return <Canvas shadows={props.game.config.quality === "high"} dpr={props.game.config.quality === "high" ? [1, 1.5] : 1}
    camera={{ position: [0, 2.8, 4.5], fov: 53, near: 0.015, far: 50 }}
    gl={{ antialias: true, powerPreference: "high-performance" }} fallback={<div className="sim-fallback">Trình duyệt chưa hỗ trợ WebGL. Hãy bật tăng tốc đồ họa hoặc thử Chrome/Edge.</div>}>
    <Scene {...props} />
  </Canvas>;
}
