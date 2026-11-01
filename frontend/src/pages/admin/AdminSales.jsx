import { useState } from 'react';
import { Wallet, Receipt, ShoppingBag, Boxes } from 'lucide-react';
import { adminGetSalesOverview } from '../../api';
import { formatCurrency } from '../../format';
import { LineChart, HBarList, Donut, SERIES } from './AdminCharts';
import { Kpi, Card, Delta, Tabs, ScopeBar, useScope } from './AdminUi';
import ComparePanel from './ComparePanel';
import useAdminData from './useAdminData';

export const SALES_METRICS = [
  { key: 'revenue', label: 'Revenue', kind: 'money', better: 'high' },
  { key: 'orders', label: 'Orders', kind: 'count', better: 'high' },
  { key: 'avg_order', label: 'Average order', kind: 'money', better: 'high' },
  { key: 'units_sold', label: 'Units sold', kind: 'count', better: 'high' },
  { key: 'money_received', label: 'Money received', kind: 'money', better: 'high' },
];

function Overview({ scope }) {
  const { query, tick } = scope;
  const { data, error, loading } = useAdminData(() => adminGetSalesOverview(query), [JSON.stringify(query), tick]);
  const t = data?.totals;
  const p = data?.previous;

  return (
    <>
      {error && <div className="a-error">{error}</div>}
      <div className="a-kpis">
        <Kpi icon={Wallet} tone="orange" label="Revenue" value={t ? formatCurrency(t.revenue) : '-'} delta={t && <Delta now={t.revenue} before={p?.revenue} />} />
        <Kpi icon={Receipt} tone="blue" label="Orders" value={t ? t.orders : '-'} delta={t && <Delta now={t.orders} before={p?.orders} />} />
        <Kpi icon={ShoppingBag} tone="green" label="Average order" value={t ? formatCurrency(t.avg_order) : '-'} delta={t && <Delta now={t.avg_order} before={p?.avg_order} />} />
        <Kpi icon={Boxes} tone="amber" label="Units sold" value={t ? t.units_sold : '-'} delta={t && <Delta now={t.units_sold} before={p?.units_sold} />} />
      </div>

      <div className="a-grid a-grid-2-1">
        <Card title="Revenue by day" sub="Cash and credit sales, less returns">
          {data?.trend.length ? (
            <LineChart data={data.trend.map((d) => ({ label: d.date.slice(5), a: d.revenue }))} />
          ) : (
            <div className="a-empty">{loading ? 'Loading...' : 'No sales yet.'}</div>
          )}
        </Card>
        <Card title="How customers paid" sub="Value of sales by payment type">
          {data ? (
            <Donut
              format={formatCurrency}
              segments={[
                { label: 'Cash', value: data.by_payment.cash, color: SERIES.orange },
                { label: 'GPay', value: data.by_payment.gpay, color: SERIES.blue },
                { label: 'Credit', value: data.by_payment.credit, color: SERIES.amber },
              ]}
            />
          ) : (
            <div className="a-empty">Loading...</div>
          )}
        </Card>
      </div>

      <div className="a-grid a-grid-2-1">
        <Card flush title="Stall performance" sub="Who is selling the most">
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Stall</th>
                  <th className="num">Revenue</th>
                  <th>Share</th>
                  <th className="num">Orders</th>
                  <th className="num">Avg order</th>
                  <th className="num">Units</th>
                </tr>
              </thead>
              <tbody>
                {(data?.by_stall || []).map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="num">{formatCurrency(s.revenue)}</td>
                    <td>
                      <div className="a-share"><span style={{ width: `${Math.min(s.share_pct, 100)}%` }} /></div>
                      <small className="muted">{s.share_pct}%</small>
                    </td>
                    <td className="num">{s.orders}</td>
                    <td className="num">{formatCurrency(s.avg_order)}</td>
                    <td className="num">{s.units_sold}</td>
                  </tr>
                ))}
                {!data?.by_stall.length && (
                  <tr><td colSpan={6} className="a-empty">{loading ? 'Loading...' : 'No stalls yet.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Top selling items" sub="By revenue">
          {data?.top_items.length ? (
            <HBarList format={formatCurrency} rows={data.top_items.map((i) => ({ id: i.name, label: i.name, sub: `${i.quantity} sold`, value: i.revenue }))} />
          ) : (
            <div className="a-empty">{loading ? 'Loading...' : 'No sales yet.'}</div>
          )}
        </Card>
      </div>
    </>
  );
}

export default function AdminSales() {
  const [tab, setTab] = useState('overview');
  const scope = useScope('all');

  return (
    <div>
      <div className="a-page-head">
        <div>
          <h1 className="a-title">Sales</h1>
          <p className="a-subtitle">Revenue, orders and how customers pay</p>
        </div>
        {tab === 'overview' && <ScopeBar scope={scope} />}
      </div>
      <Tabs tabs={[{ key: 'overview', label: 'Overview' }, { key: 'compare', label: 'Compare' }]} value={tab} onChange={setTab} />
      {tab === 'overview' ? <Overview scope={scope} /> : <ComparePanel metrics={SALES_METRICS} headline="revenue" />}
    </div>
  );
}
