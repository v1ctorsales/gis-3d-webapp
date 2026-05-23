import { bilinear } from "../../utils/geo";

/**
 * Sample elevation along a line in heightmap pixel coordinates.
 *
 * @param {{elevations, width, height}} hm
 * @param {{x: number, y: number}} pStart
 * @param {{x: number, y: number}} pEnd
 * @param {number} n  number of samples (>= 2)
 * @returns {Array<{distancePx: number, elevation: number, x: number, y: number}>}
 */
export function sampleProfile(hm, pStart, pEnd, n) {
  const out = [];
  const dx = pEnd.x - pStart.x;
  const dy = pEnd.y - pStart.y;
  const totalPx = Math.hypot(dx, dy);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const x = pStart.x + dx * t;
    const y = pStart.y + dy * t;
    out.push({
      distancePx: totalPx * t,
      elevation: bilinear(hm, x, y),
      x,
      y,
    });
  }
  return out;
}
