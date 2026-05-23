/**
 * Slope at every cell, in radians, via Horn's 3×3 algorithm.
 * Edge cells use clamped (replicate-edge) neighbors.
 *
 * @param {{elevations: Float32Array, width: number, height: number}} hm
 * @param {number} pixelSizeM  meters per heightmap pixel (horizontal)
 * @returns {Float32Array} length = width * height
 */
export function computeSlope(hm, pixelSizeM) {
  const { elevations, width, height } = hm;
  const out = new Float32Array(width * height);
  const at = (c, r) => {
    const cc = c < 0 ? 0 : c >= width ? width - 1 : c;
    const rr = r < 0 ? 0 : r >= height ? height - 1 : r;
    return elevations[rr * width + cc];
  };
  const denom = 8 * pixelSizeM;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const a = at(c - 1, r - 1);
      const b = at(c, r - 1);
      const cc = at(c + 1, r - 1);
      const d = at(c - 1, r);
      const f = at(c + 1, r);
      const g = at(c - 1, r + 1);
      const h = at(c, r + 1);
      const i = at(c + 1, r + 1);
      const dzdx = (cc + 2 * f + i - (a + 2 * d + g)) / denom;
      const dzdy = (g + 2 * h + i - (a + 2 * b + cc)) / denom;
      out[r * width + c] = Math.atan(Math.hypot(dzdx, dzdy));
    }
  }
  return out;
}
