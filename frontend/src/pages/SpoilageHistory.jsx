import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Plus } from 'lucide-react';
import { getSpoilageEntries, cancelSpoilage } from '../api';
import { formatCurrency, formatDate } from '../format';
import ConfirmDialog from '../components/ConfirmDialog';

export default function SpoilageHistory() {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [toCancel, setToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const load = () => {
    setLoading(true);
    getSpoilageEntries()
      .then(setEntries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCancel = (e, entry) => {
    e.preventDefault();
    e.stopPropagation();
    setToCancel(entry);
  };

  // Cancelling puts the written-off goods back into stock.
  const confirmCancel = async () => {
    setCancelling(true);
    setError('');
    try {
      await cancelSpoilage(toCancel._id, 'cancelled from spoilage list');
      setToCancel(null);
      load();
    } catch (err) {
      setError(err.message);
      setToCancel(null);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div>
      <div className="section-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          Spoilage
        </h1>
        <Link className="btn-add" to="/spoilage/add">
          <Plus size={18} strokeWidth={2.5} />
          Add Spoilage
        </Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="empty-state">No spoilage recorded yet.</div>
      ) : (
        entries.map((entry) => (
          <Link className="list-item" to={`/spoilage/${entry._id}/edit`} key={entry._id}>
            <div className="list-item-main">
              <span className="list-item-title">
                {entry.item_name} &middot; {entry.quantity} {entry.unit_type}
              </span>
              <span className="list-item-sub">
                {entry.reason} &middot; {formatDate(entry.date)}
              </span>
              {entry.stock_warning && (
                <span className="row-warning">Recorded with stock going negative</span>
              )}
            </div>
            <div className="list-item-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={(e) => openCancel(e, entry)}
                aria-label="Cancel this spoilage entry"
              >
                <Ban size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                Cancel
              </button>
              <span className="list-item-amount">{formatCurrency(entry.estimated_value)}</span>
            </div>
          </Link>
        ))
      )}

      <ConfirmDialog
        open={Boolean(toCancel)}
        danger
        title="Cancel this spoilage entry?"
        message={
          toCancel
            ? `${toCancel.quantity} ${toCancel.unit_type} of ${toCancel.item_name} will go back ` +
              `into stock and the loss will be removed from your reports.`
            : ''
        }
        confirmLabel="Cancel entry"
        cancelLabel="Keep it"
        busy={cancelling}
        onConfirm={confirmCancel}
        onCancel={() => setToCancel(null)}
      />
    </div>
  );
}
