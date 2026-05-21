import { chooseZoom, fetchBboxAsCanvas } from "./tiles";

export const elevationSource = {
  url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
  // Terrarium: elev_m = (R*256 + G + B/256) - 32768
  decode: (r, g, b) => r * 256 + g + b / 256 - 32768,
  attribution:
    "Elevation: AWS Terrain Tiles (SRTM / ASTER / NED / ALOS via Mapzen)",
};

export const textureSource = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Imagery © Esri",
};

export async function fetchElevation(bbox, { zoom } = {}) {
  const z = zoom ?? chooseZoom(bbox, 4);
  const canvas = await fetchBboxAsCanvas({
    bbox,
    zoom: z,
    urlTemplate: elevationSource.url,
  });

  const { width, height } = canvas;
  const px = canvas.getContext("2d").getImageData(0, 0, width, height).data;

  const raw = new Float32Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = elevationSource.decode(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  }

  const elevations = despike(raw, width, height);

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < elevations.length; i++) {
    if (elevations[i] < min) min = elevations[i];
    if (elevations[i] > max) max = elevations[i];
  }

  return {
    elevations,
    width,
    height,
    minElevation: min,
    maxElevation: max,
    zoom: z,
  };
}

export async function fetchSatelliteTexture(bbox, { zoom } = {}) {
  const z = zoom ?? chooseZoom(bbox, 4);
  return fetchBboxAsCanvas({
    bbox,
    zoom: z,
    urlTemplate: textureSource.url,
  });
}

/**
 * Replace upward elevation spikes with the local median of a 3×3 neighborhood.
 * Targets isolated pixels with processing artifacts in SRTM/ASTER-derived DEMs.
 * Downward outliers (sinks, depressions) are preserved — they're almost always real.
 */
function despike(elevations, width, height) {
  const radius = 2; // 5x5 neighborhood = 24 neighbors
  const threshold = 25; // meters above local median
  const cleaned = new Float32Array(elevations);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const neighbors = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            neighbors.push(elevations[ny * width + nx]);
          }
        }
      }
      neighbors.sort((a, b) => a - b);
      const median = neighbors[Math.floor(neighbors.length / 2)];
      const center = elevations[y * width + x];
      if (center - median > threshold) {
        cleaned[y * width + x] = median;
      }
    }
  }
  return cleaned;
}
