import styles from "./SelectionPanel.module.css";

// Limite de área da seleção em km². Ajustar conforme o
// custo de extração + geração do mesh 3D do seu pipeline.
const MAX_AREA_KM2 = 100;

const EARTH_RADIUS_M = 6_378_137;
const toRad = (deg) => (deg * Math.PI) / 180;

function computeAreaKm2({ west, south, east, north }) {
  const midLat = (north + south) / 2;
  const widthM = toRad(east - west) * EARTH_RADIUS_M * Math.cos(toRad(midLat));
  const heightM = toRad(north - south) * EARTH_RADIUS_M;
  return Math.abs(widthM * heightM) / 1_000_000;
}

export default function SelectionPanel({ selection, onClear, onConfirm }) {
  const areaKm2 = selection ? computeAreaKm2(selection) : 0;
  const overLimit = areaKm2 > MAX_AREA_KM2;

  return (
    <aside className={styles.panel}>
      <h2 className={styles.title}>Selection</h2>

      {selection ? (
        <>
          <dl className={styles.coords}>
            <dt>West</dt>
            <dd>{selection.west.toFixed(5)}</dd>
            <dt>South</dt>
            <dd>{selection.south.toFixed(5)}</dd>
            <dt>East</dt>
            <dd>{selection.east.toFixed(5)}</dd>
            <dt>North</dt>
            <dd>{selection.north.toFixed(5)}</dd>
            <dt>Area</dt>
            <dd className={overLimit ? styles.areaOver : undefined}>
              {areaKm2.toFixed(2)} km² / {MAX_AREA_KM2} km²
            </dd>
          </dl>

          {overLimit && (
            <p className={styles.warning} role="alert">
              Selection exceeds the {MAX_AREA_KM2} km² limit. Reduce the area
              before confirming.
            </p>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={onConfirm}
              disabled={overLimit}
              aria-disabled={overLimit}
            >
              Confirm selection
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={onClear}
            >
              Clear
            </button>
          </div>
        </>
      ) : (
        <p className={styles.hint}>
          Click two opposite corners on the map to draw a rectangle.
        </p>
      )}
    </aside>
  );
}
