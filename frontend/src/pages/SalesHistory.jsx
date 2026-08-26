import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Undo2, Ban } from 'lucide-react';
import {
  getSales,
  getSaleReturns,
  createSaleReturn,
  cancelSale as cancelSaleRequest,
} from '../api';
import { formatCurrency, formatDate } from '../format';
import ConfirmDialog from '../components/ConfirmDialog';

function saleItemsLabel(sale) {
  const items = sale.items || [];
  if (items.length === 0) return 'No items';
  if (items.length === 1) return items[0].item_name;
  return `${items[0].item_name} +${items.length - 1} more`;
}

function returnedSummary(sale) {
  const byItem = sale.returned_by_item || {};
  const entries = Object.entries(byItem).filter(([, qty]) => qty > 0);
  if (entries.length === 0) return null;

  return entries
    .map(([itemName, qty]) => {
      const line = (sale.items || []).find((i) => i.item_name === itemName);
      return `${qty}${line ? line.unit_type : ''}`;
    })
    .join(', ');
}

function ReturnModal({ sale, onClose, onReturned }) {
  const [returns, setReturns] = useState([]);
  const [loadingReturns, setLoadingReturns] = useState(true);
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadReturns = () => {
    setLoadingReturns(true);
    getSaleReturns(sale._id)
      .then(setReturns)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingReturns(false));
  };

  useEffect(() => {
    loadReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale._id]);

  const alreadyReturnedFor = (itemName) =>
    returns.filter((r) => r.item_name === itemName).reduce((sum, r) => sum + r.quantity, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const toReturn = (sale.items || [])
      .map((item) => ({ item_name: item.item_name, quantity: Number(quantities[item.item_name]) || 0 }))
      .filter((line) => line.quantity > 0);

    if (toReturn.length === 0) {
      setError('Enter a return quantity for at least one item.');
      return;
    }

    setSubmitting(true);
    try {
      for (const line of toReturn) {
        await createSaleReturn(sale._id, { ...line, reason: reason || undefined });
      }
      setQuantities({});
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
          Return items &middot; Sale {formatDate(sale.date)}
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
          {(sale.items || []).map((item) => {
            const returnable = item.quantity - alreadyReturnedFor(item.item_name);
            return (
              <div className="form-group" key={item.item_name}>
                <label className="form-label">
                  {item.item_name}
                  <span className="stock-hint">{returnable} of {item.quantity} returnable</span>
                </label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max={returnable}
                  step="any"
                  value={quantities[item.item_name] || ''}
                  onChange={(e) =>
                    setQuantities((prev) => ({ ...prev, [item.item_name]: e.target.value }))
                  }
                  placeholder="0"
                  disabled={returnable <= 0}
                />
              </div>
            );
          })}

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

export default function SalesHistory() {
  const [sales, setSales] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [returnSale, setReturnSale] = useState(null);
  const [cancelSale, setCancelSale] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const loadSales = () => {
    setLoading(true);
    getSales()
      .then(setSales)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSales();
  }, []);

  const openReturnModal = (e, sale) => {
    e.preventDefault();
    e.stopPropagation();
    setReturnSale(sale);
  };

  const openCancelModal = (e, sale) => {
    e.preventDefault();
    e.stopPropagation();
    setCancelSale(sale);
  };

  // Cancelling marks the sale voided and puts the goods back on the shelf. The
  // record stays in the database so there is still a trail of what happened.
  const confirmCancel = async () => {
    setCancelling(true);
    setError('');
    try {
      await cancelSaleRequest(cancelSale._id, 'cancelled from sales list');
      setCancelSale(null);
      loadSales();
    } catch (err) {
      setError(err.message);
      setCancelSale(null);
    } finally {
      setCancelling(false);
    }
  };

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
        sales.map((sale) => {
          const returned = returnedSummary(sale);
          return (
            <Link className="list-item" to={`/sales/${sale._id}/edit`} key={sale._id}>
              <div className="list-item-main">
                <span className="list-item-title">
                  {saleItemsLabel(sale)} &middot; {sale.payment_mode}
                </span>
                <span className="list-item-sub">{formatDate(sale.date)}</span>
                {returned && (
                  <span className="badge badge-unpaid" style={{ marginTop: 4, width: 'fit-content' }}>
                    Returned: {returned}
                  </span>
                )}
                {sale.stock_warning && (
                  <span className="row-warning">Recorded with stock going negative</span>
                )}
              </div>
              <div className="list-item-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => openReturnModal(e, sale)}
                  aria-label="Return items from this sale"
                >
                  <Undo2 size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                  Return
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => openCancelModal(e, sale)}
                  aria-label="Cancel this sale"
                >
                  <Ban size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                  Cancel
                </button>
                <span className="list-item-amount">
                  {formatCurrency(sale.net_amount ?? sale.total_amount)}
                </span>
              </div>
            </Link>
          );
        })
      )}

      {returnSale && (
        <ReturnModal
          sale={returnSale}
          onClose={() => setReturnSale(null)}
          onReturned={loadSales}
        />
      )}

      <ConfirmDialog
        open={Boolean(cancelSale)}
        danger
        title="Cancel this sale?"
        message={
          cancelSale
            ? `${formatCurrency(cancelSale.total_amount)} will be removed from your reports and ` +
              `the items go back into stock. The record is kept so you can still see what happened.`
            : ''
        }
        confirmLabel="Cancel sale"
        cancelLabel="Keep it"
        busy={cancelling}
        onConfirm={confirmCancel}
        onCancel={() => setCancelSale(null)}
      />
    </div>
  );
}
