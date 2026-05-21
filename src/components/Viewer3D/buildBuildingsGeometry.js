import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function buildBuildingsGeometry(
  buildings,
  { project, sampleElevation, verticalScale },
) {
  if (!buildings || buildings.length === 0) return null;

  const parts = [];

  for (const b of buildings) {
    if (b.coords.length < 3) continue;

    const points = b.coords.map(({ lat, lon }) => project(lon, lat));

    // ExtrudeGeometry uses 2D shape in XY plane extruded along +Z.
    // After rotateX(-π/2) Y becomes -Z and Z becomes Y, so we feed (x, -z).
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, -points[0].z);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, -points[i].z);
    }

    const heightUnits = b.height * verticalScale;
    let geom;
    try {
      geom = new THREE.ExtrudeGeometry(shape, {
        depth: heightUnits,
        bevelEnabled: false,
      });
    } catch {
      continue; // skip pathological footprints
    }
    geom.rotateX(-Math.PI / 2);

    // Anchor base to the lowest terrain elevation under the footprint
    let baseElev = Infinity;
    for (const { lat, lon } of b.coords) {
      const e = sampleElevation(lon, lat);
      if (e < baseElev) baseElev = e;
    }
    if (!Number.isFinite(baseElev)) baseElev = 0;
    geom.translate(0, baseElev * verticalScale, 0);

    parts.push(geom);
  }

  if (parts.length === 0) return null;

  try {
    const merged = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    merged.computeVertexNormals();
    return merged;
  } catch (e) {
    console.warn("Could not merge building geometries:", e);
    parts.forEach((g) => g.dispose());
    return null;
  }
}
