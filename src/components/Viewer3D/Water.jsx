import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import HDWaterPlane from "./HDWaterPlane";
import { buildClippedSeaGeometry } from "./buildWaterGeometry";

const SEA_SEGMENTS = 96;

export default function Water({
  inlandParts,
  waterwayGeometry,
  seaPlane,
  yOffsetUnits = 0,
  hd = false,
}) {
  const [normalMap, setNormalMap] = useState(null);

  useEffect(() => {
    if (!hd || normalMap) return;
    new THREE.TextureLoader().load(
      "/textures/waternormals.jpg",
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        setNormalMap(tex);
      },
      undefined,
      (err) => console.warn("Failed to load water normals:", err),
    );
  }, [hd, normalMap]);

  const seaGeometry = useMemo(() => {
    if (!seaPlane?.sampler) return null;
    return buildClippedSeaGeometry(
      seaPlane.width,
      seaPlane.depth,
      SEA_SEGMENTS,
      seaPlane.sampler,
      0,
    );
  }, [seaPlane]);

  useEffect(() => () => seaGeometry?.dispose(), [seaGeometry]);
  useEffect(
    () => () => inlandParts?.forEach((p) => p.geometry?.dispose()),
    [inlandParts],
  );
  useEffect(
    () => () => waterwayGeometry?.dispose(),
    [waterwayGeometry],
  );

  return (
    <>
      {seaPlane &&
        seaGeometry &&
        (hd && normalMap ? (
          <HDWaterPlane
            geometry={seaGeometry}
            normalMap={normalMap}
            position={[0, 0.1 + yOffsetUnits, 0]}
            animateVertices
          />
        ) : (
          <mesh
            geometry={seaGeometry}
            position={[0, 0.1 + yOffsetUnits, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={1}
          >
            <meshStandardMaterial
              color="#2a5d8f"
              transparent
              opacity={0.7}
              roughness={0.3}
              metalness={0.1}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

      {waterwayGeometry && (
        <mesh
          geometry={waterwayGeometry}
          position={[0, yOffsetUnits, 0]}
          renderOrder={2}
        >
          <meshStandardMaterial
            color="#2e6b9e"
            roughness={0.25}
            metalness={0.15}
          />
        </mesh>
      )}

      {inlandParts?.map((part, i) =>
        hd && normalMap ? (
          <HDWaterPlane
            key={i}
            geometry={part.geometry}
            normalMap={normalMap}
            position={[0, yOffsetUnits + part.elevation, 0]}
            animateVertices
          />
        ) : (
          <mesh
            key={i}
            geometry={part.geometry}
            position={[0, yOffsetUnits + part.elevation, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={2}
          >
            <meshStandardMaterial
              color="#2e6b9e"
              roughness={0.25}
              metalness={0.15}
            />
          </mesh>
        ),
      )}
    </>
  );
}
