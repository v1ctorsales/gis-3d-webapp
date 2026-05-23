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

/**
 * Aspect (downhill compass direction) at every cell, radians.
 *   0 = N, π/2 = E, π = S, 3π/2 = W.
 * NaN for flat cells.
 *
 * @param {{elevations: Float32Array, width: number, height: number}} hm
 * @param {number} pixelSizeM
 * @returns {Float32Array}
 */
export function computeAspect(hm, pixelSizeM) {
  const { elevations, width, height } = hm;
  const out = new Float32Array(width * height);
  const at = (c, r) => {
    const cc = c < 0 ? 0 : c >= width ? width - 1 : c;
    const rr = r < 0 ? 0 : r >= height ? height - 1 : r;
    return elevations[rr * width + cc];
  };
  const denom = 8 * pixelSizeM;
  const TWO_PI = Math.PI * 2;
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
      if (dzdx === 0 && dzdy === 0) {
        out[r * width + c] = NaN;
        continue;
      }
      let aRad = Math.atan2(-dzdx, dzdy);
      if (aRad < 0) aRad += TWO_PI;
      out[r * width + c] = aRad;
    }
  }
  return out;
}

/**
 * Hillshade in [0, 1]. ESRI formula.
 * @param {{elevations, width, height}} hm
 * @param {number} pixelSizeM
 * @param {{azimuthDeg?: number, altitudeDeg?: number}} sun
 */
export function computeHillshade(hm, pixelSizeM, sun = {}) {
  const azimuthDeg = sun.azimuthDeg ?? 315;
  const altitudeDeg = sun.altitudeDeg ?? 45;
  const slope = computeSlope(hm, pixelSizeM);
  const aspect = computeAspect(hm, pixelSizeM);
  const zenith = ((90 - altitudeDeg) * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  const cosZen = Math.cos(zenith);
  const sinZen = Math.sin(zenith);
  const out = new Float32Array(slope.length);
  for (let i = 0; i < slope.length; i++) {
    const s = slope[i];
    const a = aspect[i];
    const cosSlope = Math.cos(s);
    const sinSlope = Math.sin(s);
    let v;
    if (Number.isNaN(a)) {
      v = cosZen * cosSlope;
    } else {
      v = cosZen * cosSlope + sinZen * sinSlope * Math.cos(az - a);
    }
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    out[i] = v;
  }
  return out;
}
