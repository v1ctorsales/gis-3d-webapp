const TILE_SIZE = 256;

function lonToTileX(lon, z) {
  return ((lon + 180) / 360) * Math.pow(2, z);
}

function latToTileY(lat, z) {
  const radLat = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(radLat) + 1 / Math.cos(radLat)) / Math.PI) / 2) *
    Math.pow(2, z)
  );
}

/**
 * Choose a zoom so the bbox is roughly `targetTilesAcross` tiles wide.
 * Higher zoom = more detail but more tile fetches. Capped to z14.
 */
export function chooseZoom(bbox, targetTilesAcross = 4) {
  const lonSpan = Math.abs(bbox.east - bbox.west);
  const z = Math.log2((targetTilesAcross * 360) / lonSpan);
  return Math.max(0, Math.min(14, Math.round(z)));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load tile: ${url}`));
    img.src = url;
  });
}

/**
 * Fetch slippy-map raster tiles covering `bbox` at `zoom`, stitch them
 * into a single canvas, and crop to the exact bbox bounds.
 *
 * urlTemplate must contain {z}, {x}, {y}.
 */
export async function fetchBboxAsCanvas({ bbox, zoom, urlTemplate }) {
  const xMinF = lonToTileX(bbox.west, zoom);
  const xMaxF = lonToTileX(bbox.east, zoom);
  const yMinF = latToTileY(bbox.north, zoom); // north = smaller Y
  const yMaxF = latToTileY(bbox.south, zoom);

  const txMin = Math.floor(xMinF);
  const txMax = Math.floor(xMaxF);
  const tyMin = Math.floor(yMinF);
  const tyMax = Math.floor(yMaxF);

  const tilesAcross = txMax - txMin + 1;
  const tilesDown = tyMax - tyMin + 1;

  const stitched = document.createElement("canvas");
  stitched.width = tilesAcross * TILE_SIZE;
  stitched.height = tilesDown * TILE_SIZE;
  const ctx = stitched.getContext("2d");

  const tasks = [];
  for (let ty = tyMin; ty <= tyMax; ty++) {
    for (let tx = txMin; tx <= txMax; tx++) {
      const url = urlTemplate
        .replace("{z}", String(zoom))
        .replace("{x}", String(tx))
        .replace("{y}", String(ty));
      tasks.push(
        loadImage(url).then((img) => {
          ctx.drawImage(
            img,
            (tx - txMin) * TILE_SIZE,
            (ty - tyMin) * TILE_SIZE,
          );
        }),
      );
    }
  }
  await Promise.all(tasks);

  const cropX = (xMinF - txMin) * TILE_SIZE;
  const cropY = (yMinF - tyMin) * TILE_SIZE;
  const cropW = (xMaxF - xMinF) * TILE_SIZE;
  const cropH = (yMaxF - yMinF) * TILE_SIZE;

  const cropped = document.createElement("canvas");
  cropped.width = Math.max(1, Math.round(cropW));
  cropped.height = Math.max(1, Math.round(cropH));
  cropped
    .getContext("2d")
    .drawImage(
      stitched,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      cropped.width,
      cropped.height,
    );

  return cropped;
}
