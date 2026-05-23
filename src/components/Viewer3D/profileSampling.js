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

function bilinear(hm, x, y) {
  const { elevations, width: W, height: H } = hm;
  const cx = Math.max(0, Math.min(W - 1, x));
  const cy = Math.max(0, Math.min(H - 1, y));
  const x0 = Math.min(Math.floor(cx), W - 2);
  const x1 = x0 + 1;
  const y0 = Math.min(Math.floor(cy), H - 2);
  const y1 = y0 + 1;
  const fx = cx - x0, fy = cy - y0;
  const v00 = elevations[y0 * W + x0];
  const v10 = elevations[y0 * W + x1];
  const v01 = elevations[y1 * W + x0];
  const v11 = elevations[y1 * W + x1];
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
}
