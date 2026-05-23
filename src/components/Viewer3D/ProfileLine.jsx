import { useEffect, useMemo } from "react";
import * as THREE from "three";

const Y_LIFT = 0.4;

export default function ProfileLine({ p0, p1 }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array([
      p0.x, p0.y + Y_LIFT, p0.z,
      p1.x, p1.y + Y_LIFT, p1.z,
    ]);
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [p0, p1]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <>
      <lineSegments geometry={geometry} renderOrder={5}>
        <lineBasicMaterial color="#ff7755" linewidth={2} />
      </lineSegments>
      <mesh position={[p0.x, p0.y + Y_LIFT, p0.z]}>
        <sphereGeometry args={[1.2, 12, 12]} />
        <meshBasicMaterial color="#ff7755" />
      </mesh>
      <mesh position={[p1.x, p1.y + Y_LIFT, p1.z]}>
        <sphereGeometry args={[1.2, 12, 12]} />
        <meshBasicMaterial color="#ff7755" />
      </mesh>
    </>
  );
}
