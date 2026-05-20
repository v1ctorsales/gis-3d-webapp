import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { TerraDraw, TerraDrawRectangleMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { polygonToBbox } from "../../utils/geo";
import styles from "./MapView.module.css";

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    "esri-world-imagery": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
  },
  layers: [
    {
      id: "esri-world-imagery-layer",
      type: "raster",
      source: "esri-world-imagery",
    },
  ],
};

const MapView = forwardRef(function MapView({ onSelectionChange }, ref) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const lastFeatureIdRef = useRef(null);

  // Stable ref to the callback so the effect can stay mount-only.
  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useImperativeHandle(ref, () => ({
    clearSelection() {
      const draw = drawRef.current;
      const id = lastFeatureIdRef.current;
      if (draw && id) {
        draw.removeFeatures([id]);
      }
      lastFeatureIdRef.current = null;
    },
  }));

  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: [0, 20],
      zoom: 2,
      maxZoom: 18,
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");

    map.on("load", () => {
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [new TerraDrawRectangleMode()],
      });
      drawRef.current = draw;

      draw.start();
      draw.setMode("rectangle");

      draw.on("finish", (id) => {
        // Enforce a single rectangle: drop the previous one, if any.
        const previous = lastFeatureIdRef.current;
        if (previous && previous !== id) {
          draw.removeFeatures([previous]);
        }
        lastFeatureIdRef.current = id;

        const feature = draw.getSnapshot().find((f) => f.id === id);
        if (!feature) return;

        onSelectionChangeRef.current(polygonToBbox(feature));
      });
    });

    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className={styles.map} />;
});

export default MapView;
