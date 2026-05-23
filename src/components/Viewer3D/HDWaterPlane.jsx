import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const WATER_COLOR = "#1a6fb5";
const ANIMATION_SPEED = 0.2;
const NORMAL_REPEAT = 4; // was 8 — fewer tiles = bigger ripples
const NORMAL_FLOW = [0.02, 0.015];
const NORMAL_SCALE = 1.5; // was 0.6 — much more pronounced ripples

const WAVE_AMPLITUDE = 0.5; // was 0.15 — clearly visible 3D waves
const WAVE_FREQUENCY = 0.12;

export default function HDWaterPlane({
  geometry,
  normalMap,
  position = [0, 0, 0],
  animateVertices = false,
}) {
  const meshRef = useRef();

  // Each instance gets its own normal map clone so the offset animation
  // doesn't fight with other instances that share the source texture.
  const localNormalMap = useMemo(() => {
    if (!normalMap) return null;
    const tex = normalMap.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(NORMAL_REPEAT, NORMAL_REPEAT);
    tex.needsUpdate = true;
    return tex;
  }, [normalMap]);

  // Cache the rest position of every vertex so we can displace from it each frame.
  const restPositions = useMemo(() => {
    if (!geometry || !animateVertices) return null;
    return new Float32Array(geometry.attributes.position.array);
  }, [geometry, animateVertices]);

  // Three.js textures and BufferGeometry attributes are designed to be mutated
  // in-place — that's how UV scrolling and vertex animation work in R3F.
  // The react-hooks/immutability rule is over-strict here.
  /* eslint-disable react-hooks/immutability */
  useFrame((state) => {
    const t = state.clock.elapsedTime * ANIMATION_SPEED;

    if (localNormalMap) {
      localNormalMap.offset.x = t * NORMAL_FLOW[0];
      localNormalMap.offset.y = t * NORMAL_FLOW[1];
    }

    if (animateVertices && restPositions && meshRef.current) {
      const positions = meshRef.current.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        const x = restPositions[i];
        const y = restPositions[i + 1];
        const z = restPositions[i + 2];
        const h =
          Math.sin(x * WAVE_FREQUENCY + t * 1.0) * WAVE_AMPLITUDE +
          Math.cos(y * WAVE_FREQUENCY * 1.3 + t * 0.7) * WAVE_AMPLITUDE * 0.5 +
          Math.sin((x + y) * WAVE_FREQUENCY * 0.5 + t * 1.5) *
            WAVE_AMPLITUDE *
            0.3;
        positions[i + 2] = z + h;
      }
      meshRef.current.geometry.attributes.position.needsUpdate = true;
      meshRef.current.geometry.computeVertexNormals();
    }
  });
  /* eslint-enable react-hooks/immutability */

  if (!geometry || !localNormalMap) return null;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <meshPhysicalMaterial
        color={WATER_COLOR}
        roughness={0.08}
        metalness={0.2}
        normalMap={localNormalMap}
        normalScale={[NORMAL_SCALE, NORMAL_SCALE]}
        clearcoat={1.0}
        clearcoatRoughness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
