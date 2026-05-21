// Hypsometric color ramp (meters → RGB). Standard cartographic gradient:
// blue ocean → green lowlands → yellow hills → brown mountains → white peaks.
const STOPS = [
  { elev: -500, color: [10, 30, 80] },
  { elev: 0, color: [60, 110, 180] },
  { elev: 1, color: [140, 195, 110] },
  { elev: 500, color: [200, 200, 130] },
  { elev: 1500, color: [200, 165, 100] },
  { elev: 3000, color: [165, 115, 80] },
  { elev: 5000, color: [230, 230, 235] },
];

function colorAt(elev) {
  if (elev <= STOPS[0].elev) return STOPS[0].color;
  if (elev >= STOPS[STOPS.length - 1].elev)
    return STOPS[STOPS.length - 1].color;
  for (let i = 1; i < STOPS.length; i++) {
    if (elev <= STOPS[i].elev) {
      const a = STOPS[i - 1];
      const b = STOPS[i];
      const t = (elev - a.elev) / (b.elev - a.elev);
      return [
        a.color[0] + (b.color[0] - a.color[0]) * t,
        a.color[1] + (b.color[1] - a.color[1]) * t,
        a.color[2] + (b.color[2] - a.color[2]) * t,
      ];
    }
  }
  return STOPS[STOPS.length - 1].color;
}

export function buildHypsometricCanvas({ elevations, width, height }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  const px = img.data;

  for (let i = 0; i < elevations.length; i++) {
    const [r, g, b] = colorAt(elevations[i]);
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
