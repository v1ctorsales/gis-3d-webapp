import { describe, it, expect } from "vitest";
import {
  colorAt,
  suggestHypsometricBandWidth,
  RAMP_COLORS,
} from "./hypsometric";

describe("colorAt", () => {
  it("returns the middle ramp color when elev equals centerM", () => {
    // 7 stops → middle is index 3 = [200, 200, 130]
    const c = colorAt(100, 100, 10);
    expect(c[0]).toBeCloseTo(200, 6);
    expect(c[1]).toBeCloseTo(200, 6);
    expect(c[2]).toBeCloseTo(130, 6);
  });

  it("saturates to first ramp color at or below the lowest stop", () => {
    // Lowest stop = centerM - 3*bandWidth = 100 - 30 = 70.
    expect(colorAt(70, 100, 10)).toEqual(RAMP_COLORS[0]);
    expect(colorAt(0, 100, 10)).toEqual(RAMP_COLORS[0]);
  });

  it("saturates to last ramp color at or above the highest stop", () => {
    // Highest stop = centerM + 3*bandWidth = 100 + 30 = 130.
    expect(colorAt(130, 100, 10)).toEqual(RAMP_COLORS[RAMP_COLORS.length - 1]);
    expect(colorAt(9999, 100, 10)).toEqual(RAMP_COLORS[RAMP_COLORS.length - 1]);
  });

  it("interpolates linearly between adjacent stops", () => {
    // Halfway between stops 2 and 3 (centerM - bandWidth/2 = 95) blends
    // RAMP_COLORS[2] = [140, 195, 110] and [3] = [200, 200, 130] 50/50.
    const c = colorAt(95, 100, 10);
    expect(c[0]).toBeCloseTo((140 + 200) / 2, 6);
    expect(c[1]).toBeCloseTo((195 + 200) / 2, 6);
    expect(c[2]).toBeCloseTo((110 + 130) / 2, 6);
  });

  it("hits the first ramp color at centerM - 3*bandWidth", () => {
    expect(colorAt(100 - 3 * 10, 100, 10)).toEqual(RAMP_COLORS[0]);
  });

  it("hits the last ramp color at centerM + 3*bandWidth", () => {
    expect(colorAt(100 + 3 * 10, 100, 10)).toEqual(
      RAMP_COLORS[RAMP_COLORS.length - 1],
    );
  });
});

describe("suggestHypsometricBandWidth", () => {
  it("divides the range evenly across the 6 intervals between 7 stops", () => {
    expect(suggestHypsometricBandWidth(0, 60)).toBeCloseTo(10, 10);
  });

  it("handles a wide range", () => {
    expect(suggestHypsometricBandWidth(-500, 5500)).toBeCloseTo(1000, 10);
  });

  it("guards a zero range by clamping the range to 1 (returns 1/6)", () => {
    // Documented behavior: when max - min <= 1, the function returns 1/6.
    // Callers (e.g. the slider) clamp to >= 1 themselves.
    expect(suggestHypsometricBandWidth(0, 0)).toBeCloseTo(1 / 6, 10);
    expect(suggestHypsometricBandWidth(50, 50)).toBeCloseTo(1 / 6, 10);
  });
});
