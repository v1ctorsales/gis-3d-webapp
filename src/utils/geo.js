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
