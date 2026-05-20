import { useRef, useState } from "react";
import MapView from "./components/Map/MapView";
import SelectionPanel from "./components/SelectionPanel/SelectionPanel";
import Viewer3D from "./components/Viewer3D/Viewer3D";
import "./App.css";

function App() {
  const [view, setView] = useState("select"); // 'select' | 'view3d'
  const [selection, setSelection] = useState(null);
  const [aoi, setAoi] = useState(null);
  const mapRef = useRef(null);

  const handleClear = () => {
    mapRef.current?.clearSelection();
    setSelection(null);
  };

  const handleConfirm = () => {
    if (!selection) return;
    setAoi(selection);
    setView("view3d");
  };

  const handleBack = () => {
    // The MapView remounts on the way back, so terra-draw state is
    // already reset. We clear the selection so the panel matches.
    setSelection(null);
    setView("select");
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>GIS Explorer</h1>
      </header>
      <main className="app-main">
        {view === "select" && (
          <>
            <MapView ref={mapRef} onSelectionChange={setSelection} />
            <SelectionPanel
              selection={selection}
              onClear={handleClear}
              onConfirm={handleConfirm}
            />
          </>
        )}
        {view === "view3d" && aoi && (
          <Viewer3D bbox={aoi} onBack={handleBack} />
        )}
      </main>
    </div>
  );
}

export default App;
