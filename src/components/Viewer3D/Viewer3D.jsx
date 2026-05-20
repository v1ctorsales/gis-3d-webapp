import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  fetchElevation,
  fetchSatelliteTexture,
  elevationSource,
  textureSource,
} from "../../services/elevation";
import { buildTerrainGeometry } from "./buildTerrainGeometry";
import Terrain from "./Terrain";
import styles from "./Viewer3D.module.css";

export default function Viewer3D({ bbox, onBack }) {
  const [data, setData] = useState({ status: "loading" });
  const [exaggeration, setExaggeration] = useState(2);

  useEffect(() => {
    let cancelled = false;
    setData({ status: "loading" });

    Promise.all([fetchElevation(bbox), fetchSatelliteTexture(bbox)])
      .then(([heightmap, texture]) => {
        if (cancelled) return;
        setData({ status: "ready", heightmap, texture });
      })
      .catch((err) => {
        if (cancelled) return;
        setData({ status: "error", error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [bbox]);

  const buildResult = useMemo(() => {
    if (data.status !== "ready") return null;
    return buildTerrainGeometry(data.heightmap, bbox, exaggeration);
  }, [data, bbox, exaggeration]);

  const cameraPosition = useMemo(() => {
    if (!buildResult) return [200, 200, 200];
    const { sceneWidth, sceneDepth } = buildResult.bounds;
    const d = Math.max(sceneWidth, sceneDepth);
    return [d * 0.9, d * 0.8, d * 0.9];
  }, [buildResult]);

  return (
    <div className={styles.viewer}>
      {data.status === "loading" && (
        <div className={styles.statusOverlay}>Loading terrain…</div>
      )}
      {data.status === "error" && (
        <div className={styles.statusOverlay}>Error: {data.error}</div>
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
          <Terrain buildResult={buildResult} texture={data.texture} />
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

      {data.status === "ready" && buildResult && (
        <div className={styles.controls}>
          <label className={styles.control}>
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
          <div className={styles.stats}>
            Area:{" "}
            {(
              (buildResult.scale.widthM * buildResult.scale.depthM) /
              1_000_000
            ).toFixed(1)}{" "}
            km² · Elevation {Math.round(data.heightmap.minElevation)}–
            {Math.round(data.heightmap.maxElevation)} m
          </div>
        </div>
      )}

      <div className={styles.attribution}>
        {elevationSource.attribution} · {textureSource.attribution}
      </div>
    </div>
  );
}
