import { useState } from 'react';
import { Boxes, Layers, PackageX, Trash2 } from 'lucide-react';
import { adminGetInventoryOverview } from '../../api';
import { formatCurrency } from '../../format';
import { HBarList, Donut, SERIES } from './AdminCharts';
import { Kpi, Card, Tabs, ScopeBar, useScope } from './AdminUi';
import ComparePanel from './ComparePanel';
import useAdminData from './useAdminData';

export const INVENTORY_METRICS = [
  { key: 'stock_value', label: 'Stock value', kind: 'money', better: null },
  { key: 'low_stock', label: 'Items running low', kind: 'count', better: 'low' },
  { key: 'out_of_stock', label: 'Items out of stock', kind: 'count', better: 'low' },
  { key: 'spoilage', label: 'Wasted stock', kind: 'money', better: 'low' },
  { key: 'waste_pct', label: 'Waste of stock bought', kind: 'percent', better: 'low' },
  { key: 'credit_outstanding', label: 'Credit still owed', kind: 'money', better: 'low' },
];

const STATUS = {
  negative: { label: 'Negative', cls: 'off', hint: 'A purchase was probably not recorded' },
  out: { label: 'Out of stock', cls: 'off', hint: '' },
  low: { label: 'Running low', cls: 'warn', hint: '' },
};
const KIND = { resale: 'Resale', raw: 'Raw material', cooked: 'Cooked dish' };

function Overview({ scope }) {
  const { query, tick } = scope;
  const { data, error, loading } = useAdminData(() => adminGetInventoryOverview(query), [JSON.stringify(query), tick]);
  const t = data?.totals;

  return (
    <>
      {error && <div className="a-error">{error}</div>}
      <div className="a-kpis">
        <Kpi icon={Boxes} tone="orange" label="Stock value (at cost)" value={t ? formatCurrency(t.stock_value) : '-'} />
        <Kpi icon={Layers} tone="blue" label="Items in stock lists" value={t ? t.items : '-'} />
        <Kpi icon={PackageX} tone="amber" label="Low or out of stock" value={t ? t.low + t.out : '-'} negative={t && t.out > 0} />
        <Kpi icon={Trash2} tone="green" label="Waste of stock bought" value={t ? `${t.waste_pct}%` : '-'} negative={t && t.waste_pct >= 10} />
      </div>

      <div className="a-grid a-grid-2-1">
        <Card title="Stock value by stall" sub="What each stall has on its shelves, at cost">
          {data?.by_stall.length ? (
            <HBarList format={formatCurrency} rows={data.by_stall.map((s) => ({ id: s.id, label: s.name, sub: `${s.items} items`, value: s.stock_value }))} />
          ) : (
            <div className="a-empty">{loading ? 'Loading...' : 'No stalls yet.'}</div>
          )}
        </Card>
        <Card title="Kinds of stock" sub="Value on hand by type">
          {data ? (
            <Donut
              format={formatCurrency}
              segments={[
                { label: 'For resale', value: data.totals.by_kind.resale, color: SERIES.blue },
                { label: 'Raw materials', value: data.totals.by_kind.raw, color: SERIES.orange },
                { label: 'Cooked dishes', value: data.totals.by_kind.cooked, color: SERIES.green },
              ]}
            />
          ) : (
            <div className="a-empty">Loading...</div>
          )}
        </Card>
      </div>

      <div className="a-grid a-grid-2-1">
        <Card flush title="Needs attention" sub="Stock that is negative, finished or nearly finished">
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr><th>Item</th><th>Stall</th><th>Type</th><th className="num">Left</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(data?.attention || []).map((a) => (
                  <tr key={`${a.shop}-${a.item}`} title={STATUS[a.status].hint}>
                    <td>{a.item}</td>
                    <td>{a.stall}</td>
                    <td className="muted">{KIND[a.kind]}</td>
                    <td className="num">{a.quantity} {a.unit}</td>
                    <td><span className={`a-pill ${STATUS[a.status].cls}`}>{STATUS[a.status].label}</span></td>
                  </tr>
                ))}
                {!data?.attention.length && <tr><td colSpan={5} className="a-empty">{loading ? 'Loading...' : 'Everything is well stocked.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Wastage" sub="Expired and damaged stock, in this period">
          {data ? (
            <Donut
              format={formatCurrency}
              segments={[
                { label: 'Expired', value: data.wastage_by_reason.expired, color: SERIES.orange },
                { label: 'Damaged', value: data.wastage_by_reason.damaged, color: SERIES.amber },
              ]}
            />
          ) : (
            <div className="a-empty">Loading...</div>
          )}
        </Card>
      </div>

      <Card flush title="Stall by stall" sub="Stock health and waste for every stall">
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>Stall</th>
                <th className="num">Items</th>
                <th className="num">Stock value</th>
                <th className="num">Low</th>
                <th className="num">Out</th>
                <th className="num">Negative</th>
                <th className="num">Wasted</th>
                <th className="num">Waste %</th>
              </tr>
            </thead>
            <tbody>
              {(data?.by_stall || []).map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="num">{s.items}</td>
                  <td className="num">{formatCurrency(s.stock_value)}</td>
                  <td className="num">{s.low}</td>
                  <td className={`num${s.out ? ' neg' : ''}`}>{s.out}</td>
                  <td className={`num${s.negative ? ' neg' : ''}`}>{s.negative}</td>
                  <td className="num">{formatCurrency(s.wastage_value)}</td>
                  <td className={`num${s.waste_pct >= 10 ? ' neg' : ''}`}>{s.waste_pct}%</td>
                </tr>
              ))}
              {!data?.by_stall.length && <tr><td colSpan={8} className="a-empty">{loading ? 'Loading...' : 'No stalls yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

export default function AdminInventory() {
  const [tab, setTab] = useState('overview');
  const scope = useScope('all');

  return (
    <div>
      <div className="a-page-head">
        <div>
          <h1 className="a-title">Inventory</h1>
          <p className="a-subtitle">Stock on every shelf, what is running out, and what is being wasted</p>
        </div>
        {tab === 'overview' && <ScopeBar scope={scope} />}
      </div>
      <Tabs tabs={[{ key: 'overview', label: 'Overview' }, { key: 'compare', label: 'Compare' }]} value={tab} onChange={setTab} />
      {tab === 'overview' ? <Overview scope={scope} /> : <ComparePanel metrics={INVENTORY_METRICS} headline="stock_value" />}
    </div>
  );
}
