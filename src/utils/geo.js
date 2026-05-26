/**
 * Compute a bounding box {west, south, east, north} from a GeoJSON Polygon
 * feature produced by Terra Draw.
 */
export function polygonToBbox(feature) {
  const ring = feature.geometry.coordinates[0];
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const [lng, lat] of ring) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }

  return { west, south, east, north };
}

export function bboxCenter(bbox) {
  return {
    longitude: (bbox.west + bbox.east) / 2,
    latitude: (bbox.south + bbox.north) / 2,
  };
}

/**
 * Approximate the zoom level that frames the bbox.
 * Good enough for initial camera placement; the user can refine interactively.
 */
export function bboxToZoom(bbox) {
  const lonSpan = Math.abs(bbox.east - bbox.west);
  const latSpan = Math.abs(bbox.north - bbox.south);
  const span = Math.max(lonSpan, latSpan, 0.0001);
  const zoom = Math.log2(360 / span) - 0.5;
  return Math.max(2, Math.min(15, zoom));
}

const EARTH_RADIUS_M = 6378137;

export const MAX_AREA_KM2 = 100;

const toRad = (deg) => (deg * Math.PI) / 180;

export function computeAreaKm2({ west, south, east, north }) {
  const midLat = (north + south) / 2;
  const widthM = toRad(east - west) * EARTH_RADIUS_M * Math.cos(toRad(midLat));
  const heightM = toRad(north - south) * EARTH_RADIUS_M;
  return Math.abs(widthM * heightM) / 1_000_000;
}

/**
 * Build a projector from geo (lon, lat) to scene XZ coordinates,
 * using the same transformation as buildTerrainGeometry.
 */
export function makeProject(bbox, scale) {
  const meanLat = (((bbox.north + bbox.south) / 2) * Math.PI) / 180;
  const sceneWidth = scale.widthM * scale.metersToUnits;
  const sceneDepth = scale.depthM * scale.metersToUnits;

  return (lon, lat) => {
    const xM =
      (lon - bbox.west) * EARTH_RADIUS_M * Math.cos(meanLat) * (Math.PI / 180);
    const zM = (bbox.north - lat) * EARTH_RADIUS_M * (Math.PI / 180);
    return {
      x: xM * scale.metersToUnits - sceneWidth / 2,
      z: zM * scale.metersToUnits - sceneDepth / 2,
    };
  };
}

/**
 * Bilinear interpolation in heightmap pixel coordinates. Out-of-range inputs
 * are clamped to the edge so callers don't have to special-case boundaries.
 *
 * @param {{elevations: ArrayLike<number>, width: number, height: number}} hm
 * @param {number} x  pixel-space x (column, 0..width-1)
 * @param {number} y  pixel-space y (row,    0..height-1)
 */
export function bilinear(hm, x, y) {
  const { elevations, width: W, height: H } = hm;
  const cx = Math.max(0, Math.min(W - 1, x));
  const cy = Math.max(0, Math.min(H - 1, y));
  const x0 = Math.min(Math.floor(cx), W - 2);
  const x1 = x0 + 1;
  const y0 = Math.min(Math.floor(cy), H - 2);
  const y1 = y0 + 1;
  const fx = cx - x0, fy = cy - y0;
  const v00 = elevations[y0 * W + x0];
  const v10 = elevations[y0 * W + x1];
  const v01 = elevations[y1 * W + x0];
  const v11 = elevations[y1 * W + x1];
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
}

/**
 * Build a sampler that returns the elevation (in meters) at any (lon, lat)
 * inside the bbox, using nearest-neighbor lookup in the heightmap.
 */
export function makeSampleElevation(heightmap, bbox) {
  const { elevations, width, height } = heightmap;
  return (lon, lat) => {
    const u = (lon - bbox.west) / (bbox.east - bbox.west);
    const v = (bbox.north - lat) / (bbox.north - bbox.south);
    const px = Math.max(0, Math.min(width - 1, Math.round(u * (width - 1))));
    const py = Math.max(0, Math.min(height - 1, Math.round(v * (height - 1))));
    return elevations[py * width + px];
  };
}

/**
 * Clip a polygon (array of {lat, lon}) against an axis-aligned bbox using
 * the Sutherland-Hodgman algorithm. Returns the clipped polygon as a new
 * array. Empty array if the polygon lies entirely outside the bbox.
 */
export function clipPolygonToBbox(polygon, bbox) {
  const clips = [
    {
      inside: (p) => p.lon >= bbox.west,
      intersect: (a, b) => intersectLon(a, b, bbox.west),
    },
    {
      inside: (p) => p.lon <= bbox.east,
      intersect: (a, b) => intersectLon(a, b, bbox.east),
    },
    {
      inside: (p) => p.lat >= bbox.south,
      intersect: (a, b) => intersectLat(a, b, bbox.south),
    },
    {
      inside: (p) => p.lat <= bbox.north,
      intersect: (a, b) => intersectLat(a, b, bbox.north),
    },
  ];

  let result = polygon;
  for (const clip of clips) {
    if (result.length === 0) break;
    const next = [];
    let prev = result[result.length - 1];
    for (const curr of result) {
      const currIn = clip.inside(curr);
      const prevIn = clip.inside(prev);
      if (currIn) {
        if (!prevIn) next.push(clip.intersect(prev, curr));
        next.push(curr);
      } else if (prevIn) {
        next.push(clip.intersect(prev, curr));
      }
      prev = curr;
    }
    result = next;
  }
  return result;
}

/**
 * Liang-Barsky parametric clip of a single segment against an axis-aligned
 * bbox. Returns {t0, t1} where each is in [0,1], representing the portion
 * of segment p0→p1 that lies inside the bbox. Returns null when the
 * segment is entirely outside.
 */
function liangBarsky(p0, p1, bbox) {
  const dx = p1.lon - p0.lon;
  const dy = p1.lat - p0.lat;
  let t0 = 0;
  let t1 = 1;

  // For each of the four edges, accumulate the parametric window.
  // p<0 ⇒ entering the half-plane; p>0 ⇒ leaving.
  const tests = [
    [-dx, p0.lon - bbox.west], // west edge
    [dx, bbox.east - p0.lon], // east edge
    [-dy, p0.lat - bbox.south], // south edge
    [dy, bbox.north - p0.lat], // north edge
  ];

  for (const [p, q] of tests) {
    if (p === 0) {
      // Parallel to this edge; reject if starting outside.
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return { t0, t1 };
}

/**
 * Clip a polyline (array of {lat, lon}) against an axis-aligned bbox.
 * Returns an array of sub-linestrings (each itself an array of {lat, lon})
 * — a polyline that enters/exits the bbox multiple times produces multiple
 * sub-linestrings. Returns `[]` if the polyline is entirely outside.
 */
export function clipLineToBbox(coords, bbox) {
  if (!coords || coords.length < 2) return [];

  const sublines = [];
  let current = null;

  const lerp = (a, b, t) => ({
    lon: a.lon + (b.lon - a.lon) * t,
    lat: a.lat + (b.lat - a.lat) * t,
  });

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];
    const r = liangBarsky(p0, p1, bbox);

    if (!r) {
      // Segment entirely outside — close any open subline.
      if (current && current.length >= 2) sublines.push(current);
      current = null;
      continue;
    }

    const start = r.t0 > 0 ? lerp(p0, p1, r.t0) : p0;
    const end = r.t1 < 1 ? lerp(p0, p1, r.t1) : p1;

    if (!current) {
      current = [start, end];
    } else if (r.t0 > 0) {
      // Previous segment was inside and ended at its own p1 = this p0,
      // but this segment doesn't begin until `start`. That means it left
      // and re-entered the bbox at the joint vertex — close the previous
      // subline and start a new one.
      if (current.length >= 2) sublines.push(current);
      current = [start, end];
    } else {
      // This segment continues directly from the previous one: just append.
      current.push(end);
    }

    if (r.t1 < 1) {
      // Segment exited the bbox before reaching p1 — close the subline.
      if (current.length >= 2) sublines.push(current);
      current = null;
    }
  }

  if (current && current.length >= 2) sublines.push(current);
  return sublines;
}

function intersectLon(a, b, lon) {
  const t = (lon - a.lon) / (b.lon - a.lon);
  return { lon, lat: a.lat + t * (b.lat - a.lat) };
}

function intersectLat(a, b, lat) {
  const t = (lat - a.lat) / (b.lat - a.lat);
  return { lat, lon: a.lon + t * (b.lon - a.lon) };
}

/**
 * Sampler that takes scene-space (worldX, worldZ) and returns terrain
 * elevation in meters. Used to clip the sea plane against the coastline.
 */
export function makeSceneXZElevationSampler(heightmap, bounds) {
  const { sceneWidth, sceneDepth } = bounds;
  const { elevations, width, height } = heightmap;
  return (worldX, worldZ) => {
    const u = (worldX + sceneWidth / 2) / sceneWidth;
    const v = (worldZ + sceneDepth / 2) / sceneDepth;
    const cu = Math.max(0, Math.min(1, u));
    const cv = Math.max(0, Math.min(1, v));
    const px = Math.round(cu * (width - 1));
    const py = Math.round(cv * (height - 1));
    return elevations[py * width + px];
  };
}
