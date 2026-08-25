import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardSummary } from '../api';
import { formatCurrency } from '../format';

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
    <div>
      <h1 className="page-title">Dashboard</h1>

      <div className="toggle-group">
        <button
          className={`toggle-option${period === 'day' ? ' active' : ''}`}
          onClick={() => setPeriod('day')}
        >
          Today
        </button>
        <button
          className={`toggle-option${period === 'week' ? ' active' : ''}`}
          onClick={() => setPeriod('week')}
        >
          Last 7 Days
        </button>
      </div>

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

      <div className="quick-actions">
        <Link className="action-btn" to="/sales/add">
          <span className="icon">🧾</span>
          Add Sale
        </Link>
        <Link className="action-btn" to="/purchases/add">
          <span className="icon">📦</span>
          Add Purchase
        </Link>
        <Link className="action-btn" to="/credits/add">
          <span className="icon">🤝</span>
          Add Credit
        </Link>
        <Link className="action-btn" to="/spoilage/add">
          <span className="icon">🗑️</span>
          Add Spoilage
        </Link>
      </div>
    </div>
  );
}
