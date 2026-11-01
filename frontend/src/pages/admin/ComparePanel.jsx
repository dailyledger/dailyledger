import { useEffect, useState } from 'react';
import { GitCompareArrows, Crown } from 'lucide-react';
import { adminCompare, adminGetSettings } from '../../api';
import { formatCurrency } from '../../format';
import { LineChart, HBarList, SERIES } from './AdminCharts';
import { Card, Delta } from './AdminUi';
import AdminDateField from './AdminDateField';
import MultiSelect from './MultiSelect';
import { useCustomerOptions, isoToday } from './adminQuery';

/*
 * Compare any two groups: stall vs stall over one period, or one set of stalls across two
 * periods. The server computes each side; this page decides what varies.
 */

const FORMAT = {
  money: (v) => formatCurrency(v),
  count: (v) => Number(v).toLocaleString('en-IN'),
  percent: (v) => `${v}%`,
};

// Local calendar dates, so "today" is the admin's today.
function dayOffset(offset, from = isoToday()) {
  const d = new Date(`${from}T12:00:00`);
  d.setDate(d.getDate() + offset);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

const RANGES = [
  { key: 'all', label: 'All time' },
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'Last 30 days' },
];

function rangeDates(key) {
  if (key === 'day') return { from: dayOffset(0), to: dayOffset(0) };
  if (key === 'week') return { from: dayOffset(-6), to: dayOffset(0) };
  if (key === 'month') return { from: dayOffset(-29), to: dayOffset(0) };
  return { from: '', to: '' };
}

/** One value per calendar day in the window (zero when nothing sold), so two windows line up. */
function dense(trend, from, to, key) {
  if (!from || !to) return trend.map((t) => t[key]);
  const byDate = new Map(trend.map((t) => [t.date, t[key]]));
  const out = [];
  for (let d = from, n = 0; d <= to && n < 120; d = dayOffset(1, d), n += 1) out.push(byDate.get(d) || 0);
  return out;
}

/**
 * `metrics`: [{ key, label, kind: 'money' | 'count' | 'percent', better: 'high' | 'low' | null }]
 * `headline`: the metric key shown big on each side.
 */
export default function ComparePanel({ metrics, headline = metrics[0].key }) {
  const options = useCustomerOptions();
  const [mode, setMode] = useState('stalls');
  const [stallA, setStallA] = useState('');
  const [stallB, setStallB] = useState('');
  const [range, setRange] = useState('all');
  const [picked, setPicked] = useState([]);
  const [dates, setDates] = useState({ aFrom: '', aTo: '', bFrom: '', bTo: '' });
  const [day1, setDay1] = useState('');
  const [result, setResult] = useState(null);
  const [used, setUsed] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminGetSettings()
      .then((s) => setDay1(s.day1 || ''))
      .catch(() => {});
  }, []);

  const run = async (override) => {
    setError('');
    let params;
    if (mode === 'stalls') {
      if (!stallA || !stallB) {
        setError('Pick two stalls to compare.');
        return;
      }
      const r = rangeDates(range);
      params = { a_stalls: stallA, b_stalls: stallB, a_from: r.from, a_to: r.to, b_from: r.from, b_to: r.to };
    } else {
      const d = override || dates;
      if (!d.aFrom || !d.aTo || !d.bFrom || !d.bTo) {
        setError('Choose both date ranges.');
        return;
      }
      const stalls = picked.join(',');
      params = { a_stalls: stalls, b_stalls: stalls, a_from: d.aFrom, a_to: d.aTo, b_from: d.bFrom, b_to: d.bTo };
    }

    setLoading(true);
    try {
      setResult(await adminCompare(params));
      setUsed({ aFrom: params.a_from, aTo: params.a_to, bFrom: params.b_from, bTo: params.b_to });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const preset = (next) => {
    setDates(next);
    run(next);
  };

  const winner = (m) => {
    if (!result || !m.better) return null;
    const a = result.a.metrics[m.key];
    const b = result.b.metrics[m.key];
    if (a === b) return null;
    return (m.better === 'high' ? a > b : a < b) ? 'a' : 'b';
  };

  const trendA = result ? dense(result.a.trend, used?.aFrom, used?.aTo, 'revenue') : [];
  const trendB = result ? dense(result.b.trend, used?.bFrom, used?.bTo, 'revenue') : [];
  const points = Math.max(trendA.length, trendB.length);

  const head = metrics.find((m) => m.key === headline);

  return (
    <div>
      <Card className="a-compare-controls">
        <div className="a-compare-modes">
          <div className="a-seg">
            <button className={mode === 'stalls' ? 'active' : ''} onClick={() => { setMode('stalls'); setResult(null); }}>
              Stall vs stall
            </button>
            <button className={mode === 'periods' ? 'active' : ''} onClick={() => { setMode('periods'); setResult(null); }}>
              Period vs period
            </button>
          </div>
        </div>

        {mode === 'stalls' ? (
          <div className="a-compare-fields">
            <div className="a-field">
              <label className="a-label"><span className="a-dot" style={{ background: SERIES.orange }} />Stall A</label>
              <select className="a-select" value={stallA} onChange={(e) => setStallA(e.target.value)}>
                <option value="">Choose a stall...</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <div className="a-field">
              <label className="a-label"><span className="a-dot" style={{ background: SERIES.blue }} />Stall B</label>
              <select className="a-select" value={stallB} onChange={(e) => setStallB(e.target.value)}>
                <option value="">Choose a stall...</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <div className="a-field">
              <label className="a-label">Period</label>
              <select className="a-select" value={range} onChange={(e) => setRange(e.target.value)}>
                {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <div className="a-field a-compare-go">
              <button className="a-btn a-btn-primary" onClick={() => run()} disabled={loading}>
                <GitCompareArrows size={16} /> {loading ? 'Comparing...' : 'Compare'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="a-compare-presets">
              <span className="a-label" style={{ margin: 0 }}>Quick picks</span>
              <button className="a-btn a-btn-sm" onClick={() => preset({ aFrom: dayOffset(-1), aTo: dayOffset(-1), bFrom: dayOffset(0), bTo: dayOffset(0) })}>
                Yesterday vs Today
              </button>
              <button className="a-btn a-btn-sm" onClick={() => preset({ aFrom: dayOffset(-13), aTo: dayOffset(-7), bFrom: dayOffset(-6), bTo: dayOffset(0) })}>
                Last week vs This week
              </button>
              {day1 && (
                <button className="a-btn a-btn-sm" onClick={() => preset({ aFrom: day1, aTo: day1, bFrom: dayOffset(1, day1), bTo: dayOffset(1, day1) })}>
                  Day 1 vs Day 2
                </button>
              )}
            </div>
            <div className="a-compare-fields periods">
              <div className="a-field a-compare-wide">
                <label className="a-label">Stalls</label>
                <MultiSelect title="Customers" options={options} value={picked} onChange={setPicked} placeholder="All customers" />
              </div>
              <div className="a-field">
                <label className="a-label"><span className="a-dot" style={{ background: SERIES.orange }} />Period A from</label>
                <AdminDateField value={dates.aFrom} onChange={(aFrom) => setDates((d) => ({ ...d, aFrom }))} placeholder="Start" />
              </div>
              <div className="a-field">
                <label className="a-label">to</label>
                <AdminDateField value={dates.aTo} min={dates.aFrom || undefined} onChange={(aTo) => setDates((d) => ({ ...d, aTo }))} placeholder="End" />
              </div>
              <div className="a-field">
                <label className="a-label"><span className="a-dot" style={{ background: SERIES.blue }} />Period B from</label>
                <AdminDateField value={dates.bFrom} onChange={(bFrom) => setDates((d) => ({ ...d, bFrom }))} placeholder="Start" />
              </div>
              <div className="a-field">
                <label className="a-label">to</label>
                <AdminDateField value={dates.bTo} min={dates.bFrom || undefined} onChange={(bTo) => setDates((d) => ({ ...d, bTo }))} placeholder="End" />
              </div>
              <div className="a-field a-compare-go">
                <button className="a-btn a-btn-primary" onClick={() => run()} disabled={loading}>
                  <GitCompareArrows size={16} /> {loading ? 'Comparing...' : 'Compare'}
                </button>
              </div>
            </div>
          </>
        )}
        {error && <div className="a-error" style={{ marginTop: 14, marginBottom: 0 }}>{error}</div>}
      </Card>

      {!result ? (
        <div className="a-empty a-compare-empty">
          <GitCompareArrows size={30} />
          <div>Choose what to compare, then press Compare.</div>
        </div>
      ) : (
        <>
          <div className="a-compare-head">
            {[['a', result.a, SERIES.orange], ['b', result.b, SERIES.blue]].map(([side, data, color], i) => (
              <div className="a-compare-side" key={side} style={{ borderTopColor: color }}>
                <span className="a-compare-tag" style={{ background: color }}>{side.toUpperCase()}</span>
                <div className="a-compare-name">{data.stall_label}</div>
                <div className="a-compare-range">{data.range_label}</div>
                <div className="a-compare-big">{FORMAT[head.kind](data.metrics[head.key])}</div>
                <div className="a-compare-bigl">{head.label}</div>
                {i === 0 && <span className="a-compare-vs">VS</span>}
              </div>
            ))}
          </div>

          <Card title="Side by side" sub="The better figure on each row is highlighted">
            <table className="a-table a-ctable">
              <thead>
                <tr>
                  <th>Measure</th>
                  <th className="num"><span className="a-dot" style={{ background: SERIES.orange }} />A</th>
                  <th className="num"><span className="a-dot" style={{ background: SERIES.blue }} />B</th>
                  <th className="num">B vs A</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => {
                  const w = winner(m);
                  const a = result.a.metrics[m.key];
                  const b = result.b.metrics[m.key];
                  return (
                    <tr key={m.key}>
                      <td>{m.label}</td>
                      <td className={`num${w === 'a' ? ' win' : ''}`}>{w === 'a' && <Crown size={13} />} {FORMAT[m.kind](a)}</td>
                      <td className={`num${w === 'b' ? ' win' : ''}`}>{w === 'b' && <Crown size={13} />} {FORMAT[m.kind](b)}</td>
                      <td className="num">
                        <Delta now={b} before={a} points={m.kind === 'percent'} goodWhenDown={m.better === 'low'} />
                        {a === b && <span className="muted">same</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <div className="a-grid a-grid-1-1" style={{ marginTop: 18 }}>
            <Card
              title="Revenue by day"
              sub="Day by day, from the start of each period"
              aside={
                <span className="a-legend">
                  <span><span className="a-dot" style={{ background: SERIES.orange }} />A</span>
                  <span><span className="a-dot" style={{ background: SERIES.blue }} />B</span>
                </span>
              }
            >
              {points > 0 ? (
                <LineChart
                  colorA={SERIES.orange}
                  colorB={SERIES.blue}
                  data={Array.from({ length: points }, (_, i) => ({ label: `Day ${i + 1}`, a: trendA[i] || 0, b: trendB[i] || 0 }))}
                />
              ) : (
                <div className="a-empty">No sales in either period.</div>
              )}
            </Card>
            <div className="a-compare-items">
              <Card title="Top items: A" sub={result.a.stall_label}>
                {result.a.top_items.length ? (
                  <HBarList color={SERIES.orange} format={formatCurrency} rows={result.a.top_items.map((i) => ({ id: i.name, label: i.name, sub: `${i.quantity} sold`, value: i.revenue }))} />
                ) : <div className="a-empty">No sales.</div>}
              </Card>
              <Card title="Top items: B" sub={result.b.stall_label}>
                {result.b.top_items.length ? (
                  <HBarList color={SERIES.blue} format={formatCurrency} rows={result.b.top_items.map((i) => ({ id: i.name, label: i.name, sub: `${i.quantity} sold`, value: i.revenue }))} />
                ) : <div className="a-empty">No sales.</div>}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
