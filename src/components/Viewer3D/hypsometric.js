// Hypsometric color ramp (relative ordering only — absolute meters are decided
// at render time by the centerM + bandWidthM stops below):
// deep blue → blue → green → tan → brown → dark brown → snow white.
export const RAMP_COLORS = [
  [10, 30, 80],     // deep ocean blue
  [60, 110, 180],   // ocean / low
  [140, 195, 110],  // lowland green
  [200, 200, 130],  // hills yellow
  [200, 165, 100],  // brown
  [165, 115, 80],   // mountain
  [230, 230, 235],  // snow
];

const N = RAMP_COLORS.length; // 7

/**
 * Per-pixel color lookup. Exported so it can be unit-tested without a canvas.
 *
 * @param {number} elev      Elevation in meters.
 * @param {number} centerM   Elevation at the ramp midpoint.
 * @param {number} bandWidthM Meters of elevation between adjacent stops.
 * @returns {[number, number, number]} RGB triple, channels 0..255.
 */
export function colorAt(elev, centerM, bandWidthM) {
  // Stops are placed at: centerM + (i - (N-1)/2) * bandWidthM for i = 0..N-1.
  // Map elev to a "stop index" t ∈ ℝ, then interpolate between floor/ceil stops.
  const t = (elev - centerM) / bandWidthM + (N - 1) / 2;
  if (t <= 0) return RAMP_COLORS[0];
  if (t >= N - 1) return RAMP_COLORS[N - 1];
  const i = Math.floor(t);
  const f = t - i;
  const a = RAMP_COLORS[i];
  const b = RAMP_COLORS[i + 1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

/**
 * Default band width that maps the full elevation range onto the visible ramp.
 * `range = max(1, maxElevation - minElevation)` guards against zero-range
 * heightmaps. The returned value can be a fraction of a meter (e.g. for a
 * perfectly flat heightmap, range=1 ⇒ 1/6 ≈ 0.166 m); callers that need an
 * integer slider value should clamp/round themselves.
 */
export function suggestHypsometricBandWidth(minElevation, maxElevation) {
  const range = Math.max(1, maxElevation - minElevation);
  // (N - 1) intervals span the full range.
  return range / (N - 1);
}

/**
 * Render a hypsometric tint canvas for the heightmap.
 *
 * @param {{elevations: Float32Array, width: number, height: number, minElevation: number, maxElevation: number}} hm
 * @param {object} [opts]
 * @param {number} [opts.bandWidthM]  Meters of elevation per gap between adjacent
 *                                    stops in the visible ramp. If omitted, defaults
 *                                    to (maxElevation - minElevation) / (N - 1) so
 *                                    the full ramp covers the AOI.
 * @param {number} [opts.centerM]     Elevation at the ramp midpoint. Defaults to
 *                                    (minElevation + maxElevation) / 2.
 */
export function buildHypsometricCanvas(hm, opts = {}) {
  const { elevations, width, height, minElevation, maxElevation } = hm;
  const centerM =
    opts.centerM != null ? opts.centerM : (minElevation + maxElevation) / 2;
  const bandWidthM =
    opts.bandWidthM != null
      ? opts.bandWidthM
      : suggestHypsometricBandWidth(minElevation, maxElevation);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  const px = img.data;

  for (let i = 0; i < elevations.length; i++) {
    const [r, g, b] = colorAt(elevations[i], centerM, bandWidthM);
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
