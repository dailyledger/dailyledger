import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban } from 'lucide-react';
import { getProductions, cancelProduction } from '../api';
import { formatCurrency, formatDate } from '../format';
import ConfirmDialog from '../components/ConfirmDialog';
import StockWarningDialog from '../components/StockWarningDialog';

export default function CookingHistory() {
  const [batches, setBatches] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [toCancel, setToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [shortfalls, setShortfalls] = useState(null);

  const load = () => {
    setLoading(true);
    getProductions()
      .then(setBatches)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  // Cancelling puts the ingredients back and takes the dish out of stock. If some
  // of the dish was already sold the server asks first, then this repeats with
  // the owner's confirmation.
  const cancel = async (allowNegative) => {
    setCancelling(true);
    setError('');
    try {
      await cancelProduction(toCancel._id, 'cancelled from cooking list', allowNegative);
      setToCancel(null);
      setShortfalls(null);
      load();
    } catch (err) {
      if (err.needsStockConfirmation) {
        setShortfalls(err.shortfalls);
      } else {
        setError(err.message);
        setToCancel(null);
      }
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div>
      <div className="section-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          Cooking
        </h1>
        <Link className="btn btn-primary btn-sm" to="/cooking/add">
          + Add Cooking
        </Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : batches.length === 0 ? (
        <div className="empty-state">Nothing cooked yet. Buy raw materials, then add a cooking batch.</div>
      ) : (
        batches.map((batch) => (
          <div className="list-item" key={batch._id}>
            <div className="list-item-main">
              <span className="list-item-title">
                {batch.dish_name} &middot; {batch.quantity} {batch.unit_type}
              </span>
              <span className="list-item-sub">
                {batch.ingredients.map((i) => `${i.item_name} ${i.quantity}`).join(', ')}
              </span>
              <span className="list-item-sub">
                {formatDate(batch.date)} &middot; cost {formatCurrency(batch.cost_per_unit)} per {batch.unit_type}
              </span>
            </div>
            <div className="list-item-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setToCancel(batch)}
                aria-label="Cancel this cooking batch"
              >
                <Ban size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                Cancel
              </button>
              <span className="list-item-amount">{formatCurrency(batch.total_cost)}</span>
            </div>
          </div>
        ))
      )}

      <ConfirmDialog
        open={Boolean(toCancel) && !shortfalls}
        danger
        title="Cancel this cooking batch?"
        message={
          toCancel
            ? `The ingredients go back into stock and ${toCancel.quantity} ${toCancel.unit_type} of ` +
              `${toCancel.dish_name} comes out of stock.`
            : ''
        }
        confirmLabel="Cancel batch"
        cancelLabel="Keep it"
        busy={cancelling}
        onConfirm={() => cancel(false)}
        onCancel={() => setToCancel(null)}
      />

      <StockWarningDialog
        shortfalls={shortfalls}
        busy={cancelling}
        onConfirm={() => cancel(true)}
        onCancel={() => {
          setShortfalls(null);
          setToCancel(null);
        }}
      />
    </div>
  );
}
