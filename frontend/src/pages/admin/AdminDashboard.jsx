import { useEffect, useState } from 'react';
import { Wallet, TrendingUp, Receipt, Percent, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import { adminGetOverview, adminGetComparison, adminGetAnalytics, adminGetRecent } from '../../api';
import { formatCurrency } from '../../format';
import { LineChart, BarChart, HBarList, Donut, SERIES } from './AdminCharts';
import MultiSelect from './MultiSelect';
import { useCustomerOptions } from './adminQuery';
import useAdminData from './useAdminData';

const PERIODS = [
  { key: 'all', label: 'All time' },
  { key: 'day', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
];

const AVATAR_COLORS = ['#e8590c', '#2f9e6b', '#3b5bdb', '#f59f00', '#a64dd6', '#e0457b', '#12a594'];
const avatarColor = (name) => AVATAR_COLORS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
const hourLabel = (hour) => `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'a' : 'p'}`;

function timeAgo(value) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/** "+12%" or "-5%" against the previous period; nothing when there is nothing to compare. */
function Delta({ now, before, points }) {
  if (before === null || before === undefined) return null;
  let diff;
  let label;
  if (points) {
    diff = now - before;
    label = `${Math.abs(diff).toFixed(1)} pts`;
  } else {
    if (before === 0) return now === 0 ? null : <span className="a-delta up">New</span>;
    diff = ((now - before) / Math.abs(before)) * 100;
    label = `${Math.abs(diff).toFixed(0)}%`;
  }
  const up = diff >= 0;
  return (
    <span className={`a-delta ${up ? 'up' : 'down'}`} title="Compared with the previous period">
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {label}
    </span>
  );
}

function Kpi({ icon: Icon, tone, label, value, negative, delta }) {
  return (
    <div className="a-kpi">
      <div className="a-kpi-top">
        <span className={`a-kpi-icon ${tone}`}>
          <Icon size={20} />
        </span>
        {delta}
      </div>
      <div className={`a-kpi-value${negative ? ' neg' : ''}`}>{value}</div>
      <div className="a-kpi-label">{label}</div>
    </div>
  );
}

function Card({ title, sub, aside, children }) {
  return (
    <div className="a-card">
      <h3 className="a-card-title">
        {title}
        {aside}
      </h3>
      {sub && <p className="a-card-sub">{sub}</p>}
      {children}
    </div>
  );
}

export default function AdminDashboard() {
  const [period, setPeriod] = useState('all');
  const [stalls, setStalls] = useState([]);
  const [tick, setTick] = useState(0);
  const options = useCustomerOptions();

  // The activity feed refreshes by itself every half minute.
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const query = { period, stalls: stalls.join(',') };
  const key = JSON.stringify(query);
  const overview = useAdminData(() => adminGetOverview(query), [key, tick]);
  const comparison = useAdminData(() => adminGetComparison(query), [key, tick]);
  const analytics = useAdminData(() => adminGetAnalytics(query), [key, tick]);
  const recent = useAdminData(() => adminGetRecent({ stalls: query.stalls, limit: 8 }), [query.stalls, tick]);

  const totals = overview.data?.totals;
  const before = overview.data?.previous;
  const error = overview.error || comparison.error || analytics.error;
  const a = analytics.data;
  const hasSales = a && a.trend.length > 0;

  const stallRows = (comparison.data?.stalls || []).map((s) => ({
    id: s.id,
    label: s.name,
    value: s.net_profit,
  }));
  const top = (comparison.data?.stalls || []).filter((s) => s.revenue > 0).slice(0, 3);

  return (
    <div>
      <div className="a-page-head">
        <div>
          <h1 className="a-title">Dashboard</h1>
          <p className="a-subtitle">How every stall is doing, at a glance</p>
        </div>
        <div className="a-actions">
          <div style={{ width: 250 }}>
            <MultiSelect title="Customers" options={options} value={stalls} onChange={setStalls} placeholder="All customers" />
          </div>
          <div className="a-seg">
            {PERIODS.map((p) => (
              <button key={p.key} className={period === p.key ? 'active' : ''} onClick={() => setPeriod(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
          <button className="a-btn" onClick={() => setTick((t) => t + 1)} title="Reload data">
            <RefreshCw size={15} /> Reload
          </button>
        </div>
      </div>

      {error && <div className="a-error">{error}</div>}

      <div className="a-dash">
        <div>
          <div className="a-kpis">
            <Kpi
              icon={Wallet}
              tone="orange"
              label="Revenue"
              value={totals ? formatCurrency(totals.revenue) : '-'}
              delta={totals && <Delta now={totals.revenue} before={before?.revenue} />}
            />
            <Kpi
              icon={TrendingUp}
              tone="green"
              label="Net profit"
              value={totals ? formatCurrency(totals.net_profit) : '-'}
              negative={totals && totals.net_profit < 0}
              delta={totals && <Delta now={totals.net_profit} before={before?.net_profit} />}
            />
            <Kpi
              icon={Receipt}
              tone="blue"
              label="Orders"
              value={overview.data ? overview.data.transactions : '-'}
              delta={overview.data && <Delta now={overview.data.transactions} before={before?.transactions} />}
            />
            <Kpi
              icon={Percent}
              tone="amber"
              label="Profit margin"
              value={totals ? `${totals.margin_pct}%` : '-'}
              negative={totals && totals.margin_pct < 0}
              delta={totals && <Delta now={totals.margin_pct} before={before?.margin_pct} points />}
            />
          </div>

          <div className="a-grid a-grid-2-1">
            <Card
              title="Sales report"
              sub="Revenue and profit by day, cash and credit sales combined"
              aside={
                <span className="a-legend">
                  <span>
                    <span className="a-dot" style={{ background: SERIES.orange }} />
                    Revenue
                  </span>
                  <span>
                    <span className="a-dot" style={{ background: SERIES.green }} />
                    Profit
                  </span>
                </span>
              }
            >
              {hasSales ? (
                <LineChart data={a.trend.map((t) => ({ label: t.date.slice(5), a: t.revenue, b: t.profit }))} />
              ) : (
                <div className="a-empty">{analytics.loading ? 'Loading...' : 'No sales yet.'}</div>
              )}
            </Card>

            <Card title="Money received" sub="Cash and GPay, plus credit still to collect">
              {overview.data ? (
                <Donut
                  format={formatCurrency}
                  segments={[
                    { label: 'Cash', value: overview.data.payment_split.cash, color: SERIES.orange },
                    { label: 'GPay', value: overview.data.payment_split.gpay, color: SERIES.blue },
                    { label: 'Credit to collect', value: totals?.outstanding_credit || 0, color: SERIES.amber },
                  ]}
                />
              ) : (
                <div className="a-empty">Loading...</div>
              )}
            </Card>
          </div>

          <div className="a-grid a-grid-1-1">
            <Card title="Profit by stall" sub="Net profit, highest first">
              {stallRows.length ? (
                <HBarList rows={stallRows} format={formatCurrency} />
              ) : (
                <div className="a-empty">{comparison.loading ? 'Loading...' : 'No stalls yet.'}</div>
              )}
            </Card>

            <Card
              title="Peak hours"
              sub={a?.busiest_hour != null ? `Busiest at ${hourLabel(a.busiest_hour)} (${a.busiest_hour}:00)` : 'Sales by hour of day'}
            >
              {hasSales ? (
                <BarChart
                  data={a.peak_hours.map((h) => ({ ...h, label: hourLabel(h.hour) }))}
                  valueKey="revenue"
                  labelKey="label"
                  labelEvery={3}
                  highlight={a.busiest_hour != null ? hourLabel(a.busiest_hour) : null}
                />
              ) : (
                <div className="a-empty">{analytics.loading ? 'Loading...' : 'No sales yet.'}</div>
              )}
            </Card>
          </div>

          <div className="a-grid a-grid-1-1">
            <Card title="Busiest days" sub={a?.busiest_day ? `${a.busiest_day} sells the most` : 'Sales by day of week'}>
              {hasSales ? (
                <BarChart
                  data={a.by_weekday.map((d) => ({ ...d, label: d.day.slice(0, 3) }))}
                  valueKey="revenue"
                  labelKey="label"
                  highlight={a.busiest_day ? a.busiest_day.slice(0, 3) : null}
                />
              ) : (
                <div className="a-empty">{analytics.loading ? 'Loading...' : 'No sales yet.'}</div>
              )}
            </Card>

            <Card title="Top selling items" sub="By revenue">
              {hasSales && a.top_items.length ? (
                <HBarList
                  rows={a.top_items.slice(0, 6).map((i) => ({ id: i.name, label: i.name, sub: `${i.quantity} sold`, value: i.revenue }))}
                  format={formatCurrency}
                />
              ) : (
                <div className="a-empty">{analytics.loading ? 'Loading...' : 'No sales yet.'}</div>
              )}
            </Card>
          </div>
        </div>

        <aside className="a-rail">
          <Card title="Top stalls" sub="By net profit">
            {top.length ? (
              <ol className="a-rank">
                {top.map((s, i) => (
                  <li key={s.id}>
                    <span className="a-rank-pos">{i + 1}</span>
                    <span className="a-rank-name">{s.name}</span>
                    <span className="a-rank-value">{formatCurrency(s.net_profit)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="a-empty">{comparison.loading ? 'Loading...' : 'No sales yet.'}</div>
            )}
          </Card>

          <Card title="Recent activity" sub="Updates every 30 seconds">
            {recent.data?.rows.length ? (
              <ul className="a-feed">
                {recent.data.rows.map((r) => (
                  <li key={r.id}>
                    <span className="a-feed-avatar" style={{ background: avatarColor(r.stall) }}>
                      {r.stall.charAt(0).toUpperCase()}
                    </span>
                    <span className="a-feed-main">
                      <div className="a-feed-name">{r.stall}</div>
                      <div className="a-feed-meta">
                        {r.type}
                        {r.mode ? ` · ${r.mode === 'gpay' ? 'GPay' : r.mode}` : ''} · {timeAgo(r.date)}
                      </div>
                    </span>
                    <span className={`a-feed-amount${r.amount < 0 ? ' neg' : ''}`}>
                      {r.amount < 0 ? '' : '+'}
                      {formatCurrency(r.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="a-empty">{recent.loading ? 'Loading...' : 'Nothing yet.'}</div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
