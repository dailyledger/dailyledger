import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Receipt, Package, HandCoins, Trash2, BarChart3, Boxes } from 'lucide-react';
import { getDashboardSummary } from '../api';
import { formatCurrency } from '../format';

const QUICK_ACTIONS = [
  { to: '/sales/add', label: 'Sales', Icon: Receipt, color: 'tile-blue' },
  { to: '/purchases/add', label: 'Purchase', Icon: Package, color: 'tile-orange' },
  { to: '/credits/add', label: 'Credit', Icon: HandCoins, color: 'tile-green' },
  { to: '/spoilage/add', label: 'Spoilage', Icon: Trash2, color: 'tile-red' },
  { to: '/reports', label: 'Reports', Icon: BarChart3, color: 'tile-teal' },
  { to: '/inventory', label: 'Inventory', Icon: Boxes, color: 'tile-slate' },
];

const PERIODS = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
];

export default function Home() {
  const [period, setPeriod] = useState('day');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    getDashboardSummary(period)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div className="dashboard-page">
      <h1 className="page-title">Dashboard</h1>

      <div className="report-tabs">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={`report-tab${period === p.key ? ' active' : ''}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="empty-state">Loading summary...</div>
      ) : (
        summary && (
          <>
            <div className="grid-2">
              <div className="stat-tile">
                <div className="stat-label">Revenue</div>
                <div className="stat-value">{formatCurrency(summary.revenue)}</div>
                <div className="stat-note">
                  {formatCurrency(summary.total_sales)} cash/UPI
                  {summary.total_credit_sales > 0 &&
                    ` + ${formatCurrency(summary.total_credit_sales)} on credit`}
                </div>
              </div>

              {/*
                Gross profit is revenue minus what those goods cost us, taken from
                the cost frozen on each sale line. It is no longer sales minus
                purchases, which reported a huge loss on any day stock was bought.
              */}
              <div className="stat-tile">
                <div className="stat-label">Gross Profit</div>
                <div className={`stat-value${summary.gross_profit < 0 ? ' negative' : ''}`}>
                  {formatCurrency(summary.gross_profit)}
                </div>
                <div className="stat-note">
                  after {formatCurrency(summary.cost_of_goods_sold)} cost of goods
                </div>
              </div>

              <div className="stat-tile">
                <div className="stat-label">Spoilage</div>
                <div className="stat-value">{formatCurrency(summary.total_spoilage)}</div>
              </div>

              <div className="stat-tile">
                <div className="stat-label">Net Profit</div>
                <div className={`stat-value${summary.net_profit < 0 ? ' negative' : ''}`}>
                  {formatCurrency(summary.net_profit)}
                </div>
                <div className="stat-note">gross profit less spoilage</div>
              </div>

              <div className="stat-tile">
                <div className="stat-label">Stock Bought</div>
                <div className="stat-value">{formatCurrency(summary.total_purchases)}</div>
                <div className="stat-note">cash out, not a loss</div>
              </div>

              <div className="stat-tile">
                <div className="stat-label">Outstanding Credit</div>
                <div className="stat-value negative">
                  {formatCurrency(summary.total_outstanding_credit)}
                </div>
                <div className="stat-note">owed to you, all time</div>
              </div>
            </div>

            <p className="dashboard-footnote">
              {summary.period === 'day'
                ? `Business day ${summary.to}`
                : `${summary.from} to ${summary.to}`}{' '}
              &middot; {summary.timezone}
            </p>
          </>
        )
      )}

      <div className="app-tile-grid">
        {QUICK_ACTIONS.map(({ to, label, Icon, color }) => (
          <Link className="app-tile" to={to} key={to}>
            <span className={`app-tile-icon ${color}`}>
              <Icon size={26} strokeWidth={2} />
            </span>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
