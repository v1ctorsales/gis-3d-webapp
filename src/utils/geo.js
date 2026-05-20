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
