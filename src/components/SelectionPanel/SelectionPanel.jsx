import styles from "./SelectionPanel.module.css";

export default function SelectionPanel({ selection, onClear, onConfirm }) {
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
          </dl>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={onConfirm}
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
