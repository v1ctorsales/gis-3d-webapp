/**
 * Marching-squares isolines at one elevation.
 * Returns a flat Float32Array of segment endpoints in pixel coords:
 *   [x0, y0, x1, y1, x0, y0, x1, y1, ...]
 *
 * Frame: x = col (0..W-1), y = row (0..H-1). y=0 is north.
 *
 * @param {{elevations: Float32Array, width: number, height: number}} hm
 * @param {number} level  elevation threshold (meters)
 * @returns {Float32Array}
 */
export function marchingSquaresLevel(hm, level) {
  const { elevations: e, width: W, height: H } = hm;
  const at = (c, r) => e[r * W + c];
  const segs = [];

  for (let r = 0; r < H - 1; r++) {
    for (let c = 0; c < W - 1; c++) {
      const tl = at(c, r);
      const tr = at(c + 1, r);
      const br = at(c + 1, r + 1);
      const bl = at(c, r + 1);

      let code = 0;
      if (tl >= level) code |= 8;
      if (tr >= level) code |= 4;
      if (br >= level) code |= 2;
      if (bl >= level) code |= 1;
      if (code === 0 || code === 15) continue;

      const lerp = (a, b) => (level - a) / (b - a);
      const ptTop = () => [c + lerp(tl, tr), r];
      const ptRight = () => [c + 1, r + lerp(tr, br)];
      const ptBottom = () => [c + lerp(bl, br), r + 1];
      const ptLeft = () => [c, r + lerp(tl, bl)];

      let edges;
      switch (code) {
        case 1: edges = [["left", "bottom"]]; break;
        case 2: edges = [["bottom", "right"]]; break;
        case 3: edges = [["left", "right"]]; break;
        case 4: edges = [["top", "right"]]; break;
        case 5: edges = [["left", "top"], ["bottom", "right"]]; break;
        case 6: edges = [["bottom", "top"]]; break;
        case 7: edges = [["left", "top"]]; break;
        case 8: edges = [["left", "top"]]; break;
        case 9: edges = [["bottom", "top"]]; break;
        case 10: edges = [["left", "bottom"], ["top", "right"]]; break;
        case 11: edges = [["top", "right"]]; break;
        case 12: edges = [["left", "right"]]; break;
        case 13: edges = [["bottom", "right"]]; break;
        case 14: edges = [["left", "bottom"]]; break;
        default: edges = [];
      }
      const ptFor = (name) =>
        name === "top" ? ptTop() :
        name === "right" ? ptRight() :
        name === "bottom" ? ptBottom() :
        ptLeft();
      for (const [a, b] of edges) {
        const [x0, y0] = ptFor(a);
        const [x1, y1] = ptFor(b);
        segs.push(x0, y0, x1, y1);
      }
    }
  }
  return new Float32Array(segs);
}
