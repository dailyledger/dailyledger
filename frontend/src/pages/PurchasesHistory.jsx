import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Undo2 } from 'lucide-react';
import { getPurchases, getPurchaseReturns, createPurchaseReturn } from '../api';
import { formatCurrency, formatDate } from '../format';

function PurchaseReturnModal({ purchase, onClose, onReturned }) {
  const [returns, setReturns] = useState([]);
  const [loadingReturns, setLoadingReturns] = useState(true);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadReturns = () => {
    setLoadingReturns(true);
    getPurchaseReturns(purchase._id)
      .then(setReturns)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingReturns(false));
  };

  useEffect(() => {
    loadReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchase._id]);

  const alreadyReturned = returns.reduce((sum, r) => sum + r.quantity, 0);
  const returnable = purchase.quantity - alreadyReturned;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      setError('Enter a valid return quantity.');
      return;
    }

    setSubmitting(true);
    try {
      await createPurchaseReturn(purchase._id, { quantity: qty, reason: reason || undefined });
      setQuantity('');
      setReason('');
      loadReturns();
      onReturned();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="page-title" style={{ fontSize: '1.1rem' }}>
          Return to vendor &middot; {purchase.item_name}
        </h2>

        {error && <div className="error-banner">{error}</div>}

        {!loadingReturns && returns.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="form-label" style={{ marginBottom: 8 }}>
              Already returned
            </div>
            {returns.map((r) => (
              <div key={r._id} className="list-item-sub">
                {r.quantity} × {r.item_name} — {formatCurrency(r.refund_amount)}
                {r.reason ? ` (${r.reason})` : ''}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">
              Quantity to return
              <span className="stock-hint">
                {returnable} of {purchase.quantity} returnable
              </span>
            </label>
            <input
              className="form-input"
              type="number"
              min="0"
              max={returnable}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              autoFocus
              disabled={returnable <= 0}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Reason (optional)</label>
            <input
              className="form-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
              Close
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PurchasesHistory() {
  const [purchases, setPurchases] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [returnPurchase, setReturnPurchase] = useState(null);

  const loadPurchases = () => {
    setLoading(true);
    getPurchases()
      .then(setPurchases)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPurchases();
  }, []);

  const openReturnModal = (e, purchase) => {
    e.preventDefault();
    e.stopPropagation();
    setReturnPurchase(purchase);
  };

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
            <div className="list-item-actions">
              <button
                type="button"
                className="icon-btn"
                onClick={(e) => openReturnModal(e, p)}
                aria-label="Return to vendor"
                title="Return"
              >
                <Undo2 size={16} />
              </button>
              <span className="list-item-amount">{formatCurrency(p.amount)}</span>
            </div>
          </Link>
        ))
      )}

      {returnPurchase && (
        <PurchaseReturnModal
          purchase={returnPurchase}
          onClose={() => setReturnPurchase(null)}
          onReturned={loadPurchases}
        />
      )}
    </div>
  );
}
