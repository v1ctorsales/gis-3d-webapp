import { useEffect } from "react";
import * as THREE from "three";

export default function Roads({ geometry }) {
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} renderOrder={3}>
      <meshStandardMaterial
        color="#2a2a2a"
        roughness={0.95}
        metalness={0.0}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}
