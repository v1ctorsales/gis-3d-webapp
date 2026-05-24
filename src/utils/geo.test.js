import { describe, expect, it } from "vitest";
import { clipLineToBbox } from "./geo";

const BBOX = { west: 0, south: 0, east: 10, north: 10 };
const pt = (lon, lat) => ({ lon, lat });
// Format helper: turn sub-linestrings into [[lon,lat], [lon,lat]] for terse assertions.
const toPairs = (line) => line.map(({ lon, lat }) => [lon, lat]);

describe("clipLineToBbox", () => {
  it("returns [] for empty or single-point input", () => {
    expect(clipLineToBbox([], BBOX)).toEqual([]);
    expect(clipLineToBbox([pt(5, 5)], BBOX)).toEqual([]);
  });

  it("returns the polyline unchanged when fully inside", () => {
    const line = [pt(1, 1), pt(2, 3), pt(5, 5)];
    const out = clipLineToBbox(line, BBOX);
    expect(out).toHaveLength(1);
    expect(toPairs(out[0])).toEqual([
      [1, 1],
      [2, 3],
      [5, 5],
    ]);
  });

  it("returns [] when the polyline lies entirely outside one side", () => {
    const line = [pt(-3, 5), pt(-1, 5), pt(-1, 8)];
    expect(clipLineToBbox(line, BBOX)).toEqual([]);
  });

  it("clamps a polyline that exits across one edge", () => {
    // Crosses the east edge between (8,5) and (15,5).
    const line = [pt(2, 5), pt(8, 5), pt(15, 5)];
    const out = clipLineToBbox(line, BBOX);
    expect(out).toHaveLength(1);
    expect(toPairs(out[0])).toEqual([
      [2, 5],
      [8, 5],
      [10, 5],
    ]);
  });

  it("clamps a polyline that enters across one edge", () => {
    const line = [pt(-5, 5), pt(2, 5), pt(8, 5)];
    const out = clipLineToBbox(line, BBOX);
    expect(out).toHaveLength(1);
    expect(toPairs(out[0])).toEqual([
      [0, 5],
      [2, 5],
      [8, 5],
    ]);
  });

  it("handles a single segment that crosses the entire bbox", () => {
    // From (-5, 5) to (15, 5) — passes through both west and east edges.
    const line = [pt(-5, 5), pt(15, 5)];
    const out = clipLineToBbox(line, BBOX);
    expect(out).toHaveLength(1);
    expect(toPairs(out[0])).toEqual([
      [0, 5],
      [10, 5],
    ]);
  });

  it("splits a polyline that exits and re-enters into multiple sub-lines", () => {
    // Inside → outside (east) → outside → inside again.
    const line = [pt(2, 5), pt(15, 5), pt(15, 8), pt(2, 8)];
    const out = clipLineToBbox(line, BBOX);
    expect(out).toHaveLength(2);
    expect(toPairs(out[0])).toEqual([
      [2, 5],
      [10, 5],
    ]);
    expect(toPairs(out[1])).toEqual([
      [10, 8],
      [2, 8],
    ]);
  });

  it("clips a diagonal segment crossing a corner", () => {
    // (-5,-5) to (5,5): enters at (0,0).
    const line = [pt(-5, -5), pt(5, 5)];
    const out = clipLineToBbox(line, BBOX);
    expect(out).toHaveLength(1);
    expect(toPairs(out[0])).toEqual([
      [0, 0],
      [5, 5],
    ]);
  });

  it("ignores vertices exactly on the boundary", () => {
    const line = [pt(0, 0), pt(10, 10)];
    const out = clipLineToBbox(line, BBOX);
    expect(out).toHaveLength(1);
    expect(toPairs(out[0])).toEqual([
      [0, 0],
      [10, 10],
    ]);
  });

  it("clips a long Colorado-River-shaped polyline that pokes out twice", () => {
    // Enters bbox, meanders inside, exits east, re-enters, exits south.
    const line = [
      pt(-2, 4), // outside west
      pt(3, 4),
      pt(7, 6),
      pt(15, 6), // exits east between 7,6 and 15,6
      pt(15, 2),
      pt(5, 2), // re-enters east between 15,2 and 5,2
      pt(5, -3), // exits south between 5,2 and 5,-3
    ];
    const out = clipLineToBbox(line, BBOX);
    expect(out).toHaveLength(2);
    // First subline: (0,4) → (3,4) → (7,6) → (10,6).
    expect(toPairs(out[0])).toEqual([
      [0, 4],
      [3, 4],
      [7, 6],
      [10, 6],
    ]);
    // Second subline: (10,2) → (5,2) → (5,0).
    expect(toPairs(out[1])).toEqual([
      [10, 2],
      [5, 2],
      [5, 0],
    ]);
  });
});
