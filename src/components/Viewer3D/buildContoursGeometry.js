import * as THREE from "three";
import { marchingSquaresLevel } from "./marchingSquares";
import { bilinear } from "../../utils/geo";

const Y_OFFSET_UNITS = 0.2; // small lift so lines don't z-fight with terrain

/**
 * Build draped contour points as a flat Vector3 list of segment pairs.
 * Each consecutive pair of Vector3s is one disconnected segment, suitable
 * for drei's <Line segments points={...} />.
 *
 * @param heightmap {elevations, width, height}
 * @param bounds    {sceneWidth, sceneDepth}
 * @param scale     {verticalScale}
 * @param levels    array of elevation values (meters)
 * @returns {THREE.Vector3[]} pairs of endpoints (length always even)
 */
export function buildContoursPoints(heightmap, bounds, scale, levels) {
  const { width: W, height: H } = heightmap;
  const { sceneWidth, sceneDepth } = bounds;
  const { verticalScale } = scale;
  const startX = -sceneWidth / 2;
  const startZ = -sceneDepth / 2;
  const sx = sceneWidth / (W - 1);
  const sz = sceneDepth / (H - 1);

  const points = [];
  for (const level of levels) {
    const segs = marchingSquaresLevel(heightmap, level);
    for (let i = 0; i < segs.length; i += 4) {
      const px0 = segs[i], py0 = segs[i + 1];
      const px1 = segs[i + 2], py1 = segs[i + 3];
      const ele0 = bilinear(heightmap, px0, py0);
      const ele1 = bilinear(heightmap, px1, py1);
      points.push(
        new THREE.Vector3(
          startX + px0 * sx,
          ele0 * verticalScale + Y_OFFSET_UNITS,
          startZ + py0 * sz,
        ),
        new THREE.Vector3(
          startX + px1 * sx,
          ele1 * verticalScale + Y_OFFSET_UNITS,
          startZ + py1 * sz,
        ),
      );
    }
  }
  return points;
}

/** Evenly spaced contour levels covering the heightmap range. */
export function makeLevels(minElevation, maxElevation, spacing) {
  if (spacing <= 0) return [];
  const startLevel = Math.ceil(minElevation / spacing) * spacing;
  const out = [];
  for (let l = startLevel; l <= maxElevation; l += spacing) out.push(l);
  return out;
}
