import * as THREE from "three";
import { clipLineToBbox, clipPolygonToBbox } from "../../utils/geo";

const WATERWAY_Y_LIFT_M = 0.2; // meters, lifted slightly so the ribbon sits
                               // on the canyon floor without z-fighting

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
 * Buffer OSM waterway linestrings (river/stream/canal/ditch) into a single
 * ribbon BufferGeometry. Per-vertex Y is sampled from the heightmap so the
 * ribbon follows the terrain (e.g. the Colorado River draping the Grand
 * Canyon floor). Width comes from each line's `width` field in meters.
 *
 * Returns a THREE.BufferGeometry or null when there are no usable lines.
 */
export function buildWaterwayRibbonGeometry(
  lines,
  { project, sampleElevation, verticalScale, metersToUnits, bbox },
) {
  if (!lines || lines.length === 0) return null;

  const positions = [];
  const indices = [];
  let base = 0;

  // Each input way may produce multiple sub-linestrings after clipping
  // (e.g. a river entering, leaving, and re-entering the AOI).
  const segments = [];
  for (const line of lines) {
    if (!line.coords || line.coords.length < 2) continue;
    const halfW = ((line.width ?? 5) / 2) * metersToUnits;
    const clipped = bbox ? clipLineToBbox(line.coords, bbox) : [line.coords];
    for (const sub of clipped) {
      if (sub.length >= 2) segments.push({ coords: sub, halfW });
    }
  }

  for (const seg of segments) {
    const { halfW } = seg;

    const points = [];
    for (const { lat, lon } of seg.coords) {
      const { x, z } = project(lon, lat);
      const elevM = sampleElevation?.(lon, lat) ?? 0;
      const y = (elevM + WATERWAY_Y_LIFT_M) * verticalScale;
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

  if (positions.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
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
