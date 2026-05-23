import styles from "./ProfilePanel.module.css";

const W = 320;
const H = 160;
const PAD = { top: 8, right: 8, bottom: 26, left: 40 };

export default function ProfilePanel({ samples, totalDistanceM, onClose }) {
  if (!samples || samples.length === 0) return null;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  let minE = Infinity, maxE = -Infinity;
  for (const s of samples) {
    if (s.elevation < minE) minE = s.elevation;
    if (s.elevation > maxE) maxE = s.elevation;
  }
  if (maxE - minE < 1) maxE = minE + 1;

  const xFor = (i) => PAD.left + (i / (samples.length - 1)) * innerW;
  const yFor = (e) => PAD.top + innerH - ((e - minE) / (maxE - minE)) * innerH;

  let pathArea = `M ${xFor(0)} ${PAD.top + innerH}`;
  let pathLine = "";
  samples.forEach((s, i) => {
    const x = xFor(i);
    const y = yFor(s.elevation);
    pathArea += ` L ${x} ${y}`;
    pathLine += (i === 0 ? "M" : "L") + ` ${x} ${y}`;
  });
  pathArea += ` L ${xFor(samples.length - 1)} ${PAD.top + innerH} Z`;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Elevation profile</span>
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <path d={pathArea} className={styles.area} />
        <path d={pathLine} className={styles.line} />
        <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH} className={styles.axis} />
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} className={styles.axis} />
        <text x={PAD.left} y={PAD.top - 1} className={styles.tick}>{Math.round(maxE)} m</text>
        <text x={PAD.left} y={PAD.top + innerH + 12} className={styles.tick}>{Math.round(minE)} m</text>
        <text x={PAD.left + innerW} y={H - 6} className={styles.tick} textAnchor="end">
          {(totalDistanceM / 1000).toFixed(2)} km
        </text>
        <text x={PAD.left} y={H - 6} className={styles.tick}>0</text>
      </svg>
    </div>
  );
}
