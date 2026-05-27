import { useThree } from "@react-three/fiber";
import { useImperativeHandle, forwardRef } from "react";
import { exportSceneAsGLB } from "./exportScene";

const SceneExporter = forwardRef(function SceneExporter(_, ref) {
  const { scene, gl } = useThree();

  useImperativeHandle(ref, () => ({
    export(onDone, onError) {
      // Precisa preservar o frame atual antes de exportar.
      // gl.render já foi chamado pelo R3F, então a cena está montada.
      exportSceneAsGLB(scene, onDone, onError);
    },
  }));

  return null;
});

export default SceneExporter;
