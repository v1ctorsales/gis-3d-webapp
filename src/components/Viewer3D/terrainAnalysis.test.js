import { describe, it, expect } from "vitest";
import {
  computeSlope,
  computeAspect,
  computeHillshade,
  smoothHeightmap,
  suggestHillshadeZFactor,
} from "./terrainAnalysis";

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

describe("smoothHeightmap", () => {
  it("is a no-op on a flat plate", () => {
    const hm = flat(5, 5, 100);
    const sm = smoothHeightmap(hm);
    for (let i = 0; i < sm.elevations.length; i++) {
      expect(sm.elevations[i]).toBeCloseTo(100, 6);
    }
  });

  it("returns a new typed array (does not mutate input)", () => {
    const hm = flat(4, 4, 50);
    const sm = smoothHeightmap(hm);
    expect(sm.elevations).not.toBe(hm.elevations);
    expect(sm.width).toBe(4);
    expect(sm.height).toBe(4);
    expect(sm.elevations.length).toBe(16);
  });

  it("reproduces a linear ramp at interior cells", () => {
    // A 3×3 box blur on a linear field is exact at interior cells: the
    // 8 neighbours of the centre sum to 8 * centre.
    const hm = ramp(4, 4, 1); // values = column index
    const sm = smoothHeightmap(hm);
    // Interior cells are (c=1, r=1), (c=2, r=1), (c=1, r=2), (c=2, r=2).
    for (const [c, r] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ]) {
      expect(sm.elevations[r * 4 + c]).toBeCloseTo(c, 6);
    }
  });

  it("attenuates an impulse to 1/9 of its value", () => {
    // Single high pixel at (2, 2) in a 5×5 flat-zero field.
    const elevations = new Float32Array(25);
    elevations[2 * 5 + 2] = 9; // value 9 so 9/9 = 1 — easy to compare
    const sm = smoothHeightmap({ elevations, width: 5, height: 5 });
    expect(sm.elevations[2 * 5 + 2]).toBeCloseTo(1, 6);
    // And the eight neighbours each get 9/9 = 1 (1 contribution from the centre).
    for (const [c, r] of [
      [1, 1],
      [2, 1],
      [3, 1],
      [1, 2],
      [3, 2],
      [1, 3],
      [2, 3],
      [3, 3],
    ]) {
      expect(sm.elevations[r * 5 + c]).toBeCloseTo(1, 6);
    }
  });

  it("preserves heightmap metadata (passes through extra fields)", () => {
    const sm = smoothHeightmap({
      elevations: new Float32Array(9),
      width: 3,
      height: 3,
      minElevation: 0,
      maxElevation: 100,
      zoom: 12,
    });
    expect(sm.minElevation).toBe(0);
    expect(sm.maxElevation).toBe(100);
    expect(sm.zoom).toBe(12);
  });
});

describe("computeAspect — flat-cell NaN threshold", () => {
  it("emits NaN for very gentle slopes well below 1°", () => {
    // ramp(5,5,0.001) at pixelSize=100 → slope ≈ atan(0.001/100) ≈ 5.7e-4° ≪ 1°.
    const aspect = computeAspect(ramp(5, 5, 0.001), 100);
    expect(Number.isNaN(aspect[2 * 5 + 2])).toBe(true);
  });

  it("emits NaN for slopes just below the 1° threshold", () => {
    // ramp(5,5,1) at pixelSize=100 → slope = atan(0.01) ≈ 0.573° < 1°.
    const aspect = computeAspect(ramp(5, 5, 1), 100);
    expect(Number.isNaN(aspect[2 * 5 + 2])).toBe(true);
  });

  it("emits a real aspect value when slope is comfortably above 1°", () => {
    // ramp(5,5,100) at pixelSize=100 → slope = atan(1) = 45° ≫ 1°.
    const aspect = computeAspect(ramp(5, 5, 100), 100);
    const v = aspect[2 * 5 + 2];
    expect(Number.isNaN(v)).toBe(false);
    // East-rising ramp → faces west ≈ 3π/2.
    expect(v).toBeCloseTo((3 * Math.PI) / 2, 2);
  });
});

describe("suggestHillshadeZFactor", () => {
  it("returns 20 (max) for a perfectly flat heightmap", () => {
    expect(suggestHillshadeZFactor(flat(8, 8, 100), 10)).toBe(20);
  });

  it("returns a small value for a steep ramp", () => {
    // ramp(8,8,1) at pixelSize=10 → slopes ≈ atan(0.1) ≈ 5.71°. Target 30°.
    // tan(30)/tan(5.71) ≈ 0.577 / 0.1 ≈ 5.77, rounded to 6.0 (nearest 0.5).
    const z = suggestHillshadeZFactor(ramp(8, 8, 1), 10);
    expect(z).toBeGreaterThanOrEqual(3);
    expect(z).toBeLessThanOrEqual(8);
  });

  it("always returns a value in [1, 20] that is a multiple of 0.5", () => {
    const cases = [
      [flat(5, 5, 0), 10],
      [flat(5, 5, 1000), 10],
      [ramp(8, 8, 0.01), 10],
      [ramp(8, 8, 1), 10],
      [ramp(8, 8, 10), 1],
      [ramp(16, 16, 5), 5],
    ];
    for (const [hm, ps] of cases) {
      const z = suggestHillshadeZFactor(hm, ps);
      expect(z).toBeGreaterThanOrEqual(1);
      expect(z).toBeLessThanOrEqual(20);
      // Multiple of 0.5: 2*z should be an integer.
      expect(Math.abs(z * 2 - Math.round(z * 2))).toBeLessThan(1e-9);
    }
  });
});
