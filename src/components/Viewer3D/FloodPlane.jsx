import * as THREE from "three";

export default function FloodPlane({ bounds, scale, level }) {
  const y = level * scale.verticalScale;
  return (
    <mesh
      position={[0, y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={4}
    >
      <planeGeometry args={[bounds.sceneWidth, bounds.sceneDepth]} />
      <meshStandardMaterial
        color="#2a73c0"
        transparent
        opacity={0.55}
        roughness={0.3}
        metalness={0.1}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
