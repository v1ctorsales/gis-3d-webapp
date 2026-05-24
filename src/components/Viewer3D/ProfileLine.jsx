import { useMemo } from "react";
import { Line } from "@react-three/drei";

/**
 * Draws a draped polyline through the supplied scene-space points and an
 * endpoint sphere at each end (or just the start sphere when `dashed`,
 * since the "moving" end is the cursor).
 */
export default function ProfileLine({
  points,
  color = "#ff7755",
  dashed = false,
  opacity = 1,
}) {
  const start = useMemo(() => (points?.length ? points[0] : null), [points]);
  const end = useMemo(
    () => (points?.length > 1 ? points[points.length - 1] : null),
    [points],
  );

  if (!points || points.length < 2) return null;

  return (
    <>
      <Line
        points={points}
        color={color}
        lineWidth={2.5}
        transparent
        opacity={opacity}
        depthTest={false}
        renderOrder={5}
        dashed={dashed}
        dashSize={dashed ? 3 : 0}
        gapSize={dashed ? 2 : 0}
      />
      {start && (
        <mesh position={[start.x, start.y, start.z]} renderOrder={6}>
          <sphereGeometry args={[1.2, 12, 12]} />
          <meshBasicMaterial color={color} depthTest={false} transparent opacity={opacity} />
        </mesh>
      )}
      {!dashed && end && (
        <mesh position={[end.x, end.y, end.z]} renderOrder={6}>
          <sphereGeometry args={[1.2, 12, 12]} />
          <meshBasicMaterial color={color} depthTest={false} transparent opacity={opacity} />
        </mesh>
      )}
    </>
  );
}
