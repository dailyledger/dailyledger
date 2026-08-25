import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSpoilageEntries } from '../api';
import { formatCurrency, formatDate } from '../format';

export default function SpoilageHistory() {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSpoilageEntries()
      .then(setEntries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="section-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          Spoilage
        </h1>
        <Link className="btn btn-primary btn-sm" to="/spoilage/add">
          + Add Spoilage
        </Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="empty-state">No spoilage recorded yet.</div>
      ) : (
        entries.map((entry) => (
          <div className="list-item" key={entry._id}>
            <div className="list-item-main">
              <span className="list-item-title">
                {entry.item_name} &middot; {entry.quantity} {entry.unit_type}
              </span>
              <span className="list-item-sub">
                {entry.reason} &middot; {formatDate(entry.date)}
              </span>
            </div>
            <span className="list-item-amount">{formatCurrency(entry.estimated_value)}</span>
          </div>
        ))
      )}
    </div>
  );
}
