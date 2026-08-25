import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPurchases } from '../api';
import { formatCurrency, formatDate } from '../format';

export default function PurchasesHistory() {
  const [purchases, setPurchases] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPurchases()
      .then(setPurchases)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="section-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          Purchases
        </h1>
        <Link className="btn btn-primary btn-sm" to="/purchases/add">
          + Add Purchase
        </Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : purchases.length === 0 ? (
        <div className="empty-state">No purchases recorded yet.</div>
      ) : (
        purchases.map((p) => (
          <Link className="list-item" to={`/purchases/${p._id}/edit`} key={p._id}>
            <div className="list-item-main">
              <span className="list-item-title">
                {p.item_name} &middot; {p.quantity} {p.unit_type}
              </span>
              <span className="list-item-sub">
                {p.vendor_name} &middot; {formatDate(p.date)}
              </span>
            </div>
            <span className="list-item-amount">{formatCurrency(p.amount)}</span>
          </Link>
        ))
      )}
    </div>
  );
}
