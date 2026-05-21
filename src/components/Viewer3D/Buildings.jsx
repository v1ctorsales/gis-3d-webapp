import { useEffect } from "react";

export default function Buildings({ geometry }) {
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#d8d4cc" roughness={0.85} metalness={0} />
    </mesh>
  );
}
