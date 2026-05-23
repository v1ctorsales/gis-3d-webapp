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
import { buildHypsometricCanvas } from "./hypsometric";
import {
  buildSlopeCanvas,
  buildAspectCanvas,
  buildHillshadeCanvas,
} from "./surfaceTextures";
import { buildBuildingsGeometry } from "./buildBuildingsGeometry";
import { buildInlandWaterGeometry } from "./buildWaterGeometry";
import { buildRoadsGeometry } from "./buildRoadsGeometry";
import Terrain from "./Terrain";
import Buildings from "./Buildings";
import Water from "./Water";
import Roads from "./Roads";
import Contours from "./Contours";
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

  useEffect(() => {
    let cancelled = false;
    setTerrain({ status: "loading" });
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
  const [hdWater, setHdWater] = useState(false);
  const [showRoads, setShowRoads] = useState(false);
  const [roads, setRoads] = useState({ status: "idle" });
  const [showContours, setShowContours] = useState(false);
  const [contourSpacing, setContourSpacing] = useState(50); // meters
  const roadsCacheRef = useRef({});

  // --- Derived terrain artifacts ---
  const buildResult = useMemo(() => {
    if (terrain.status !== "ready") return null;
    return buildTerrainGeometry(terrain.heightmap, bbox, exaggeration);
  }, [terrain, bbox, exaggeration]);

  const hypsometricCanvas = useMemo(() => {
    if (terrain.status !== "ready") return null;
    return buildHypsometricCanvas(terrain.heightmap);
  }, [terrain]);

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
    return buildHillshadeCanvas(terrain.heightmap, pixelSizeM);
  }, [terrain, pixelSizeM]);

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

          <Terrain buildResult={buildResult} textureCanvas={activeTexture} />
          {showContours && (
            <Contours
              heightmap={terrain.heightmap}
              bounds={buildResult.bounds}
              scale={buildResult.scale}
              spacing={contourSpacing}
            />
          )}
          {buildingsGeometry && <Buildings geometry={buildingsGeometry} />}
          {roadsGeometry && <Roads geometry={roadsGeometry} />}
          {(waterInlandParts || seaPlane) && (
            <Water
              inlandParts={waterInlandParts}
              seaPlane={seaPlane}
              yOffsetUnits={waterOffset * buildResult.scale.verticalScale}
              hd={hdWater}
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
                {/*<label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={hdWater}
                    onChange={(e) => setHdWater(e.target.checked)}
                  />
                  HD water
                  <span className={styles.muted}> (animated, reflective)</span>
                </label>*/}
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
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={showContours}
                onChange={(e) => setShowContours(e.target.checked)}
              />
              Contour lines
            </label>
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

      <div className={styles.attribution}>
        {elevationSource.attribution} · {textureSource.attribution}
        {osmInUse && ` · ${OSM_ATTRIBUTION}`}
      </div>
    </div>
  );
}
