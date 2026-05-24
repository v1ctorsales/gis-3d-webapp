# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server with HMR.
- `npm run build` — production bundle to `dist/`.
- `npm run preview` — serve the built bundle locally.
- `npm run lint` — ESLint (flat config in `eslint.config.js`).
- `npm test` — run Vitest once (jsdom env).
- `npm run test:watch` — Vitest in watch mode.
- Single test file: `npx vitest run src/components/Viewer3D/marchingSquares.test.js`.
- Single test by name: `npx vitest run -t "fragment of test name"`.

JS/JSX only — there is no TypeScript. Vitest picks up `src/**/*.test.{js,jsx}`.

## High-level architecture

Two-screen SPA driven by [App.jsx](src/App.jsx): a 2D map for selecting an area of interest, then a 3D scene built from that bbox.

### Screen 1 — AOI selection ([components/Map](src/components/Map), [components/SelectionPanel](src/components/SelectionPanel))

MapLibre GL renders Esri satellite + CARTO labels. [Terra Draw](https://github.com/JamesLMilner/terra-draw) (via `terra-draw-maplibre-gl-adapter`) provides a single-rectangle drawing mode. [`polygonToBbox`](src/utils/geo.js) converts the GeoJSON polygon to `{west, south, east, north}`. The panel enforces a `MAX_AREA_KM2` cap before allowing confirmation.

### Screen 2 — 3D viewer ([components/Viewer3D/Viewer3D.jsx](src/components/Viewer3D/Viewer3D.jsx))

A `@react-three/fiber` canvas. The viewer is a big orchestrator that owns terrain state and lazily-loaded OSM state per bbox. The data pipeline:

1. **Fetch raster tiles** ([services/tiles.js](src/services/tiles.js)) — `chooseZoom` picks a slippy-map zoom level for the bbox; `fetchBboxAsCanvas` stitches and crops the tile grid to one canvas.
2. **Elevation** ([services/elevation.js](src/services/elevation.js)) — AWS Terrarium PNGs decoded to a `Float32Array` of meters; a 5×5 median **despike** removes upward SRTM artifacts (downward outliers are preserved as real). Imagery comes from Esri World Imagery.
3. **Terrain mesh** ([buildTerrainGeometry.js](src/components/Viewer3D/buildTerrainGeometry.js)) — subsamples the heightmap (capped at `MAX_MESH_RES` per side), builds a closed solid: top displaced surface (material 0) + side walls + flat bottom (material 1). Returns `{geometry, bounds, scale}`. **`scale.metersToUnits` and `scale.verticalScale` are the load-bearing numbers** — every overlay (buildings, roads, water, contours, flood plane, profile) projects through them so all features sit in the same scene space.
4. **OSM overlays** ([services/osm.js](src/services/osm.js), [api/overpass.js](api/overpass.js)) — buildings, water (ways + multipolygon relations with stitched rings + holes), and roads come from Overpass. Each layer is lazy (fetched only when its toggle is on) and per-bbox memoized via a `useRef` cache. In dev it hits `overpass.private.coffee` directly; in prod it goes through `/api/overpass`, a Vercel edge function that tries five mirrors with timeouts and edge-caches the response. Override with `VITE_OVERPASS_URL`.
5. **Surface analytics** ([terrainAnalysis.js](src/components/Viewer3D/terrainAnalysis.js), [surfaceTextures.js](src/components/Viewer3D/surfaceTextures.js), [hypsometric.js](src/components/Viewer3D/hypsometric.js)) — slope and aspect via Horn's 3×3, hillshade via the ESRI formula, hypsometric tint — all rendered to canvases swapped in as the terrain texture.
6. **Vector overlays** — buildings extrude OSM footprints; water uses `THREE.Shape` with stitched holes and sits at the polygon's minimum sampled elevation; roads are projected polylines; contours use [marchingSquares.js](src/components/Viewer3D/marchingSquares.js) at user-selected spacing.
7. **Tools** — flood "bathtub" inundation ([floodAnalysis.js](src/components/Viewer3D/floodAnalysis.js)) renders a horizontal plane and reports area; the elevation-profile tool turns two terrain clicks into a sampled cross-section ([profileSampling.js](src/components/Viewer3D/profileSampling.js)) rendered by [ProfilePanel](src/components/ProfilePanel/ProfilePanel.jsx) as inline SVG.

### Shared geo utilities ([src/utils/geo.js](src/utils/geo.js))

`makeProject(bbox, scale)` returns a `(lon, lat) → {x, z}` projector tied to a given terrain build, using equirectangular meters scaled by `metersToUnits`. `makeSampleElevation` and `makeSceneXZElevationSampler` are nearest-neighbor heightmap samplers in geo space and scene space respectively. `bilinear` is the smooth variant used by the profile tool. `clipPolygonToBbox` is Sutherland-Hodgman for water polygons that cross the AOI boundary.

### Conventions worth knowing

- Heightmaps are passed around as `{elevations: Float32Array, width, height, minElevation, maxElevation, zoom}`. Most analytics take this shape directly.
- Geometry builders return raw `THREE.BufferGeometry`/`THREE.Shape` from plain functions; the `*.jsx` siblings (`Terrain`, `Buildings`, `Water`, `Roads`, `Contours`, `FloodPlane`, `ProfileLine`) handle materials, lighting, and disposal. Keep that split when adding overlays.
- OSM fetches are cached per stringified bbox in a `useRef` map keyed by `"${west},${south},${east},${north}"`. Follow the same pattern for new lazy layers.
- The viewer reacts to bbox changes via a setState-during-render trick (`if (trackedBbox !== bbox) { setTrackedBbox(...); setTerrain({status: "loading"}) }`) — this is intentional for React 19 and avoids a stale-data flash. Don't replace it with an effect.

### Tested pieces

Vitest covers the pure geometry/analysis modules: `marchingSquares`, `floodAnalysis`, `terrainAnalysis`, `profileSampling`. UI components and three.js scenes are not unit-tested — verify those by running `npm run dev`.
