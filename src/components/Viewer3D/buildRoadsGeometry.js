import * as THREE from "three";

const ROAD_WIDTHS = {
  motorway: 12,
  trunk: 11,
  primary: 9,
  secondary: 7,
  tertiary: 6,
  unclassified: 5,
  residential: 5,
  service: 4,
  motorway_link: 8,
  trunk_link: 7,
  primary_link: 6,
  secondary_link: 5,
  tertiary_link: 4,
  pedestrian: 4,
  living_street: 4,
  footway: 2,
  path: 2,
  cycleway: 2.5,
  track: 3,
};
const DEFAULT_WIDTH = 3;
const Y_OFFSET_METERS = 0.5;

export function buildRoadsGeometry(
  roads,
  { project, sampleElevation, verticalScale, metersToUnits },
) {
  const positions = [];
  const indices = [];
  let base = 0;

  for (const road of roads) {
    if (road.tunnel) continue;

    const widthMeters = ROAD_WIDTHS[road.type] ?? DEFAULT_WIDTH;
    const halfW = (widthMeters / 2) * metersToUnits;

    const extraLift = road.bridge ? 4 : 0;

    const points = [];
    for (const [lon, lat] of road.coords) {
      const { x, z } = project(lon, lat);
      const elevM = sampleElevation?.(lon, lat) ?? 0;
      const y = (elevM + Y_OFFSET_METERS + extraLift) * verticalScale;
      points.push({ x, y, z });
    }
    if (points.length < 2) continue;

    for (let i = 0; i < points.length; i++) {
      let dx, dz;
      if (i === 0) {
        dx = points[1].x - points[0].x;
        dz = points[1].z - points[0].z;
      } else if (i === points.length - 1) {
        dx = points[i].x - points[i - 1].x;
        dz = points[i].z - points[i - 1].z;
      } else {
        const ax = points[i].x - points[i - 1].x;
        const az = points[i].z - points[i - 1].z;
        const bx = points[i + 1].x - points[i].x;
        const bz = points[i + 1].z - points[i].z;
        const la = Math.hypot(ax, az) || 1;
        const lb = Math.hypot(bx, bz) || 1;
        dx = ax / la + bx / lb;
        dz = az / la + bz / lb;
      }
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;

      const perpX = -dz * halfW;
      const perpZ = dx * halfW;

      const p = points[i];
      positions.push(p.x + perpX, p.y, p.z + perpZ);
      positions.push(p.x - perpX, p.y, p.z - perpZ);
    }

    for (let i = 0; i < points.length - 1; i++) {
      const Li = base + 2 * i;
      const Ri = base + 2 * i + 1;
      const Lj = base + 2 * (i + 1);
      const Rj = base + 2 * (i + 1) + 1;
      indices.push(Li, Lj, Rj);
      indices.push(Li, Rj, Ri);
    }
    base += points.length * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
