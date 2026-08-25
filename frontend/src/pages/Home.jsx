import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Receipt, Package, HandCoins, Trash2, BarChart3 } from 'lucide-react';
import { getDashboardSummary } from '../api';
import { formatCurrency } from '../format';

const QUICK_ACTIONS = [
  { to: '/sales/add', label: 'Sales', Icon: Receipt, color: 'tile-blue' },
  { to: '/purchases/add', label: 'Purchase', Icon: Package, color: 'tile-orange' },
  { to: '/credits/add', label: 'Credit', Icon: HandCoins, color: 'tile-green' },
  { to: '/spoilage/add', label: 'Spoilage', Icon: Trash2, color: 'tile-red' },
  { to: '/reports', label: 'Reports', Icon: BarChart3, color: 'tile-purple' },
];

export default function Home() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getDashboardSummary('day')
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
  }, []);

  return (
    <div className="dashboard-page">
      <h1 className="page-title">Dashboard</h1>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="empty-state">Loading summary...</div>
      ) : (
        summary && (
          <div className="grid-2">
            <div className="stat-tile">
              <div className="stat-label">Sales</div>
              <div className="stat-value">{formatCurrency(summary.total_sales)}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-label">Purchases</div>
              <div className="stat-value">{formatCurrency(summary.total_purchases)}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-label">Spoilage</div>
              <div className="stat-value">{formatCurrency(summary.total_spoilage)}</div>
            </div>
            <div className="stat-tile" style={{ gridColumn: '1 / -1' }}>
              <div className="stat-label">Outstanding Credit</div>
              <div className="stat-value negative">
                {formatCurrency(summary.total_outstanding_credit)}
              </div>
            </div>
          </div>
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
