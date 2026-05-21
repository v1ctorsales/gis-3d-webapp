import { useEffect, useMemo } from "react";
import * as THREE from "three";

export default function Terrain({ buildResult, textureCanvas }) {
  const textureMap = useMemo(() => {
    if (!textureCanvas) return null;
    const tex = new THREE.CanvasTexture(textureCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, [textureCanvas]);

  useEffect(() => () => buildResult.geometry.dispose(), [buildResult]);
  useEffect(() => () => textureMap?.dispose(), [textureMap]);

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
