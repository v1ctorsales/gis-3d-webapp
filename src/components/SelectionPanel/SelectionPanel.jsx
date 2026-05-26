import { computeAreaKm2, MAX_AREA_KM2 } from "../../utils/geo";
import styles from "./SelectionPanel.module.css";

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
