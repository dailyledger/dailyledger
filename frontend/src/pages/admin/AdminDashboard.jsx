import { useState } from 'react';
import { adminGetOverview, adminGetComparison, adminGetAnalytics } from '../../api';
import { formatCurrency } from '../../format';
import { LineChart, BarChart, HBarList, Donut } from './AdminCharts';
import MultiSelect from './MultiSelect';
import { useCustomerOptions } from './adminQuery';
import useAdminData from './useAdminData';

const PERIODS = [
  { key: 'all', label: 'All time' },
  { key: 'day', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
];

const hourLabel = (hour) => `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'a' : 'p'}`;

function Tile({ label, value, negative }) {
  return (
    <div className="a-tile">
      <div className="a-tile-label">{label}</div>
      <div className={`a-tile-value${negative ? ' neg' : ''}`}>{value}</div>
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
  const options = useCustomerOptions();

  const query = { period, stalls: stalls.join(',') };
  const key = JSON.stringify(query);
  const overview = useAdminData(() => adminGetOverview(query), [key]);
  const comparison = useAdminData(() => adminGetComparison(query), [key]);
  const analytics = useAdminData(() => adminGetAnalytics(query), [key]);

  const totals = overview.data?.totals;
  const error = overview.error || comparison.error || analytics.error;
  const a = analytics.data;
  const hasSales = a && a.trend.length > 0;

  const stallRows = (comparison.data?.stalls || []).map((s) => ({
    id: s.id,
    label: s.name,
    value: s.net_profit,
  }));

  return (
    <div>
      <div className="a-page-head">
        <div>
          <h1 className="a-title">Dashboard</h1>
          <p className="a-subtitle">Sales and profit across the stalls you manage</p>
        </div>
        <div className="a-actions">
          <div style={{ width: 260 }}>
            <MultiSelect
              title="Customers"
              options={options}
              value={stalls}
              onChange={setStalls}
              placeholder="All customers"
            />
          </div>
          <div className="a-seg">
            {PERIODS.map((p) => (
              <button key={p.key} className={period === p.key ? 'active' : ''} onClick={() => setPeriod(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="a-error">{error}</div>}

      <div className="a-tiles">
        <Tile label="Revenue" value={totals ? formatCurrency(totals.revenue) : '-'} />
        <Tile
          label="Net profit"
          value={totals ? formatCurrency(totals.net_profit) : '-'}
          negative={totals && totals.net_profit < 0}
        />
        <Tile label="Profit margin" value={totals ? `${totals.margin_pct}%` : '-'} negative={totals && totals.margin_pct < 0} />
        <Tile label="Transactions" value={overview.data ? overview.data.transactions : '-'} />
        <Tile
          label="Active stalls"
          value={overview.data ? `${overview.data.active_stalls} / ${overview.data.stalls}` : '-'}
        />
      </div>

      <div className="a-grid a-grid-2-1">
        <Card
          title="Revenue & profit"
          sub="Daily, cash and credit sales combined"
          aside={
            <span className="a-legend">
              <span><span className="a-dot" style={{ background: '#2dd4bf' }} />Revenue</span>
              <span><span className="a-dot" style={{ background: '#60a5fa' }} />Profit</span>
            </span>
          }
        >
          {hasSales ? (
            <LineChart data={a.trend.map((t) => ({ label: t.date.slice(5), a: t.revenue, b: t.profit }))} />
          ) : (
            <div className="a-empty">{analytics.loading ? 'Loading...' : 'No sales yet.'}</div>
          )}
        </Card>

        <Card title="Money received" sub="By cash and GPay, including credit collected">
          {overview.data ? (
            <Donut
              format={formatCurrency}
              segments={[
                { label: 'Cash', value: overview.data.payment_split.cash, color: '#2dd4bf' },
                { label: 'GPay', value: overview.data.payment_split.gpay, color: '#60a5fa' },
                { label: 'Credit still to collect', value: totals?.outstanding_credit || 0, color: '#f59e0b' },
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
              rows={a.top_items.slice(0, 6).map((i) => ({
                id: i.name,
                label: i.name,
                sub: `${i.quantity} sold`,
                value: i.revenue,
              }))}
              format={formatCurrency}
            />
          ) : (
            <div className="a-empty">{analytics.loading ? 'Loading...' : 'No sales yet.'}</div>
          )}
        </Card>
      </div>
    </div>
  );
}
