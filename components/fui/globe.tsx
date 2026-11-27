"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export const globeLink = { x: 0, y: 0, ok: false };

export type GlobeNode = { symbol: string };

function Field({ nodes, active, reduced }: { nodes: GlobeNode[]; active: string | null; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const acc = useRef(0);
  const points = useMemo(() => {
    const count = Math.max(nodes.length, 1);
    return nodes.map((_, index) => {
      const phi = Math.acos(1 - (2 * (index + 0.5)) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * index;
      return new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)).multiplyScalar(1.2);
    });
  }, [nodes]);
  const dots = useMemo(() => {
    const list: THREE.Vector3[] = [];
    for (let index = 0; index < 28; index += 1) {
      const a = points[index % Math.max(points.length, 1)] ?? new THREE.Vector3(0, 1.2, 0);
      const b = points[(index * 3) % Math.max(points.length, 1)] ?? a;
      list.push(a.clone().lerp(b, (index % 7) / 7));
    }
    return list;
  }, [points]);

  useFrame((state, delta) => {
    if (reduced || !group.current) return;
    acc.current += delta;
    if (acc.current < 1 / 24) return;
    acc.current = 0;
    group.current.rotation.y += 0.012;
    const index = nodes.findIndex((node) => node.symbol === active);
    if (index < 0) {
      globeLink.ok = false;
      return;
    }
    const vector = points[index].clone();
    vector.applyMatrix4(group.current.matrixWorld);
    vector.project(state.camera);
    const canvas = state.gl.domElement.getBoundingClientRect();
    globeLink.x = canvas.left + (vector.x * 0.5 + 0.5) * canvas.width;
    globeLink.y = canvas.top + (-vector.y * 0.5 + 0.5) * canvas.height;
    globeLink.ok = vector.z < 1;
    dots.forEach((dot, dotIndex) => {
      const next = points[(dotIndex + 1) % Math.max(points.length, 1)];
      if (!next) return;
      dot.lerp(next, 0.04);
      if (dot.distanceTo(next) < 0.05) dot.copy(points[dotIndex % Math.max(points.length, 1)] ?? next);
    });
  });

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial color="#12324a" wireframe />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.28, 8, 8]} />
        <meshBasicMaterial color="#00f0ff" wireframe />
      </mesh>
      {points.map((point, index) => (
        <mesh key={nodes[index]?.symbol ?? index} position={point}>
          <sphereGeometry args={[active === nodes[index]?.symbol ? 0.055 : 0.035, 6, 6]} />
          <meshBasicMaterial color={active === nodes[index]?.symbol ? "#ffcc00" : "#00f0ff"} />
        </mesh>
      ))}
      {!reduced &&
        dots.map((dot, index) => (
          <mesh
            key={`p-${index}`}
            position={dot}
            ref={(mesh) => {
              if (mesh) mesh.position.copy(dot);
            }}
          >
            <sphereGeometry args={[0.015, 4, 4]} />
            <meshBasicMaterial color="#39ff14" />
          </mesh>
        ))}
    </group>
  );
}

export function WireGlobe({ nodes, active, reduced }: { nodes: GlobeNode[]; active: string | null; reduced: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.25]}
      frameloop={reduced ? "demand" : "always"}
      gl={{ antialias: false, powerPreference: "low-power", alpha: true }}
      camera={{ position: [0, 0, 3.1], fov: 42 }}
    >
      <Field nodes={nodes} active={active} reduced={reduced} />
    </Canvas>
  );
}
