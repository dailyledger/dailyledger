import { Wallet, TrendingUp, Receipt, Percent, Sparkles, AlertTriangle, Info } from 'lucide-react';
import { adminGetOverview, adminGetComparison, adminGetAnalytics, adminGetRecent, adminGetInsights } from '../../api';
import { formatCurrency } from '../../format';
import { LineChart, BarChart, HBarList, Donut, SERIES } from './AdminCharts';
import { Kpi, Card, Delta, ScopeBar, useScope, useInterval, avatarColor, timeAgo } from './AdminUi';
import useAdminData from './useAdminData';

const hourLabel = (hour) => `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'a' : 'p'}`;

const TONE_ICON = { good: Sparkles, warn: AlertTriangle, info: Info };

function Insights({ items, loading }) {
  const warn = items.filter((i) => i.tone === 'warn');
  const good = items.filter((i) => i.tone !== 'warn');

  const List = ({ list }) => (
    <ul className="a-insights">
      {list.map((i) => {
        const Icon = TONE_ICON[i.tone] || Info;
        return (
          <li key={i.id} className={`tone-${i.tone}`}>
            <span className="a-insight-icon">
              <Icon size={16} />
            </span>
            <span>
              <strong>{i.title}</strong>
              <span>{i.text}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <Card title="Highlights" sub="What the numbers say right now">
        {good.length ? <List list={good} /> : <div className="a-empty">{loading ? 'Loading...' : 'Nothing to highlight yet.'}</div>}
      </Card>
      <Card
        title="Alerts"
        sub={warn.length ? 'Worth a look' : 'All clear'}
        aside={warn.length > 0 && <span className="a-pill off">{warn.length}</span>}
      >
        {warn.length ? <List list={warn} /> : <div className="a-empty">{loading ? 'Loading...' : 'No alerts right now.'}</div>}
      </Card>
    </>
  );
}

export default function AdminDashboard() {
  const scope = useScope('all');
  const { query, tick } = scope;

  // The activity feed and alerts refresh by themselves every half minute.
  useInterval(scope.reload, 30000);

  const key = JSON.stringify(query);
  const overview = useAdminData(() => adminGetOverview(query), [key, tick]);
  const comparison = useAdminData(() => adminGetComparison(query), [key, tick]);
  const analytics = useAdminData(() => adminGetAnalytics(query), [key, tick]);
  const recent = useAdminData(() => adminGetRecent({ stalls: query.stalls, limit: 8 }), [query.stalls, tick]);
  const insights = useAdminData(() => adminGetInsights(query), [key, tick]);

  const totals = overview.data?.totals;
  const before = overview.data?.previous;
  const error = overview.error || comparison.error || analytics.error;
  const a = analytics.data;
  const hasSales = a && a.trend.length > 0;

  const stallRows = (comparison.data?.stalls || []).map((s) => ({ id: s.id, label: s.name, value: s.net_profit }));
  const top = (comparison.data?.stalls || []).filter((s) => s.revenue > 0).slice(0, 3);

  return (
    <div>
      <div className="a-page-head">
        <div>
          <h1 className="a-title">Dashboard</h1>
          <p className="a-subtitle">How every stall is doing, at a glance</p>
        </div>
        <ScopeBar scope={scope} />
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
                  <span><span className="a-dot" style={{ background: SERIES.orange }} />Revenue</span>
                  <span><span className="a-dot" style={{ background: SERIES.green }} />Profit</span>
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

          <Insights items={insights.data?.items || []} loading={insights.loading} />

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
