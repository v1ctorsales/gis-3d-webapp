import { describe, it, expect } from "vitest";
import { sampleProfile } from "./profileSampling";

function ramp(width, height, perPixelGain) {
  const elevations = new Float32Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      elevations[r * width + c] = c * perPixelGain;
    }
  }
  return { elevations, width, height };
}

describe("sampleProfile", () => {
  it("returns N samples along the line", () => {
    const samples = sampleProfile(ramp(11, 11, 1), { x: 0, y: 5 }, { x: 10, y: 5 }, 11);
    expect(samples.length).toBe(11);
  });

  it("elevation values match the ramp", () => {
    const samples = sampleProfile(ramp(11, 11, 1), { x: 0, y: 5 }, { x: 10, y: 5 }, 11);
    expect(samples[0].elevation).toBeCloseTo(0, 5);
    expect(samples[5].elevation).toBeCloseTo(5, 5);
    expect(samples[10].elevation).toBeCloseTo(10, 5);
  });

  it("first sample distance is 0, last is total length in pixels", () => {
    const samples = sampleProfile(ramp(11, 11, 1), { x: 0, y: 5 }, { x: 10, y: 5 }, 11);
    expect(samples[0].distancePx).toBe(0);
    expect(samples[10].distancePx).toBeCloseTo(10, 5);
  });
});
