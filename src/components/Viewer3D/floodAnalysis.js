/**
 * Static "bathtub" flood inundation stats — every cell with elevation <= level
 * counts as flooded, regardless of hydraulic connectivity.
 *
 * @param {{elevations: Float32Array, width: number, height: number}} hm
 * @param {number} level         flood elevation in meters
 * @param {number} pixelAreaM2   horizontal area of one heightmap cell in m²
 * @returns {{floodedFraction: number, floodedAreaM2: number}}
 */
export function floodStats(hm, level, pixelAreaM2) {
  const e = hm.elevations;
  let n = 0;
  for (let i = 0; i < e.length; i++) {
    if (e[i] <= level) n++;
  }
  const floodedFraction = n / e.length;
  return {
    floodedFraction,
    floodedAreaM2: floodedFraction * e.length * pixelAreaM2,
  };
}
