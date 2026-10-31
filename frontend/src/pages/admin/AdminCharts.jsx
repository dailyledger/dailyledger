/*
 * Small dependency-free SVG/CSS charts for the admin dashboard.
 */

const compact = (n) => {
  const v = Math.abs(n);
  if (v >= 100000) return `${(n / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  if (v >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
};

/** Two-series line chart (revenue + profit by day). `data` is [{ label, a, b }]. */
export function LineChart({ data }) {
  const W = 640;
  const H = 230;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const values = data.flatMap((d) => [d.a, d.b]);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const x = (i) => pad.l + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v) => pad.t + innerH - ((v - min) / span) * innerH;
  const line = (key) => data.map((d, i) => `${x(i)},${y(d[key])}`).join(' ');
  const area = `${pad.l},${y(min)} ${line('a')} ${x(data.length - 1)},${y(min)}`;
  const ticks = [0, 1, 2, 3].map((t) => min + (span * t) / 3);
  const labelAt = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);

  return (
    <div className="a-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue and profit by day">
        <defs>
          <linearGradient id="a-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#263140" strokeDasharray="3 4" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#8b98a8">
              {compact(t)}
            </text>
          </g>
        ))}
        {data.length > 1 && <polygon points={area} fill="url(#a-area)" />}
        <polyline points={line('a')} fill="none" stroke="#2dd4bf" strokeWidth="2.2" strokeLinejoin="round" />
        <polyline points={line('b')} fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={d.label}>
            <circle cx={x(i)} cy={y(d.a)} r="3" fill="#2dd4bf">
              <title>{`${d.label}: revenue ${compact(d.a)}`}</title>
            </circle>
            <circle cx={x(i)} cy={y(d.b)} r="3" fill="#60a5fa">
              <title>{`${d.label}: profit ${compact(d.b)}`}</title>
            </circle>
            {labelAt.has(i) && (
              <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#8b98a8">
                {d.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Vertical bars; the tallest (or `highlight`) bar is drawn in the accent colour. */
export function BarChart({ data, valueKey, labelKey, highlight }) {
  const max = Math.max(...data.map((d) => d[valueKey]), 0);
  return (
    <div className="a-bars" role="img">
      {data.map((d) => {
        const pct = max > 0 ? (d[valueKey] / max) * 100 : 0;
        return (
          <div
            className={`a-bar-col${highlight === d[labelKey] ? ' peak' : ''}`}
            key={d[labelKey]}
            title={`${d[labelKey]}: ${compact(d[valueKey])}`}
          >
            <div className="a-bar" style={{ height: `${Math.max(pct, d[valueKey] > 0 ? 3 : 0)}%` }} />
            <span className="a-bar-label">{d[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Ranked horizontal bars. `rows` is [{ id, label, sub, value }]. */
export function HBarList({ rows, format }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0);
  return (
    <div className="a-hbars">
      {rows.map((r) => (
        <div className="a-hbar-row" key={r.id}>
          <div className="a-hbar-top">
            <span>
              {r.label} {r.sub && <small>{r.sub}</small>}
            </span>
            <strong>{format(r.value)}</strong>
          </div>
          <div className="a-hbar-track">
            <div
              className={`a-hbar-fill${r.value < 0 ? ' neg' : ''}`}
              style={{ width: `${max > 0 ? (Math.abs(r.value) / max) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Donut with a legend. `segments` is [{ label, value, color }]. */
export function Donut({ segments, format }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="a-donut">
      <svg viewBox="0 0 150 150" role="img" aria-label="Payment split">
        <circle cx="75" cy="75" r={R} fill="none" stroke="#1b232d" strokeWidth="16" />
        {total > 0 &&
          segments.map((s) => {
            const len = (s.value / total) * C;
            const el = (
              <circle
                key={s.label}
                cx="75"
                cy="75"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="16"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 75 75)"
              />
            );
            offset += len;
            return el;
          })}
        <text x="75" y="72" textAnchor="middle" fontSize="11" fill="#8b98a8">
          Total
        </text>
        <text x="75" y="90" textAnchor="middle" fontSize="15" fontWeight="700" fill="#e6edf3">
          {compact(total)}
        </text>
      </svg>
      <div className="a-donut-list">
        {segments.map((s) => (
          <div key={s.label}>
            <span className="a-dot" style={{ background: s.color }} />
            {s.label}
            <small>
              {format(s.value)} {total > 0 && `· ${Math.round((s.value / total) * 100)}%`}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
