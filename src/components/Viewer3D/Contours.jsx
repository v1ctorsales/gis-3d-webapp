import { useEffect, useMemo } from "react";
import { buildContoursGeometry, makeLevels } from "./buildContoursGeometry";

export default function Contours({ heightmap, bounds, scale, spacing, color = "#ffffff" }) {
  const geometry = useMemo(() => {
    const levels = makeLevels(heightmap.minElevation, heightmap.maxElevation, spacing);
    return buildContoursGeometry(heightmap, bounds, scale, levels);
  }, [heightmap, bounds, scale, spacing]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} renderOrder={3}>
      <lineBasicMaterial color={color} transparent opacity={0.85} depthTest={true} />
    </lineSegments>
  );
}
