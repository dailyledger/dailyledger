import { useId } from 'react';

/*
 * Small dependency-free SVG/CSS charts for the admin console. Colours come from the
 * theme (admin.css); series colours are passed in so a comparison can use two.
 */

export const SERIES = {
  orange: '#e8590c',
  green: '#2f9e6b',
  blue: '#3b5bdb',
  amber: '#f59f00',
};

const compact = (n) => {
  const v = Math.abs(n);
  if (v >= 100000) return `${(n / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  if (v >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
};

/** Smooth line through the points (Catmull-Rom turned into bezier segments). */
function smoothPath(points) {
  if (points.length < 3) return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/**
 * Line chart with up to two series. `data` is [{ label, a, b }]; `b` is optional.
 * The first series gets a soft fill underneath.
 */
export function LineChart({ data, colorA = SERIES.orange, colorB = SERIES.green }) {
  const gradId = `fill-${useId().replace(/:/g, '')}`;
  const W = 520;
  const H = 250;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const hasB = data.some((d) => d.b !== undefined && d.b !== null);

  const values = data.flatMap((d) => [d.a, hasB ? d.b || 0 : d.a]);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const x = (i) => pad.l + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v) => pad.t + innerH - ((v - min) / span) * innerH;
  const pointsA = data.map((d, i) => ({ x: x(i), y: y(d.a) }));
  const pointsB = hasB ? data.map((d, i) => ({ x: x(i), y: y(d.b || 0) })) : [];
  const ticks = [0, 1, 2, 3].map((t) => min + (span * t) / 3);
  const labelAt = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);
  const lineA = smoothPath(pointsA);
  const area = `${lineA} L${x(data.length - 1)},${y(min)} L${pad.l},${y(min)} Z`;

  return (
    <div className="a-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorA} stopOpacity="0.22" />
            <stop offset="100%" stopColor={colorA} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line className="a-grid-line" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} strokeDasharray="3 5" />
            <text className="a-axis" x={pad.l - 8} y={y(t) + 4} textAnchor="end">
              {compact(t)}
            </text>
          </g>
        ))}
        {data.length > 1 && <path d={area} fill={`url(#${gradId})`} />}
        <path d={lineA} fill="none" stroke={colorA} strokeWidth="2.6" strokeLinecap="round" />
        {hasB && <path d={smoothPath(pointsB)} fill="none" stroke={colorB} strokeWidth="2.6" strokeLinecap="round" />}
        {data.map((d, i) => (
          <g key={d.label}>
            <circle cx={x(i)} cy={y(d.a)} r="3.4" fill="#fff" stroke={colorA} strokeWidth="2">
              <title>{`${d.label}: ${compact(d.a)}`}</title>
            </circle>
            {hasB && (
              <circle cx={x(i)} cy={y(d.b || 0)} r="3.4" fill="#fff" stroke={colorB} strokeWidth="2">
                <title>{`${d.label}: ${compact(d.b || 0)}`}</title>
              </circle>
            )}
            {labelAt.has(i) && (
              <text
                className="a-axis"
                x={x(i)}
                y={H - 6}
                // Keep the first and last labels inside the chart instead of clipping them.
                textAnchor={data.length > 1 && i === 0 ? 'start' : data.length > 1 && i === data.length - 1 ? 'end' : 'middle'}
              >
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
export function BarChart({ data, valueKey, labelKey, highlight, labelEvery = 1 }) {
  const max = Math.max(...data.map((d) => d[valueKey]), 0);
  return (
    <div className="a-bars" role="img">
      {data.map((d, index) => {
        const pct = max > 0 ? (d[valueKey] / max) * 100 : 0;
        return (
          <div
            className={`a-bar-col${highlight === d[labelKey] ? ' peak' : ''}`}
            key={d[labelKey]}
            title={`${d[labelKey]}: ${compact(d[valueKey])}`}
          >
            <div className="a-bar" style={{ height: `${Math.max(pct, d[valueKey] > 0 ? 3 : 0)}%` }} />
            {index % labelEvery === 0 && <span className="a-bar-label">{d[labelKey]}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Ranked horizontal bars. `rows` is [{ id, label, sub, value }]. */
export function HBarList({ rows, format, color }) {
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
              style={{ width: `${max > 0 ? (Math.abs(r.value) / max) * 100 : 0}%`, ...(color && r.value >= 0 ? { background: color } : {}) }}
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
      <svg viewBox="0 0 150 150" role="img" aria-label="Breakdown">
        <circle className="a-donut-track" cx="75" cy="75" r={R} fill="none" strokeWidth="16" />
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
        <text className="a-donut-total-label" x="75" y="72" textAnchor="middle" fontSize="11">
          Total
        </text>
        <text className="a-donut-total" x="75" y="91" textAnchor="middle" fontSize="16" fontWeight="800">
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
