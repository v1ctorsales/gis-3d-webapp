import { computeSlope, computeAspect, computeHillshade } from "./terrainAnalysis";

const TWO_PI = Math.PI * 2;

/** Slope: green (gentle) → yellow → red (steep), saturated at 45°. */
export function buildSlopeCanvas(heightmap, pixelSizeM) {
  const { width, height } = heightmap;
  const slope = computeSlope(heightmap, pixelSizeM);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  const px = img.data;
  const maxRad = Math.PI / 4;
  for (let i = 0; i < slope.length; i++) {
    const t = Math.min(1, slope[i] / maxRad);
    let r, g, b;
    if (t < 0.5) {
      const k = t * 2;
      r = 60 + (240 - 60) * k;
      g = 180 + (220 - 180) * k;
      b = 75 + (60 - 75) * k;
    } else {
      const k = (t - 0.5) * 2;
      r = 240 + (220 - 240) * k;
      g = 220 + (40 - 220) * k;
      b = 60 + (40 - 60) * k;
    }
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Aspect: HSV wheel keyed on downhill direction. Flat cells = gray. */
export function buildAspectCanvas(heightmap, pixelSizeM) {
  const { width, height } = heightmap;
  const aspect = computeAspect(heightmap, pixelSizeM);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  const px = img.data;
  for (let i = 0; i < aspect.length; i++) {
    const a = aspect[i];
    if (Number.isNaN(a)) {
      px[i * 4] = 160;
      px[i * 4 + 1] = 160;
      px[i * 4 + 2] = 160;
      px[i * 4 + 3] = 255;
      continue;
    }
    const hue = (a / TWO_PI) * 360;
    const [r, g, b] = hsvToRgb(hue, 0.7, 0.95);
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Hillshade: grayscale. */
export function buildHillshadeCanvas(heightmap, pixelSizeM, sun) {
  const { width, height } = heightmap;
  const hs = computeHillshade(heightmap, pixelSizeM, sun);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  const px = img.data;
  for (let i = 0; i < hs.length; i++) {
    const v = Math.round(hs[i] * 255);
    px[i * 4] = v;
    px[i * 4 + 1] = v;
    px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = v - c;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}
