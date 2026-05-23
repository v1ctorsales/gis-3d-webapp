import { describe, it, expect } from "vitest";
import { floodStats } from "./floodAnalysis";

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

describe("floodStats", () => {
  it("returns 0 inundation when level is below min", () => {
    const stats = floodStats(flat(10, 10, 100), 50, 100);
    expect(stats.floodedFraction).toBe(0);
    expect(stats.floodedAreaM2).toBe(0);
  });

  it("returns 1.0 inundation when level is above max", () => {
    const stats = floodStats(flat(10, 10, 100), 200, 100);
    expect(stats.floodedFraction).toBeCloseTo(1, 5);
  });

  it("returns ~0.5 for level at midpoint of a ramp", () => {
    const stats = floodStats(ramp(10, 10, 1), 4.5, 1);
    expect(stats.floodedFraction).toBeCloseTo(0.5, 5);
  });

  it("scales area by pixelAreaM2", () => {
    const stats = floodStats(flat(10, 10, 0), 1, 100);
    expect(stats.floodedAreaM2).toBeCloseTo(10000, 5);
  });
});
