import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Undo2, Ban } from 'lucide-react';
import {
  getPurchases,
  getPurchaseReturns,
  createPurchaseReturn,
  cancelPurchase,
} from '../api';
import { formatCurrency, formatDate } from '../format';
import ConfirmDialog from '../components/ConfirmDialog';

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
  const [toCancel, setToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);

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

  const openCancel = (e, purchase) => {
    e.preventDefault();
    e.stopPropagation();
    setToCancel(purchase);
  };

  // Cancelling removes the stock this purchase added. The server refuses if any
  // of it has already been sold, since that stock genuinely left the shop.
  const confirmCancel = async () => {
    setCancelling(true);
    setError('');
    try {
      await cancelPurchase(toCancel._id, 'cancelled from purchases list');
      setToCancel(null);
      loadPurchases();
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
        purchases.map((p) => {
          const netQuantity = p.net_quantity ?? p.quantity;
          const returnedQuantity = p.returned_quantity || 0;
          return (
            <Link className="list-item" to={`/purchases/${p._id}/edit`} key={p._id}>
              <div className="list-item-main">
                <span className="list-item-title">
                  {p.item_name} &middot; {netQuantity} {p.unit_type}
                  {p.units_per_pack > 1 && (
                    <span className="list-item-sub" style={{ display: 'inline' }}>
                      {' '}
                      ({p.quantity} × {p.units_per_pack}/pack)
                    </span>
                  )}
                </span>
                <span className="list-item-sub">
                  {p.vendor_name} &middot; {formatDate(p.date)}
                </span>
                {returnedQuantity > 0 && (
                  <span className="badge badge-unpaid" style={{ marginTop: 4, width: 'fit-content' }}>
                    Returned: {returnedQuantity} {p.unit_type}
                  </span>
                )}
              </div>
              <div className="list-item-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => openReturnModal(e, p)}
                  aria-label="Return to vendor"
                >
                  <Undo2 size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                  Return
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => openCancel(e, p)}
                  aria-label="Cancel this purchase"
                >
                  <Ban size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                  Cancel
                </button>
                <span className="list-item-amount">
                  {formatCurrency(p.net_amount ?? p.amount)}
                </span>
              </div>
            </Link>
          );
        })
      )}

      {returnPurchase && (
        <PurchaseReturnModal
          purchase={returnPurchase}
          onClose={() => setReturnPurchase(null)}
          onReturned={loadPurchases}
        />
      )}

      <ConfirmDialog
        open={Boolean(toCancel)}
        danger
        title="Cancel this purchase?"
        message={
          toCancel
            ? `${formatCurrency(toCancel.amount)} from ${toCancel.vendor_name} will be removed ` +
              `from your reports and the stock it added taken back out. This is refused if any ` +
              `of it has already been sold.`
            : ''
        }
        confirmLabel="Cancel purchase"
        cancelLabel="Keep it"
        busy={cancelling}
        onConfirm={confirmCancel}
        onCancel={() => setToCancel(null)}
      />
    </div>
  );
}
