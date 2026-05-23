import { describe, it, expect } from "vitest";
import { marchingSquaresLevel } from "./marchingSquares";

function ramp(width, height, perPixelGain) {
  const elevations = new Float32Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      elevations[r * width + c] = c * perPixelGain;
    }
  }
  return { elevations, width, height };
}

describe("marchingSquaresLevel", () => {
  it("returns empty when level is outside the data range", () => {
    const segs = marchingSquaresLevel(ramp(5, 5, 1), 999);
    expect(segs.length).toBe(0);
  });

  it("returns segments when level crosses the data range", () => {
    const segs = marchingSquaresLevel(ramp(5, 5, 1), 2);
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.length % 4).toBe(0);
  });

  it("endpoints are within heightmap pixel bounds", () => {
    const segs = marchingSquaresLevel(ramp(5, 5, 1), 2);
    for (let i = 0; i < segs.length; i += 2) {
      expect(segs[i]).toBeGreaterThanOrEqual(0);
      expect(segs[i]).toBeLessThanOrEqual(4);
      expect(segs[i + 1]).toBeGreaterThanOrEqual(0);
      expect(segs[i + 1]).toBeLessThanOrEqual(4);
    }
  });
});
