import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { buildContoursPoints, makeLevels } from "./buildContoursGeometry";

export default function Contours({
  heightmap,
  bounds,
  scale,
  spacing,
  color = "#ffffff",
  lineWidth = 2,
  opacity = 0.9,
}) {
  const points = useMemo(() => {
    const levels = makeLevels(heightmap.minElevation, heightmap.maxElevation, spacing);
    return buildContoursPoints(heightmap, bounds, scale, levels);
  }, [heightmap, bounds, scale, spacing]);

  if (points.length === 0) return null;

  return (
    <Line
      points={points}
      segments
      color={color}
      lineWidth={lineWidth}
      transparent
      opacity={opacity}
      depthTest={false}
      renderOrder={3}
    />
  );
}
