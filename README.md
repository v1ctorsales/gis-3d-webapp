# gis-3d-webapp

Browser app for picking an area on a world map and exploring it as a 3D terrain scene with optional OSM overlays (buildings, water, roads), surface analytics (hillshade, slope, aspect, hypsometric tint, contours), and interactive tools (static-flood plane, elevation-profile cross-section).

Built with React 19 + Vite, MapLibre GL + Terra Draw for selection, and Three.js via `@react-three/fiber` / `drei` for the 3D viewer.

## Data sources

- **Elevation** — AWS Terrain Tiles (Terrarium PNG), derived from SRTM / ASTER / NED / ALOS via Mapzen.
- **Satellite imagery** — Esri World Imagery.
- **Vector overlays** — OpenStreetMap via the Overpass API.

## Local development

Requires Node 20+ and npm.

```sh
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`). Draw a rectangle on the map, confirm the selection, and the 3D scene loads. Toggle overlays from the right-hand panel.

In dev the Overpass client talks directly to `overpass.private.coffee`. To override, set `VITE_OVERPASS_URL` in a `.env.local` (either a full mirror URL or a leading-slash proxy path).

## Other scripts

```sh
npm run build       # production bundle to dist/
npm run preview     # serve dist/ locally
npm run lint        # ESLint (flat config)
npm test            # Vitest, single run
npm run test:watch  # Vitest in watch mode
```

Tests live next to the modules they cover (`*.test.js`) and run under jsdom. Run a single file with `npx vitest run path/to/file.test.js`, or filter by name with `-t "substring"`.

## Deployment notes

`api/overpass.js` is a Vercel edge function that proxies Overpass requests across several mirrors and caches successful responses at the edge. In production the client posts to `/api/overpass` automatically; in other hosting environments either deploy that function or set `VITE_OVERPASS_URL` to a working mirror.
