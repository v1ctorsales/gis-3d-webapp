import * as THREE from "three";
import { marchingSquaresLevel } from "./marchingSquares";

const Y_OFFSET_UNITS = 0.2; // small lift so lines don't z-fight with terrain

function bilinear(hm, x, y) {
  const { elevations, width: W, height: H } = hm;
  const x0 = Math.floor(x), x1 = Math.min(W - 1, x0 + 1);
  const y0 = Math.floor(y), y1 = Math.min(H - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const v00 = elevations[y0 * W + x0];
  const v10 = elevations[y0 * W + x1];
  const v01 = elevations[y1 * W + x0];
  const v11 = elevations[y1 * W + x1];
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
}

/**
 * Build a draped LineSegments geometry for multiple contour elevations.
 *
 * @param heightmap {elevations, width, height}
 * @param bounds    {sceneWidth, sceneDepth}
 * @param scale     {verticalScale}
 * @param levels    array of elevation values (meters)
 */
export function buildContoursGeometry(heightmap, bounds, scale, levels) {
  const { width: W, height: H } = heightmap;
  const { sceneWidth, sceneDepth } = bounds;
  const { verticalScale } = scale;
  const startX = -sceneWidth / 2;
  const startZ = -sceneDepth / 2;
  const sx = sceneWidth / (W - 1);
  const sz = sceneDepth / (H - 1);

  const positions = [];
  for (const level of levels) {
    const segs = marchingSquaresLevel(heightmap, level);
    for (let i = 0; i < segs.length; i += 4) {
      const px0 = segs[i], py0 = segs[i + 1];
      const px1 = segs[i + 2], py1 = segs[i + 3];
      const ele0 = bilinear(heightmap, px0, py0);
      const ele1 = bilinear(heightmap, px1, py1);
      positions.push(
        startX + px0 * sx, ele0 * verticalScale + Y_OFFSET_UNITS, startZ + py0 * sz,
        startX + px1 * sx, ele1 * verticalScale + Y_OFFSET_UNITS, startZ + py1 * sz,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/** Evenly spaced contour levels covering the heightmap range. */
export function makeLevels(minElevation, maxElevation, spacing) {
  if (spacing <= 0) return [];
  const startLevel = Math.ceil(minElevation / spacing) * spacing;
  const out = [];
  for (let l = startLevel; l <= maxElevation; l += spacing) out.push(l);
  return out;
}
