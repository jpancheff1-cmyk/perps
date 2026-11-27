"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export const globeLink = { x: 0, y: 0, ok: false };

export type GlobeNode = { symbol: string };

const RADIUS = 0.72;
const TILT = (35 * Math.PI) / 180;

/** Fraction of the diameter, origin at the top-left of the sphere's box. */
function onFace(across: number, down: number) {
  const x = (across - 0.5) * RADIUS * 2;
  const y = (0.5 - down) * RADIUS * 2;
  const z = Math.sqrt(Math.max(RADIUS * RADIUS - x * x - y * y, 0.0004));
  return new THREE.Vector3(x, y, z).normalize().multiplyScalar(RADIUS + 0.02);
}

function Avatar({ nodes, active, reduced }: { nodes: GlobeNode[]; active: string | null; reduced: boolean }) {
  const drift = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const orbit = useRef<THREE.Group>(null);
  const thick = useRef<THREE.Mesh>(null);
  const thin = useRef<THREE.Mesh>(null);
  const clock = useRef(0);
  const coins = useMemo(() => {
    const count = Math.max(nodes.length, 1);
    return nodes.map((_, index) => {
      const angle = (index / count) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * 1.35, Math.sin(angle) * 0.16, Math.sin(angle) * 1.35);
    });
  }, [nodes]);
  const thickAt = useMemo(() => onFace(0.5, 0.35), []);
  const thinAt = useMemo(() => onFace(0.75, 0.25), []);

  useFrame((state, delta) => {
    if (!drift.current || !body.current || !orbit.current) return;
    const index = nodes.findIndex((node) => node.symbol === active);
    if (index >= 0 && orbit.current) {
      const vector = coins[index].clone();
      vector.applyMatrix4(orbit.current.matrixWorld);
      vector.project(state.camera);
      const canvas = state.gl.domElement.getBoundingClientRect();
      globeLink.x = canvas.left + (vector.x * 0.5 + 0.5) * canvas.width;
      globeLink.y = canvas.top + (-vector.y * 0.5 + 0.5) * canvas.height;
      globeLink.ok = vector.z < 1;
    } else {
      globeLink.ok = false;
    }
    if (reduced) return;
    clock.current += delta;
    const t = clock.current;
    drift.current.position.x = Math.sin(t * 0.35) * 0.22;
    drift.current.position.z = Math.cos(t * 0.27) * 0.12;
    const bob = Math.sin(t * 1.6);
    body.current.position.y = bob * 0.07;
    const stretch = 1 + bob * 0.04;
    const squash = 1 / Math.sqrt(stretch);
    body.current.scale.set(squash, stretch, squash);
    orbit.current.rotation.y += delta * 0.28;
    const coin = index >= 0 ? coins[index] : null;
    const lookX = THREE.MathUtils.clamp((state.pointer.x * 0.55 + (coin ? coin.x * 0.15 : 0)), -0.35, 0.35);
    const lookY = THREE.MathUtils.clamp((state.pointer.y * 0.35 + (coin ? coin.y * 0.2 : 0)), -0.25, 0.25);
    if (eyes.current) {
      eyes.current.rotation.y = THREE.MathUtils.lerp(eyes.current.rotation.y, lookX, 0.08);
      eyes.current.rotation.x = THREE.MathUtils.lerp(eyes.current.rotation.x, -lookY, 0.08);
    }
    const blink = (t % 4.8) < 0.14 ? 0.16 : 1;
    if (thick.current) thick.current.scale.y = blink;
    if (thin.current) thin.current.scale.y = blink;
  });

  return (
    <group ref={drift}>
      <group ref={orbit}>
        {coins.map((point, index) => {
          const on = active === nodes[index]?.symbol;
          return (
            <mesh key={nodes[index]?.symbol ?? index} position={point}>
              <sphereGeometry args={[on ? 0.05 : 0.02, 12, 12]} />
              <meshBasicMaterial color={on ? "#ffcc00" : "#9fd8ff"} />
            </mesh>
          );
        })}
      </group>
      <group ref={body}>
        <mesh>
          <sphereGeometry args={[RADIUS, 48, 48]} />
          <meshStandardMaterial color="#050505" metalness={0.92} roughness={0.16} />
        </mesh>
        <mesh scale={1.04}>
          <sphereGeometry args={[RADIUS, 32, 32]} />
          <meshBasicMaterial color="#00f0ff" side={THREE.BackSide} transparent opacity={0.42} />
        </mesh>
        <group ref={eyes}>
          <mesh ref={thick} position={thickAt} rotation={[0, 0, TILT]}>
            <capsuleGeometry args={[0.055, 0.1, 6, 12]} />
            <meshBasicMaterial color="#f7fbff" />
          </mesh>
          <mesh ref={thin} position={thinAt} rotation={[0, 0, TILT]}>
            <capsuleGeometry args={[0.032, 0.2, 6, 12]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function WireGlobe({ nodes, active, reduced }: { nodes: GlobeNode[]; active: string | null; reduced: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={reduced ? "demand" : "always"}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0.12, 3.7], fov: 34 }}
    >
      <ambientLight intensity={0.45} />
      <directionalLight position={[-2.4, 2.2, 3.2]} intensity={1.15} color="#e7f2ff" />
      <directionalLight position={[2.6, 0.4, -2.2]} intensity={1.8} color="#00f0ff" />
      <Avatar nodes={nodes} active={active} reduced={reduced} />
    </Canvas>
  );
}
