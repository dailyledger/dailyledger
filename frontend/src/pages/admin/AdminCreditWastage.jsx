import { useState } from 'react';
import { HandCoins, FileText, Wallet, Trash2, Percent } from 'lucide-react';
import { adminGetCreditWastage } from '../../api';
import { formatCurrency } from '../../format';
import { LineChart, HBarList, Donut, SERIES } from './AdminCharts';
import { Kpi, Card, Tabs, ScopeBar, useScope } from './AdminUi';
import useAdminData from './useAdminData';

export default function AdminCreditWastage() {
  const [tab, setTab] = useState('credit');
  const scope = useScope('all');
  const { query, tick } = scope;
  const { data, error, loading } = useAdminData(() => adminGetCreditWastage(query), [JSON.stringify(query), tick]);
  const c = data?.credit;
  const w = data?.wastage;

  return (
    <div>
      <div className="a-page-head">
        <div>
          <h1 className="a-title">Credit &amp; Wastage</h1>
          <p className="a-subtitle">Money still to collect, and stock that was lost</p>
        </div>
        <ScopeBar scope={scope} />
      </div>
      <Tabs tabs={[{ key: 'credit', label: 'Credit' }, { key: 'wastage', label: 'Wastage' }]} value={tab} onChange={setTab} />
      {error && <div className="a-error">{error}</div>}

      {tab === 'credit' ? (
        <>
          <div className="a-kpis a-kpis-3">
            <Kpi icon={HandCoins} tone="amber" label="Still to collect" value={c ? formatCurrency(c.outstanding) : '-'} negative={c && c.outstanding > 0} />
            <Kpi icon={FileText} tone="blue" label="Open credits" value={c ? c.open_count : '-'} />
            <Kpi icon={Wallet} tone="green" label="Collected in this period" value={c ? formatCurrency(c.collected) : '-'} />
          </div>
          <div className="a-grid a-grid-1-1">
            <Card title="How old is the debt" sub="Outstanding credit by age">
              {c ? (
                <HBarList color={SERIES.amber} format={formatCurrency} rows={c.ageing.map((a) => ({ id: a.key, label: a.label, sub: `${a.count} credit${a.count === 1 ? '' : 's'}`, value: a.amount }))} />
              ) : (
                <div className="a-empty">Loading...</div>
              )}
            </Card>
            <Card title="Owed per stall" sub="Credit still to collect">
              {c?.by_stall.length ? (
                <HBarList color={SERIES.orange} format={formatCurrency} rows={c.by_stall.map((s) => ({ id: s.id, label: s.name, value: s.outstanding }))} />
              ) : (
                <div className="a-empty">{loading ? 'Loading...' : 'No credit owed.'}</div>
              )}
            </Card>
          </div>
          <Card flush title="Who owes the most" sub="Customers with the largest balances">
            <div className="a-table-wrap">
              <table className="a-table">
                <thead>
                  <tr><th>Customer</th><th>Stall</th><th className="num">Balance</th><th className="num">Oldest</th></tr>
                </thead>
                <tbody>
                  {(c?.top_debtors || []).map((d) => (
                    <tr key={`${d.stall}-${d.customer}`}>
                      <td>{d.customer}</td>
                      <td>{d.stall}</td>
                      <td className="num">{formatCurrency(d.balance)}</td>
                      <td className={`num${d.oldest_days > 30 ? ' neg' : ''}`}>{d.oldest_days} days</td>
                    </tr>
                  ))}
                  {!c?.top_debtors.length && <tr><td colSpan={4} className="a-empty">{loading ? 'Loading...' : 'Nobody owes anything.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <>
          <div className="a-kpis a-kpis-3">
            <Kpi icon={Trash2} tone="orange" label="Stock written off" value={w ? formatCurrency(w.total) : '-'} negative={w && w.total > 0} />
            <Kpi icon={Percent} tone="amber" label="Waste of stock bought" value={w ? `${w.waste_pct}%` : '-'} negative={w && w.waste_pct >= 10} />
            <Kpi icon={Trash2} tone="blue" label="Expired vs damaged" value={w ? `${formatCurrency(w.by_reason.expired)} / ${formatCurrency(w.by_reason.damaged)}` : '-'} />
          </div>
          <div className="a-grid a-grid-2-1">
            <Card title="Wastage by day" sub="Value of stock written off">
              {w?.trend.length ? (
                <LineChart data={w.trend.map((d) => ({ label: d.date.slice(5), a: d.value }))} colorA={SERIES.orange} />
              ) : (
                <div className="a-empty">{loading ? 'Loading...' : 'Nothing written off.'}</div>
              )}
            </Card>
            <Card title="Why it was lost" sub="Expired or damaged">
              {w ? (
                <Donut
                  format={formatCurrency}
                  segments={[
                    { label: 'Expired', value: w.by_reason.expired, color: SERIES.orange },
                    { label: 'Damaged', value: w.by_reason.damaged, color: SERIES.amber },
                  ]}
                />
              ) : (
                <div className="a-empty">Loading...</div>
              )}
            </Card>
          </div>
          <div className="a-grid a-grid-1-1">
            <Card title="Waste by stall" sub="Value written off, and the share of what the stall bought">
              {w?.by_stall.length ? (
                <HBarList color={SERIES.orange} format={formatCurrency} rows={w.by_stall.map((s) => ({ id: s.id, label: s.name, sub: `${s.waste_pct}% of stock bought`, value: s.value }))} />
              ) : (
                <div className="a-empty">{loading ? 'Loading...' : 'No waste recorded.'}</div>
              )}
            </Card>
            <Card flush title="Most wasted items" sub="By value">
              <div className="a-table-wrap">
                <table className="a-table">
                  <thead>
                    <tr><th>Item</th><th className="num">Quantity</th><th className="num">Value</th></tr>
                  </thead>
                  <tbody>
                    {(w?.top_items || []).map((i) => (
                      <tr key={i.name}>
                        <td>{i.name}</td>
                        <td className="num">{i.quantity}</td>
                        <td className="num">{formatCurrency(i.value)}</td>
                      </tr>
                    ))}
                    {!w?.top_items.length && <tr><td colSpan={3} className="a-empty">{loading ? 'Loading...' : 'Nothing wasted.'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
