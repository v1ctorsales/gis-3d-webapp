import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

export function exportSceneAsGLB(scene, onDone, onError) {
  const exporter = new GLTFExporter();

  exporter.parse(
    scene,
    (buffer) => {
      // buffer é um ArrayBuffer quando binary: true
      const blob = new Blob([buffer], { type: "model/gltf-binary" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `terrain-export-${Date.now()}.glb`;
      a.click();
      URL.revokeObjectURL(url);
      onDone?.();
    },
    (error) => {
      console.error("GLTFExporter error:", error);
      onError?.(error);
    },
    {
      binary: true,
      // Tenta serializar texturas de canvas.
      // Se o canvas de satélite estiver "tainted" por CORS,
      // o exporter vai pular a textura silenciosamente (não vai quebrar).
      embedImages: true,
    },
  );
}
