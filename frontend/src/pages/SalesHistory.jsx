import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSales } from '../api';
import { formatCurrency, formatDate } from '../format';

export default function SalesHistory() {
  const [sales, setSales] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSales()
      .then(setSales)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="section-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          Sales
        </h1>
        <Link className="btn btn-primary btn-sm" to="/sales/add">
          + Add Sale
        </Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : sales.length === 0 ? (
        <div className="empty-state">No sales recorded yet.</div>
      ) : (
        sales.map((sale) => (
          <Link className="list-item" to={`/sales/${sale._id}/edit`} key={sale._id}>
            <div className="list-item-main">
              <span className="list-item-title">
                {sale.items?.length || 0} item{sale.items?.length === 1 ? '' : 's'} &middot;{' '}
                {sale.payment_mode}
              </span>
              <span className="list-item-sub">{formatDate(sale.date)}</span>
            </div>
            <span className="list-item-amount">{formatCurrency(sale.total_amount)}</span>
          </Link>
        ))
      )}
    </div>
  );
}
