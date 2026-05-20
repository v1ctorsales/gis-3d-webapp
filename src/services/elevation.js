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

  const elevations = new Float32Array(width * height);
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < elevations.length; i++) {
    const v = elevationSource.decode(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    elevations[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
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
