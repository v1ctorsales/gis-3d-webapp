import * as THREE from "three";

const SCENE_SIZE = 200; // Longest horizontal side in scene units
const MAX_MESH_RES = 200; // Cap mesh subdivisions per side
const EARTH_RADIUS_M = 6378137;
const SEA_FLOOR_CLAMP_M = -50;

function bboxSizeMeters(bbox) {
  const latSpanRad = ((bbox.north - bbox.south) * Math.PI) / 180;
  const lonSpanRad = ((bbox.east - bbox.west) * Math.PI) / 180;
  const meanLat = (((bbox.north + bbox.south) / 2) * Math.PI) / 180;
  return {
    widthM: lonSpanRad * EARTH_RADIUS_M * Math.cos(meanLat),
    depthM: latSpanRad * EARTH_RADIUS_M,
  };
}

/**
 * Build a closed solid: heightmap-displaced top surface (material 0),
 * vertical side walls and flat bottom (material 1).
 *
 * Returns { geometry, bounds, scale } where `scale` is the meters→scene
 * unit factor — useful later for projecting OSM features into the same space.
 */
export function buildTerrainGeometry(heightmap, bbox, exaggeration = 2) {
  const { elevations, width, height, minElevation, maxElevation } = heightmap;
  const displayMin = Math.max(minElevation, SEA_FLOOR_CLAMP_M);

  // Subsample so the mesh stays well under MAX_MESH_RES per side
  const stride = Math.max(1, Math.ceil(Math.max(width, height) / MAX_MESH_RES));
  const cols = Math.floor(width / stride);
  const rows = Math.floor(height / stride);

  const { widthM, depthM } = bboxSizeMeters(bbox);
  const longestM = Math.max(widthM, depthM);
  const metersToUnits = SCENE_SIZE / longestM;
  const verticalScale = metersToUnits * exaggeration;

  const sceneWidth = widthM * metersToUnits;
  const sceneDepth = depthM * metersToUnits;
  const stepX = sceneWidth / (cols - 1);
  const stepZ = sceneDepth / (rows - 1);
  const startX = -sceneWidth / 2;
  const startZ = -sceneDepth / 2;

  const elevRange = maxElevation - displayMin;
  const baseDepthM = Math.min(Math.max(elevRange * 0.2, 50), 300);
  const baseY = (displayMin - baseDepthM) * verticalScale;

  const positions = [];
  const uvs = [];
  const indices = [];

  // --- Top surface vertices ---
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const srcX = c * stride;
      const srcY = r * stride;
      const elev = Math.max(elevations[srcY * width + srcX], SEA_FLOOR_CLAMP_M);

      positions.push(
        startX + c * stepX,
        elev * verticalScale,
        startZ + r * stepZ,
      );
      uvs.push(c / (cols - 1), 1 - r / (rows - 1));
    }
  }

  // --- Top surface indices ---
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = r * cols + c + 1;
      const d = (r + 1) * cols + c;
      const e = (r + 1) * cols + c + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const topIndexCount = indices.length;

  // --- Perimeter bottom vertices (lazy added, cached) ---
  const bottomMap = new Map();
  const addBottom = (c, r) => {
    const key = `${c},${r}`;
    if (bottomMap.has(key)) return bottomMap.get(key);
    const idx = positions.length / 3;
    positions.push(startX + c * stepX, baseY, startZ + r * stepZ);
    uvs.push(0, 0); // unused (different material)
    bottomMap.set(key, idx);
    return idx;
  };

  // --- Wall: north (r=0, faces -Z) ---
  for (let c = 0; c < cols - 1; c++) {
    const t0 = c;
    const t1 = c + 1;
    const b0 = addBottom(c, 0);
    const b1 = addBottom(c + 1, 0);
    indices.push(t0, t1, b0, b0, t1, b1);
  }
  // --- Wall: south (r=rows-1, faces +Z) ---
  for (let c = 0; c < cols - 1; c++) {
    const r = rows - 1;
    const t0 = r * cols + c;
    const t1 = r * cols + c + 1;
    const b0 = addBottom(c, r);
    const b1 = addBottom(c + 1, r);
    indices.push(t0, b0, t1, t1, b0, b1);
  }
  // --- Wall: west (c=0, faces -X) ---
  for (let r = 0; r < rows - 1; r++) {
    const t0 = r * cols;
    const t1 = (r + 1) * cols;
    const b0 = addBottom(0, r);
    const b1 = addBottom(0, r + 1);
    indices.push(t0, b0, t1, t1, b0, b1);
  }
  // --- Wall: east (c=cols-1, faces +X) ---
  for (let r = 0; r < rows - 1; r++) {
    const c = cols - 1;
    const t0 = r * cols + c;
    const t1 = (r + 1) * cols + c;
    const b0 = addBottom(c, r);
    const b1 = addBottom(c, r + 1);
    indices.push(t0, t1, b0, b0, t1, b1);
  }
  // --- Bottom face (faces -Y) ---
  const c00 = addBottom(0, 0);
  const c10 = addBottom(cols - 1, 0);
  const c11 = addBottom(cols - 1, rows - 1);
  const c01 = addBottom(0, rows - 1);
  indices.push(c00, c10, c11, c00, c11, c01);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  geometry.addGroup(0, topIndexCount, 0);
  geometry.addGroup(topIndexCount, indices.length - topIndexCount, 1);

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return {
    geometry,
    bounds: {
      minY: baseY,
      maxY: maxElevation * verticalScale,
      sceneWidth,
      sceneDepth,
    },
    scale: {
      metersToUnits,
      verticalScale,
      widthM,
      depthM,
    },
  };
}
