import { describe, it, expect } from "vitest";
import { computeSlope, computeAspect, computeHillshade } from "./terrainAnalysis";

function flat(width, height, value = 100) {
  const elevations = new Float32Array(width * height);
  elevations.fill(value);
  return { elevations, width, height };
}

function ramp(width, height, perPixelGain) {
  const elevations = new Float32Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      elevations[r * width + c] = c * perPixelGain;
    }
  }
  return { elevations, width, height };
}

describe("computeSlope", () => {
  it("returns all zeros for a flat heightmap", () => {
    const slope = computeSlope(flat(5, 5, 100), 10);
    for (const v of slope) expect(v).toBeCloseTo(0, 6);
  });

  it("returns 45° (≈ π/4) for a ramp of 1 m per 1 m", () => {
    const slope = computeSlope(ramp(5, 5, 1), 1);
    expect(slope[2 * 5 + 2]).toBeCloseTo(Math.PI / 4, 3);
  });

  it("returns atan(0.5) for a 1:2 slope (rise 1 per run 2)", () => {
    const slope = computeSlope(ramp(5, 5, 1), 2);
    expect(slope[2 * 5 + 2]).toBeCloseTo(Math.atan(1 / 2), 3);
  });

  it("output length equals width * height", () => {
    const slope = computeSlope(flat(7, 5), 10);
    expect(slope.length).toBe(35);
  });
});

describe("computeAspect", () => {
  it("returns NaN for flat terrain", () => {
    const aspect = computeAspect(flat(5, 5), 10);
    expect(Number.isNaN(aspect[2 * 5 + 2])).toBe(true);
  });

  it("east-rising ramp faces west (≈ 3π/2)", () => {
    const aspect = computeAspect(ramp(5, 5, 1), 1);
    expect(aspect[2 * 5 + 2]).toBeCloseTo((3 * Math.PI) / 2, 2);
  });

  it("output length equals width * height", () => {
    const aspect = computeAspect(flat(7, 5), 10);
    expect(aspect.length).toBe(35);
  });
});

describe("computeHillshade", () => {
  it("returns sin(altitude) on flat terrain (slope=0)", () => {
    const hs = computeHillshade(flat(5, 5), 10, { azimuthDeg: 315, altitudeDeg: 45 });
    expect(hs[2 * 5 + 2]).toBeCloseTo(Math.sin((45 * Math.PI) / 180), 3);
  });

  it("values are clamped to [0, 1]", () => {
    const hs = computeHillshade(ramp(5, 5, 1), 1, { azimuthDeg: 315, altitudeDeg: 45 });
    for (const v of hs) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("output length equals width * height", () => {
    const hs = computeHillshade(flat(7, 5), 10);
    expect(hs.length).toBe(35);
  });
});
