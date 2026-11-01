import { useState } from 'react';
import { ShoppingCart, ClipboardList, Calculator, Percent, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { adminGetPurchasesOverview } from '../../api';
import { formatCurrency } from '../../format';
import { LineChart, HBarList, Donut, SERIES } from './AdminCharts';
import { Kpi, Card, Delta, Tabs, ScopeBar, useScope } from './AdminUi';
import ComparePanel from './ComparePanel';
import useAdminData from './useAdminData';

export const PURCHASE_METRICS = [
  { key: 'purchases', label: 'Stock bought', kind: 'money', better: null },
  { key: 'spoilage', label: 'Wasted stock', kind: 'money', better: 'low' },
  { key: 'waste_pct', label: 'Waste of stock bought', kind: 'percent', better: 'low' },
  { key: 'net_profit', label: 'Net profit', kind: 'money', better: 'high' },
  { key: 'margin_pct', label: 'Profit margin', kind: 'percent', better: 'high' },
];

function Overview({ scope }) {
  const { query, tick } = scope;
  const { data, error, loading } = useAdminData(() => adminGetPurchasesOverview(query), [JSON.stringify(query), tick]);
  const t = data?.totals;
  const p = data?.previous;

  return (
    <>
      {error && <div className="a-error">{error}</div>}
      <div className="a-kpis">
        <Kpi icon={ShoppingCart} tone="orange" label="Stock bought" value={t ? formatCurrency(t.spent) : '-'} delta={t && <Delta now={t.spent} before={p?.spent} goodWhenDown />} />
        <Kpi icon={ClipboardList} tone="blue" label="Purchases made" value={t ? t.count : '-'} delta={t && <Delta now={t.count} before={p?.count} />} />
        <Kpi icon={Calculator} tone="green" label="Average purchase" value={t ? formatCurrency(t.avg_purchase) : '-'} />
        <Kpi icon={Percent} tone="amber" label="Spent per ₹100 of sales" value={t ? formatCurrency(t.spend_pct_of_revenue) : '-'} />
      </div>

      <div className="a-grid a-grid-2-1">
        <Card title="Spending by day" sub="Stock bought, less anything returned to the vendor">
          {data?.trend.length ? (
            <LineChart data={data.trend.map((d) => ({ label: d.date.slice(5), a: d.spent }))} />
          ) : (
            <div className="a-empty">{loading ? 'Loading...' : 'No purchases yet.'}</div>
          )}
        </Card>
        <Card title="What was bought" sub="Ingredients vs items for resale">
          {data ? (
            <Donut
              format={formatCurrency}
              segments={[
                { label: 'Raw materials', value: data.by_kind.raw, color: SERIES.orange },
                { label: 'For resale', value: data.by_kind.resale, color: SERIES.blue },
              ]}
            />
          ) : (
            <div className="a-empty">Loading...</div>
          )}
        </Card>
      </div>

      <div className="a-grid a-grid-2-1">
        <Card flush title="Spending by stall" sub="How much each stall bought">
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Stall</th>
                  <th className="num">Bought</th>
                  <th>Share</th>
                  <th className="num">Purchases</th>
                  <th className="num">Per ₹100 of sales</th>
                </tr>
              </thead>
              <tbody>
                {(data?.by_stall || []).map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="num">{formatCurrency(s.spent)}</td>
                    <td>
                      <div className="a-share"><span style={{ width: `${Math.min(s.share_pct, 100)}%` }} /></div>
                      <small className="muted">{s.share_pct}%</small>
                    </td>
                    <td className="num">{s.count}</td>
                    <td className="num">{formatCurrency(s.spend_pct_of_revenue)}</td>
                  </tr>
                ))}
                {!data?.by_stall.length && <tr><td colSpan={5} className="a-empty">{loading ? 'Loading...' : 'No stalls yet.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Top vendors" sub="By amount bought">
          {data?.top_vendors.length ? (
            <HBarList format={formatCurrency} rows={data.top_vendors.map((v) => ({ id: v.name, label: v.name, sub: `${v.count} purchase${v.count > 1 ? 's' : ''}`, value: v.spent }))} />
          ) : (
            <div className="a-empty">{loading ? 'Loading...' : 'No purchases yet.'}</div>
          )}
        </Card>
      </div>

      <div className="a-grid a-grid-1-1">
        <Card title="Biggest spends" sub="Items that cost the most to stock">
          {data?.top_items.length ? (
            <HBarList format={formatCurrency} rows={data.top_items.map((i) => ({ id: i.name, label: i.name, value: i.spent }))} />
          ) : (
            <div className="a-empty">{loading ? 'Loading...' : 'No purchases yet.'}</div>
          )}
        </Card>
        <Card flush title="Price watch" sub="Items whose cost moved 5% or more between purchases">
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr><th>Item</th><th>Stall</th><th className="num">First</th><th className="num">Latest</th><th className="num">Change</th></tr>
              </thead>
              <tbody>
                {(data?.price_watch || []).map((w) => (
                  <tr key={`${w.stall}-${w.name}`}>
                    <td>{w.name}</td>
                    <td>{w.stall}</td>
                    <td className="num">{formatCurrency(w.first)}</td>
                    <td className="num">{formatCurrency(w.last)}</td>
                    <td className="num">
                      <span className={`a-delta ${w.change_pct > 0 ? 'down' : 'up'}`}>
                        {w.change_pct > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        {Math.abs(w.change_pct).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
                {!data?.price_watch.length && <tr><td colSpan={5} className="a-empty">{loading ? 'Loading...' : 'No big price changes.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

export default function AdminPurchases() {
  const [tab, setTab] = useState('overview');
  const scope = useScope('all');

  return (
    <div>
      <div className="a-page-head">
        <div>
          <h1 className="a-title">Purchases</h1>
          <p className="a-subtitle">What the stalls buy, from whom, and at what price</p>
        </div>
        {tab === 'overview' && <ScopeBar scope={scope} />}
      </div>
      <Tabs tabs={[{ key: 'overview', label: 'Overview' }, { key: 'compare', label: 'Compare' }]} value={tab} onChange={setTab} />
      {tab === 'overview' ? <Overview scope={scope} /> : <ComparePanel metrics={PURCHASE_METRICS} headline="purchases" />}
    </div>
  );
}
