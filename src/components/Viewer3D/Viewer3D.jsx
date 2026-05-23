import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  fetchElevation,
  fetchSatelliteTexture,
  elevationSource,
  textureSource,
} from "../../services/elevation";
import { fetchBuildings, fetchWater, fetchRoads } from "../../services/osm";
import { buildTerrainGeometry } from "./buildTerrainGeometry";
import {
  buildHypsometricCanvas,
  suggestHypsometricBandWidth,
} from "./hypsometric";
import {
  buildSlopeCanvas,
  buildAspectCanvas,
  buildHillshadeCanvas,
} from "./surfaceTextures";
import { suggestHillshadeZFactor } from "./terrainAnalysis";
import { buildBuildingsGeometry } from "./buildBuildingsGeometry";
import { buildInlandWaterGeometry } from "./buildWaterGeometry";
import { buildRoadsGeometry } from "./buildRoadsGeometry";
import Terrain from "./Terrain";
import Buildings from "./Buildings";
import Water from "./Water";
import Roads from "./Roads";
import Contours from "./Contours";
import FloodPlane from "./FloodPlane";
import { floodStats } from "./floodAnalysis";
import ProfileLine from "./ProfileLine";
import ProfilePanel from "../ProfilePanel/ProfilePanel";
import { sampleProfile } from "./profileSampling";
import styles from "./Viewer3D.module.css";
import {
  makeProject,
  makeSampleElevation,
  makeSceneXZElevationSampler,
} from "../../utils/geo";

const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

export default function Viewer3D({ bbox, onBack }) {
  // --- Terrain data (loaded once per bbox) ---
  const [terrain, setTerrain] = useState({ status: "loading" });
  const [trackedBbox, setTrackedBbox] = useState(bbox);
  // Reset to "loading" the moment bbox changes (React 19's setState-during-render
  // pattern — keeps the lint rule happy and avoids a flash of stale data).
  if (trackedBbox !== bbox) {
    setTrackedBbox(bbox);
    setTerrain({ status: "loading" });
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchElevation(bbox), fetchSatelliteTexture(bbox)])
      .then(([heightmap, satellite]) => {
        if (cancelled) return;
        setTerrain({ status: "ready", heightmap, satellite });
      })
      .catch((err) => {
        if (cancelled) return;
        setTerrain({ status: "error", error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [bbox]);

  // --- View options ---
  const [exaggeration, setExaggeration] = useState(1);
  const [surface, setSurface] = useState("imagery"); // 'imagery' | 'hypsometric'
  const [showBuildings, setShowBuildings] = useState(false);
  const [showWater, setShowWater] = useState(false);
  const [waterOffset, setWaterOffset] = useState(0); // meters
  const [waterSettingsOpen, setWaterSettingsOpen] = useState(false);
  const [showRoads, setShowRoads] = useState(false);
  const [roads, setRoads] = useState({ status: "idle" });
  const [showContours, setShowContours] = useState(false);
  const [contourSpacing, setContourSpacing] = useState(50); // meters
  const [contourSettingsOpen, setContourSettingsOpen] = useState(false);
  const [contourColor, setContourColor] = useState("#ffffff");
  const [contourWidth, setContourWidth] = useState(2);
  const [contourOpacity, setContourOpacity] = useState(0.9);
  const [showFlood, setShowFlood] = useState(false);
  const [floodLevel, setFloodLevel] = useState(0); // meters
  const [profileTool, setProfileTool] = useState(false);
  const [profilePoints, setProfilePoints] = useState([]); // [{x,y,z}, ...] in scene coords
  const [hillshadeZ, setHillshadeZ] = useState(1);
  const [hillshadeZAuto, setHillshadeZAuto] = useState(null); // last computed auto value
  const [hypsoBandM, setHypsoBandM] = useState(50);
  const [hypsoBandAuto, setHypsoBandAuto] = useState(null);
  const roadsCacheRef = useRef({});

  // --- Derived terrain artifacts ---
  const buildResult = useMemo(() => {
    if (terrain.status !== "ready") return null;
    return buildTerrainGeometry(terrain.heightmap, bbox, exaggeration);
  }, [terrain, bbox, exaggeration]);

  const hypsometricCanvas = useMemo(() => {
    if (terrain.status !== "ready") return null;
    const center =
      (terrain.heightmap.minElevation + terrain.heightmap.maxElevation) / 2;
    return buildHypsometricCanvas(terrain.heightmap, {
      bandWidthM: hypsoBandM,
      centerM: center,
    });
  }, [terrain, hypsoBandM]);

  const pixelSizeM = useMemo(() => {
    if (terrain.status !== "ready" || !buildResult) return null;
    return buildResult.scale.widthM / terrain.heightmap.width;
  }, [terrain, buildResult]);

  const slopeCanvas = useMemo(() => {
    if (terrain.status !== "ready" || !pixelSizeM) return null;
    return buildSlopeCanvas(terrain.heightmap, pixelSizeM);
  }, [terrain, pixelSizeM]);

  const aspectCanvas = useMemo(() => {
    if (terrain.status !== "ready" || !pixelSizeM) return null;
    return buildAspectCanvas(terrain.heightmap, pixelSizeM);
  }, [terrain, pixelSizeM]);

  const hillshadeCanvas = useMemo(() => {
    if (terrain.status !== "ready" || !pixelSizeM) return null;
    return buildHillshadeCanvas(terrain.heightmap, pixelSizeM, undefined, hillshadeZ);
  }, [terrain, pixelSizeM, hillshadeZ]);

  const activeTexture = (() => {
    if (terrain.status !== "ready") return null;
    switch (surface) {
      case "imagery": return terrain.satellite;
      case "hypsometric": return hypsometricCanvas;
      case "slope": return slopeCanvas;
      case "aspect": return aspectCanvas;
      case "hillshade": return hillshadeCanvas;
      default: return terrain.satellite;
    }
  })();

  // Projector + sampler tied to current scale/heightmap
  const project = useMemo(
    () => (buildResult ? makeProject(bbox, buildResult.scale) : null),
    [bbox, buildResult],
  );
  const sampleElevation = useMemo(
    () =>
      terrain.status === "ready"
        ? makeSampleElevation(terrain.heightmap, bbox)
        : null,
    [terrain, bbox],
  );

  // --- Lazy OSM loading ---
  const [buildings, setBuildings] = useState({ status: "idle" });
  const [water, setWater] = useState({ status: "idle" });

  const buildingsCacheRef = useRef({});
  const waterCacheRef = useRef({});

  useEffect(() => {
    if (!showBuildings) return;

    const key = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
    const cached = buildingsCacheRef.current[key];
    if (cached) {
      setBuildings({ status: "ready", data: cached });
      return;
    }

    let cancelled = false;
    setBuildings({ status: "loading" });

    fetchBuildings(bbox)
      .then((data) => {
        if (cancelled) return;
        buildingsCacheRef.current[key] = data;
        setBuildings({ status: "ready", data });
      })
      .catch((err) => {
        if (cancelled) return;
        setBuildings({ status: "error", error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [showBuildings, bbox]);

  useEffect(() => {
    if (!showWater) return;

    const key = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
    const cached = waterCacheRef.current[key];
    if (cached) {
      setWater({ status: "ready", data: cached });
      return;
    }

    let cancelled = false;
    setWater({ status: "loading" });

    fetchWater(bbox)
      .then((data) => {
        if (cancelled) return;
        waterCacheRef.current[key] = data;
        setWater({ status: "ready", data });
      })
      .catch((err) => {
        if (cancelled) return;
        setWater({ status: "error", error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [showWater, bbox]);

  useEffect(() => {
    if (!showRoads) return;
    const key = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
    const cached = roadsCacheRef.current[key];
    if (cached) {
      setRoads({ status: "ready", data: cached });
      return;
    }
    let cancelled = false;
    setRoads({ status: "loading" });
    fetchRoads(bbox)
      .then((data) => {
        if (cancelled) return;
        roadsCacheRef.current[key] = data;
        setRoads({ status: "ready", data });
      })
      .catch((err) => {
        if (cancelled) return;
        setRoads({ status: "error", error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [showRoads, bbox]);

  // --- Flood level initialization ---
  // Pick a sensible default flood level (midpoint of the terrain's elevation
  // range) the first time each heightmap loads. Tracking the heightmap object
  // means we re-initialize on bbox change but not on every render.
  const [floodInitForHM, setFloodInitForHM] = useState(null);
  if (terrain.status === "ready" && floodInitForHM !== terrain.heightmap) {
    setFloodInitForHM(terrain.heightmap);
    const mid = (terrain.heightmap.minElevation + terrain.heightmap.maxElevation) / 2;
    setFloodLevel(Math.round(mid));
  }

  // Auto-pick a hillshade z-factor so the first paint has visible contrast.
  // Same pattern as floodInitForHM above.
  const [hillshadeInitForHM, setHillshadeInitForHM] = useState(null);
  if (
    terrain.status === "ready"
    && pixelSizeM
    && hillshadeInitForHM !== terrain.heightmap
  ) {
    setHillshadeInitForHM(terrain.heightmap);
    const z = suggestHillshadeZFactor(terrain.heightmap, pixelSizeM);
    setHillshadeZAuto(z);
    setHillshadeZ(z);
  }

  // Auto-stretch the hypsometric ramp to the AOI's elevation range. Same
  // setState-during-render pattern as the two blocks above.
  const [hypsoInitForHM, setHypsoInitForHM] = useState(null);
  if (terrain.status === "ready" && hypsoInitForHM !== terrain.heightmap) {
    setHypsoInitForHM(terrain.heightmap);
    const b = suggestHypsometricBandWidth(
      terrain.heightmap.minElevation,
      terrain.heightmap.maxElevation,
    );
    setHypsoBandAuto(b);
    setHypsoBandM(Math.max(1, Math.round(b)));
  }

  const flood = useMemo(() => {
    if (!showFlood || terrain.status !== "ready" || !pixelSizeM) return null;
    return floodStats(terrain.heightmap, floodLevel, pixelSizeM * pixelSizeM);
  }, [showFlood, terrain, floodLevel, pixelSizeM]);

  // --- Overlay geometries ---
  const buildingsGeometry = useMemo(() => {
    if (!showBuildings || buildings.status !== "ready" || !project) return null;
    return buildBuildingsGeometry(buildings.data, {
      project,
      sampleElevation,
      verticalScale: buildResult.scale.verticalScale,
    });
  }, [showBuildings, buildings, project, sampleElevation, buildResult]);

  const waterInlandParts = useMemo(() => {
    if (!showWater || water.status !== "ready" || !project) return null;
    return buildInlandWaterGeometry(water.data, {
      project,
      sampleElevation,
      verticalScale: buildResult.scale.verticalScale,
      bbox,
    });
  }, [showWater, water, project, sampleElevation, buildResult, bbox]);

  const seaPlane = useMemo(() => {
    if (!showWater || !buildResult || terrain.status !== "ready") return null;
    if (terrain.heightmap.minElevation > 0) return null;
    const sampler = makeSceneXZElevationSampler(
      terrain.heightmap,
      buildResult.bounds,
    );
    return {
      width: buildResult.bounds.sceneWidth,
      depth: buildResult.bounds.sceneDepth,
      sampler,
    };
  }, [showWater, buildResult, terrain]);

  const roadsGeometry = useMemo(() => {
    if (!showRoads || roads.status !== "ready" || !project) return null;
    return buildRoadsGeometry(roads.data, {
      project,
      sampleElevation,
      verticalScale: buildResult.scale.verticalScale,
      metersToUnits: buildResult.scale.metersToUnits,
    });
  }, [showRoads, roads, project, sampleElevation, buildResult]);

  const cameraPosition = useMemo(() => {
    if (!buildResult) return [200, 200, 200];
    const d = Math.max(
      buildResult.bounds.sceneWidth,
      buildResult.bounds.sceneDepth,
    );
    return [d * 0.9, d * 0.8, d * 0.9];
  }, [buildResult]);

  const osmInUse =
    (showBuildings && buildings.status === "ready") ||
    (showWater && water.status === "ready") ||
    (showRoads && roads.status === "ready");

  const handleTerrainClick = (point) => {
    if (!profileTool) return;
    setProfilePoints((prev) => {
      if (prev.length >= 2) return [{ x: point.x, y: point.y, z: point.z }];
      return [...prev, { x: point.x, y: point.y, z: point.z }];
    });
  };

  const profileSamples = useMemo(() => {
    if (profilePoints.length < 2 || terrain.status !== "ready" || !buildResult || !pixelSizeM) return null;
    const { sceneWidth, sceneDepth } = buildResult.bounds;
    const { width: W, height: H } = terrain.heightmap;
    const startX = -sceneWidth / 2;
    const startZ = -sceneDepth / 2;
    const toPx = (p) => ({
      x: ((p.x - startX) / sceneWidth) * (W - 1),
      y: ((p.z - startZ) / sceneDepth) * (H - 1),
    });
    const samples = sampleProfile(
      terrain.heightmap,
      toPx(profilePoints[0]),
      toPx(profilePoints[1]),
      128,
    );
    const totalDistanceM = samples[samples.length - 1].distancePx * pixelSizeM;
    return { samples, totalDistanceM };
  }, [profilePoints, terrain, buildResult, pixelSizeM]);

  return (
    <div className={styles.viewer}>
      {terrain.status === "loading" && (
        <div className={styles.statusOverlay}>Loading terrain…</div>
      )}
      {terrain.status === "error" && (
        <div className={styles.statusOverlay}>Error: {terrain.error}</div>
      )}

      {buildResult && (
        <Canvas
          shadows
          camera={{
            position: cameraPosition,
            fov: 45,
            near: 0.1,
            far: 5000,
          }}
        >
          <color attach="background" args={["#0a0a0a"]} />
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[300, 500, 200]}
            intensity={1.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-300}
            shadow-camera-right={300}
            shadow-camera-top={300}
            shadow-camera-bottom={-300}
            shadow-camera-near={0.1}
            shadow-camera-far={1500}
          />

          <Terrain
            buildResult={buildResult}
            textureCanvas={activeTexture}
            onTerrainClick={profileTool ? handleTerrainClick : undefined}
          />
          {showContours && (
            <Contours
              heightmap={terrain.heightmap}
              bounds={buildResult.bounds}
              scale={buildResult.scale}
              spacing={contourSpacing}
              color={contourColor}
              lineWidth={contourWidth}
              opacity={contourOpacity}
            />
          )}
          {showFlood && (
            <FloodPlane
              bounds={buildResult.bounds}
              scale={buildResult.scale}
              level={floodLevel}
            />
          )}
          {profilePoints.length === 2 && (
            <ProfileLine p0={profilePoints[0]} p1={profilePoints[1]} />
          )}
          {buildingsGeometry && <Buildings geometry={buildingsGeometry} />}
          {roadsGeometry && <Roads geometry={roadsGeometry} />}
          {(waterInlandParts || seaPlane) && (
            <Water
              inlandParts={waterInlandParts}
              seaPlane={seaPlane}
              yOffsetUnits={waterOffset * buildResult.scale.verticalScale}
            />
          )}

          <gridHelper
            args={[600, 30, "#333", "#1f1f1f"]}
            position={[0, buildResult.bounds.minY - 0.5, 0]}
          />
          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            minDistance={50}
            maxDistance={1500}
            target={[0, 0, 0]}
          />
        </Canvas>
      )}

      <button type="button" className={styles.backButton} onClick={onBack}>
        ← Back to map
      </button>

      {terrain.status === "ready" && buildResult && (
        <div className={styles.panel}>
          <fieldset className={styles.group}>
            <legend>Surface</legend>
            <label className={styles.radio}>
              <input
                type="radio"
                name="surface"
                checked={surface === "imagery"}
                onChange={() => setSurface("imagery")}
              />
              Satellite imagery
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="surface"
                checked={surface === "hypsometric"}
                onChange={() => setSurface("hypsometric")}
              />
              Hypsometric tint
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="surface"
                checked={surface === "hillshade"}
                onChange={() => setSurface("hillshade")}
              />
              Hillshade
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="surface"
                checked={surface === "slope"}
                onChange={() => setSurface("slope")}
              />
              Slope
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="surface"
                checked={surface === "aspect"}
                onChange={() => setSurface("aspect")}
              />
              Aspect
            </label>
            {surface === "hillshade" && (
              <label className={styles.slider}>
                <span>Z-factor</span>
                <span className={styles.value}>
                  {hillshadeZ.toFixed(1)}×
                  {hillshadeZAuto != null && (
                    <span className={styles.muted}> (auto {hillshadeZAuto.toFixed(1)}×)</span>
                  )}
                </span>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.5}
                  value={hillshadeZ}
                  onChange={(e) => setHillshadeZ(parseFloat(e.target.value))}
                />
              </label>
            )}
            {surface === "hypsometric" && (
              <label className={styles.slider}>
                <span>Band width</span>
                <span className={styles.value}>
                  {hypsoBandM} m
                  {hypsoBandAuto != null && (
                    <span className={styles.muted}> (auto {Math.round(hypsoBandAuto)})</span>
                  )}
                </span>
                <input
                  type="range"
                  min={1}
                  max={500}
                  step={1}
                  value={hypsoBandM}
                  onChange={(e) => setHypsoBandM(parseInt(e.target.value, 10))}
                />
              </label>
            )}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Overlays</legend>

            <label className={styles.check}>
              <input
                type="checkbox"
                checked={showBuildings}
                onChange={(e) => setShowBuildings(e.target.checked)}
              />
              Buildings
              {buildings.status === "loading" && (
                <span className={styles.muted}> (loading…)</span>
              )}
              {buildings.status === "error" && (
                <span className={styles.error}> (failed)</span>
              )}
            </label>

            <div className={styles.checkRow}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={showWater}
                  onChange={(e) => setShowWater(e.target.checked)}
                />
                Water
                {water.status === "loading" && (
                  <span className={styles.muted}> (loading…)</span>
                )}
                {water.status === "error" && (
                  <span className={styles.error}> (failed)</span>
                )}
              </label>
              <button
                type="button"
                className={`${styles.gearButton} ${
                  waterSettingsOpen ? styles.gearActive : ""
                }`}
                onClick={() => setWaterSettingsOpen(!waterSettingsOpen)}
                disabled={!showWater}
                aria-label="Water settings"
                title="Water settings"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={showRoads}
                onChange={(e) => setShowRoads(e.target.checked)}
              />
              Roads
              {roads.status === "loading" && (
                <span className={styles.muted}> (loading…)</span>
              )}
              {roads.status === "error" && (
                <span className={styles.error}> (failed)</span>
              )}
            </label>

            {showWater && waterSettingsOpen && (
              <div className={styles.subPanel}>
                <label className={styles.slider}>
                  <span>Y offset</span>
                  <span className={styles.value}>
                    {waterOffset >= 0 ? "+" : ""}
                    {waterOffset.toFixed(1)} m
                  </span>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={0.5}
                    value={waterOffset}
                    onChange={(e) => setWaterOffset(parseFloat(e.target.value))}
                  />
                </label>
              </div>
            )}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Terrain</legend>
            <label className={styles.slider}>
              <span>Vertical exaggeration</span>
              <span className={styles.value}>{exaggeration.toFixed(1)}×</span>
              <input
                type="range"
                min={1}
                max={8}
                step={0.5}
                value={exaggeration}
                onChange={(e) => setExaggeration(parseFloat(e.target.value))}
              />
            </label>
            <div className={styles.checkRow}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={showContours}
                  onChange={(e) => setShowContours(e.target.checked)}
                />
                Contour lines
              </label>
              <button
                type="button"
                className={`${styles.gearButton} ${
                  contourSettingsOpen ? styles.gearActive : ""
                }`}
                onClick={() => setContourSettingsOpen(!contourSettingsOpen)}
                disabled={!showContours}
                aria-label="Contour settings"
                title="Contour settings"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
            {showContours && (
              <label className={styles.slider}>
                <span>Contour spacing</span>
                <span className={styles.value}>{contourSpacing} m</span>
                <input
                  type="range"
                  min={5}
                  max={200}
                  step={5}
                  value={contourSpacing}
                  onChange={(e) => setContourSpacing(parseInt(e.target.value, 10))}
                />
              </label>
            )}
            {showContours && contourSettingsOpen && (
              <div className={styles.subPanel}>
                <label className={styles.slider}>
                  <span>Color</span>
                  <input
                    type="color"
                    value={contourColor}
                    onChange={(e) => setContourColor(e.target.value)}
                  />
                </label>
                <label className={styles.slider}>
                  <span>Line width</span>
                  <span className={styles.value}>{contourWidth.toFixed(1)} px</span>
                  <input
                    type="range"
                    min={1}
                    max={6}
                    step={0.5}
                    value={contourWidth}
                    onChange={(e) => setContourWidth(parseFloat(e.target.value))}
                  />
                </label>
                <label className={styles.slider}>
                  <span>Opacity</span>
                  <span className={styles.value}>{contourOpacity.toFixed(2)}</span>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={contourOpacity}
                    onChange={(e) => setContourOpacity(parseFloat(e.target.value))}
                  />
                </label>
              </div>
            )}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Flood (static)</legend>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={showFlood}
                onChange={(e) => setShowFlood(e.target.checked)}
              />
              Show flood plane
            </label>
            {showFlood && (
              <>
                <label className={styles.slider}>
                  <span>Water level</span>
                  <span className={styles.value}>{floodLevel} m</span>
                  <input
                    type="range"
                    min={Math.floor(terrain.heightmap.minElevation)}
                    max={Math.ceil(terrain.heightmap.maxElevation)}
                    step={1}
                    value={floodLevel}
                    onChange={(e) => setFloodLevel(parseInt(e.target.value, 10))}
                  />
                </label>
                {flood && (
                  <div className={styles.stats}>
                    {(flood.floodedFraction * 100).toFixed(1)}% inundated ·{" "}
                    {(flood.floodedAreaM2 / 1_000_000).toFixed(2)} km²
                  </div>
                )}
              </>
            )}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Tools</legend>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={profileTool}
                onChange={(e) => {
                  setProfileTool(e.target.checked);
                  if (!e.target.checked) setProfilePoints([]);
                }}
              />
              Elevation profile
            </label>
            {profileTool && (
              <div className={styles.muted}>
                {profilePoints.length === 0 && "Click terrain to set start point"}
                {profilePoints.length === 1 && "Click again to set end point"}
                {profilePoints.length === 2 && "Click again to reset"}
              </div>
            )}
          </fieldset>

          <div className={styles.stats}>
            Area:{" "}
            {(
              (buildResult.scale.widthM * buildResult.scale.depthM) /
              1_000_000
            ).toFixed(1)}{" "}
            km² · Elevation {Math.round(terrain.heightmap.minElevation)}–
            {Math.round(terrain.heightmap.maxElevation)} m
          </div>
        </div>
      )}

      {profileSamples && (
        <ProfilePanel
          samples={profileSamples.samples}
          totalDistanceM={profileSamples.totalDistanceM}
          onClose={() => setProfilePoints([])}
        />
      )}

      <div className={styles.attribution}>
        {elevationSource.attribution} · {textureSource.attribution}
        {osmInUse && ` · ${OSM_ATTRIBUTION}`}
      </div>
    </div>
  );
}
