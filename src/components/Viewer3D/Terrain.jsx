import { useEffect, useMemo } from "react";
import * as THREE from "three";

export default function Terrain({ buildResult, texture }) {
  const textureMap = useMemo(() => {
    if (!texture) return null;
    const tex = new THREE.CanvasTexture(texture);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, [texture]);

  // Dispose of GPU resources when geometry changes
  useEffect(() => {
    const geom = buildResult.geometry;
    return () => geom.dispose();
  }, [buildResult]);

  useEffect(() => {
    return () => textureMap?.dispose();
  }, [textureMap]);

  return (
    <mesh geometry={buildResult.geometry} castShadow receiveShadow>
      <meshStandardMaterial
        attach="material-0"
        map={textureMap}
        roughness={0.85}
        metalness={0}
      />
      <meshStandardMaterial
        attach="material-1"
        color="#3a3a3a"
        roughness={0.95}
        metalness={0}
      />
    </mesh>
  );
}
