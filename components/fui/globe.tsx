"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export const globeLink = { x: 0, y: 0, ok: false };

export type GlobeNode = { symbol: string };

type Point = [number, number];
type Command =
  | { op: "M" | "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "Z" };

/** Official Grok mark (xAI, 2025), traced as two filled contours. */
const MARK: Command[] = [
  { op: "M", x: 33.79, y: 30.08 },
  { op: "C", x1: 48.66, y1: 15.2, x2: 70.57, y2: 11.45, x: 88.86, y: 18.99 },
  { op: "C", x1: 92.91, y1: 20.5, x2: 96.44, y2: 22.64, x: 99.19, y: 24.63 },
  { op: "L", x: 83.91, y: 31.69 },
  { op: "C", x1: 69.69, y1: 25.72, x2: 53.39, y2: 29.78, x: 43.45, y: 39.74 },
  { op: "C", x1: 30.01, y1: 53.2, x2: 27.29, y2: 76.53, x: 43.05, y: 91.6 },
  { op: "L", x: 43.03, y: 91.6 },
  { op: "L", x: 0, y: 130.08 },
  { op: "C", x1: 2.73, y1: 126.32, x2: 6.11, y2: 122.76, x: 9.49, y: 119.21 },
  { op: "C", x1: 9.9665, y1: 118.709, x2: 10.4428, y2: 118.208, x: 10.917, y: 117.707 },
  { op: "L", x: 11.485, y: 117.106 },
  { op: "C", x1: 20.27, y1: 107.778, x2: 28.076, y2: 98.267, x: 22.71, y: 85.21 },
  { op: "C", x1: 14.99, y1: 66.42, x2: 19.49, y2: 44.4, x: 33.79, y: 30.08 },
  { op: "Z" },
  { op: "M", x: 135.52, y: 0 },
  { op: "C", x1: 135.18, y1: 0.47, x2: 134.84, y2: 0.94, x: 134.51, y: 1.4 },
  { op: "C", x1: 120.34, y1: 20.93, x2: 113.43, y2: 30.48, x: 118.98, y: 54.38 },
  { op: "L", x: 118.95, y: 54.35 },
  { op: "C", x1: 122.78, y1: 70.62, x2: 118.69, y2: 88.66, x: 105.47, y: 101.89 },
  { op: "C", x1: 88.81, y1: 118.58, x2: 62.14, y2: 122.3, x: 40.18, y: 107.27 },
  { op: "L", x: 55.49, y: 100.17 },
  { op: "C", x1: 69.51, y1: 105.68, x2: 84.84, y2: 103.26, x: 95.86, y: 92.23 },
  { op: "C", x1: 106.88, y1: 81.19, x2: 109.36, y2: 65.12, x: 103.82, y: 51.75 },
  { op: "C", x1: 102.77, y1: 49.21, x2: 99.61, y2: 48.58, x: 97.4, y: 50.21 },
  { op: "L", x: 52.35, y: 83.51 },
  { op: "L", x: 116.88, y: 18.6 },
  { op: "L", x: 116.88, y: 18.66 },
  { op: "Z" },
];

const SCALE = 0.0152;

function place(x: number, y: number): Point {
  return [(x - 67.8) * SCALE, -(y - 65) * SCALE];
}

function cubic(a: Point, b: Point, c: Point, d: Point, steps: number) {
  const points: Point[] = [];
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const u = 1 - t;
    points.push([
      u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
    ]);
  }
  return points;
}

function outlines() {
  const loops: Point[][] = [];
  let current: Point[] = [];
  let cursor: Point = [0, 0];
  for (const command of MARK) {
    if (command.op === "M") {
      if (current.length) loops.push(current);
      cursor = place(command.x, command.y);
      current = [cursor];
    } else if (command.op === "L") {
      cursor = place(command.x, command.y);
      current.push(cursor);
    } else if (command.op === "C") {
      const next = cubic(cursor, place(command.x1, command.y1), place(command.x2, command.y2), place(command.x, command.y), 10);
      current.push(...next);
      cursor = next[next.length - 1] ?? cursor;
    } else if (current.length) {
      current.push(current[0]);
      loops.push(current);
      current = [];
    }
  }
  if (current.length) loops.push(current);
  return loops;
}

function lineGeometry(loops: Point[][], z: number) {
  const positions: number[] = [];
  for (const loop of loops) {
    for (let index = 1; index < loop.length; index += 1) {
      const previous = loop[index - 1];
      const point = loop[index];
      positions.push(previous[0], previous[1], z, point[0], point[1], z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function ribGeometry(loops: Point[][]) {
  const positions: number[] = [];
  for (const loop of loops) {
    for (let index = 0; index < loop.length; index += 8) {
      const point = loop[index];
      positions.push(point[0], point[1], -0.07, point[0], point[1], 0.07);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function Logo({ nodes, active, reduced }: { nodes: GlobeNode[]; active: string | null; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const loops = useMemo(() => outlines(), []);
  const front = useMemo(() => lineGeometry(loops, 0.07), [loops]);
  const back = useMemo(() => lineGeometry(loops, -0.07), [loops]);
  const ribs = useMemo(() => ribGeometry(loops), [loops]);
  const faces = useMemo(() => {
    return loops.map((loop) => {
      const shape = new THREE.Shape();
      loop.forEach((point, index) => {
        if (index === 0) shape.moveTo(point[0], point[1]);
        else shape.lineTo(point[0], point[1]);
      });
      return new THREE.ShapeGeometry(shape);
    });
  }, [loops]);
  const orbit = useMemo(() => {
    const count = Math.max(nodes.length, 1);
    return nodes.map((_, index) => {
      const angle = (index / count) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * 1.42, Math.sin(angle) * 0.22, Math.sin(angle) * 1.42);
    });
  }, [nodes]);

  useFrame((state) => {
    if (!group.current) return;
    if (!reduced) group.current.rotation.y += 0.004;
    const index = nodes.findIndex((node) => node.symbol === active);
    if (index < 0) {
      globeLink.ok = false;
      return;
    }
    const vector = orbit[index].clone();
    vector.applyMatrix4(group.current.matrixWorld);
    vector.project(state.camera);
    const canvas = state.gl.domElement.getBoundingClientRect();
    globeLink.x = canvas.left + (vector.x * 0.5 + 0.5) * canvas.width;
    globeLink.y = canvas.top + (-vector.y * 0.5 + 0.5) * canvas.height;
    globeLink.ok = vector.z < 1;
  });

  return (
    <group ref={group}>
      {faces.map((geometry, index) => (
        <mesh key={`face-${index}`} geometry={geometry} position={[0, 0, 0.02]}>
          <meshBasicMaterial color="#00f0ff" transparent opacity={0.32} depthWrite={false} />
        </mesh>
      ))}
      <lineSegments geometry={front}>
        <lineBasicMaterial color="#f7fdff" />
      </lineSegments>
      <lineSegments geometry={back}>
        <lineBasicMaterial color="#7fdbff" transparent opacity={0.35} />
      </lineSegments>
      <lineSegments geometry={ribs}>
        <lineBasicMaterial color="#00f0ff" transparent opacity={0.28} />
      </lineSegments>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.42, 0.004, 8, 96]} />
        <meshBasicMaterial color="#1c4d66" transparent opacity={0.85} />
      </mesh>
      {orbit.map((point, index) => {
        const on = active === nodes[index]?.symbol;
        return (
          <mesh key={nodes[index]?.symbol ?? index} position={point}>
            <sphereGeometry args={[on ? 0.045 : 0.018, 10, 10]} />
            <meshBasicMaterial color={on ? "#ffcc00" : "#9fd8ff"} />
          </mesh>
        );
      })}
    </group>
  );
}

export function WireGlobe({ nodes, active, reduced }: { nodes: GlobeNode[]; active: string | null; reduced: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={reduced ? "demand" : "always"}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0.15, 3.55], fov: 34 }}
    >
      <Logo nodes={nodes} active={active} reduced={reduced} />
    </Canvas>
  );
}
