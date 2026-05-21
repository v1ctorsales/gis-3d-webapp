import * as THREE from "three";
import { clipPolygonToBbox } from "../../utils/geo";

function estimateWaterElevation(polygon, sampleElevation) {
  let minElev = Infinity;
  const STEPS_PER_EDGE = 4;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const ev = sampleElevation(a.lon, a.lat);
    if (Number.isFinite(ev) && ev < minElev) minElev = ev;
    for (let s = 1; s < STEPS_PER_EDGE; s++) {
      const t = s / STEPS_PER_EDGE;
      const lon = a.lon + (b.lon - a.lon) * t;
      const lat = a.lat + (b.lat - a.lat) * t;
      const e = sampleElevation(lon, lat);
      if (Number.isFinite(e) && e < minElev) minElev = e;
    }
  }
  return Number.isFinite(minElev) ? minElev : 0;
}

/**
 * Returns an array of { geometry, elevation } parts (one per polygon), or null.
 * Geometry is kept in XY plane (Z=0) — the renderer applies rotateX(-π/2) and
 * positions the mesh at world Y = elevation.
 */
export function buildInlandWaterGeometry(
  polygons,
  { project, sampleElevation, verticalScale, bbox },
) {
  if (!polygons || polygons.length === 0) return null;

  const parts = [];

  for (const p of polygons) {
    if (p.coords.length < 3) continue;

    const clippedOuter = clipPolygonToBbox(p.coords, bbox);
    if (clippedOuter.length < 3) continue;

    const clippedHoles = (p.holes || [])
      .map((h) => clipPolygonToBbox(h, bbox))
      .filter((h) => h.length >= 3);

    const points = clippedOuter.map(({ lat, lon }) => project(lon, lat));
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, -points[0].z);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, -points[i].z);
    }
    for (const hole of clippedHoles) {
      const hp = hole.map(({ lat, lon }) => project(lon, lat));
      const path = new THREE.Path();
      path.moveTo(hp[0].x, -hp[0].z);
      for (let i = 1; i < hp.length; i++) {
        path.lineTo(hp[i].x, -hp[i].z);
      }
      shape.holes.push(path);
    }

    let geom;
    try {
      geom = new THREE.ShapeGeometry(shape);
    } catch {
      continue;
    }

    const waterElev = estimateWaterElevation(clippedOuter, sampleElevation);
    parts.push({
      geometry: geom,
      elevation: waterElev * verticalScale + 0.2,
    });
  }

  return parts.length > 0 ? parts : null;
}

/**
 * Build a subdivided sea-plane geometry clipped to areas where
 * elevation <= threshold. Returns geometry in XY plane (Z=0) for
 * the mesh to rotate horizontal.
 */
export function buildClippedSeaGeometry(
  sceneWidth,
  sceneDepth,
  segments,
  elevationSampler,
  threshold = 0,
) {
  const dx = sceneWidth / segments;
  const dy = sceneDepth / segments;
  const startX = -sceneWidth / 2;
  const startY = -sceneDepth / 2;

  const positions = [];
  const uvs = [];
  const indices = [];
  const vertexIndex = new Array((segments + 1) * (segments + 1)).fill(-1);

  function addVertex(c, r) {
    const key = r * (segments + 1) + c;
    if (vertexIndex[key] !== -1) return vertexIndex[key];
    const x = startX + c * dx;
    const y = startY + r * dy;
    const idx = positions.length / 3;
    positions.push(x, y, 0);
    uvs.push(c / segments, 1 - r / segments);
    vertexIndex[key] = idx;
    return idx;
  }

  for (let r = 0; r < segments; r++) {
    for (let c = 0; c < segments; c++) {
      const cx = startX + (c + 0.5) * dx;
      const cy = startY + (r + 0.5) * dy;
      const elev = elevationSampler(cx, cy);
      if (elev <= threshold) {
        const a = addVertex(c, r);
        const b = addVertex(c + 1, r);
        const d = addVertex(c, r + 1);
        const e = addVertex(c + 1, r + 1);
        indices.push(a, d, b, b, d, e);
      }
    }
  }

  if (positions.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}
