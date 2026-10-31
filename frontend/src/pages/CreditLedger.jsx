import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil, Ban, Plus, Undo2 } from 'lucide-react';
import {
  getCredits,
  getCredit,
  payCredit,
  cancelCredit,
  cancelCreditPayment,
  createCreditReturn,
  cancelCreditReturn,
  newIdempotencyKey,
} from '../api';
import { formatCurrency, formatDate } from '../format';
import ConfirmDialog from '../components/ConfirmDialog';
import StockWarningDialog from '../components/StockWarningDialog';

function creditItemsLabel(credit) {
  const items = credit.items || [];
  if (items.length === 0) return 'No items';
  if (items.length === 1) return items[0].item_name;
  return `${items[0].item_name} +${items.length - 1} more`;
}

const ModeToggle = ({ value, onChange }) => (
  <div className="mode-toggle">
    {[
      ['cash', 'Cash'],
      ['gpay', 'GPay'],
    ].map(([key, label]) => (
      <button key={key} type="button" className={value === key ? 'active' : ''} onClick={() => onChange(key)}>
        {label}
      </button>
    ))}
  </div>
);

export default function CreditLedger() {
  const navigate = useNavigate();
  const [credits, setCredits] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // The credit open in the payment dialog, with its payments and returns.
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('cash');
  const [payError, setPayError] = useState('');
  const [paying, setPaying] = useState(false);

  const [returning, setReturning] = useState(null); // { item_name, max }
  const [returnQty, setReturnQty] = useState('');
  const [returnMode, setReturnMode] = useState('cash');
  const [returnError, setReturnError] = useState('');
  const [returnBusy, setReturnBusy] = useState(false);
  const returnKey = useRef(newIdempotencyKey());

  const [toCancel, setToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [undoReturn, setUndoReturn] = useState(null);
  const [undoShortfalls, setUndoShortfalls] = useState(null);

  const loadCredits = () => {
    setLoading(true);
    getCredits()
      .then(setCredits)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCredits();
  }, []);

  const refreshDetail = (id) => getCredit(id).then(setDetail).catch((err) => setPayError(err.message));

  const openPayModal = (credit) => {
    setSelected(credit);
    setDetail(null);
    setPayAmount('');
    setPayMode('cash');
    setPayError('');
    refreshDetail(credit._id);
  };

  const closePayModal = () => {
    setSelected(null);
    setDetail(null);
    setReturning(null);
  };

  const goToEdit = (e, creditId) => {
    e.stopPropagation();
    navigate(`/credits/${creditId}/edit`);
  };

  const openCancel = (e, credit) => {
    e.stopPropagation();
    setToCancel(credit);
  };

  // Cancelling returns the goods to stock and clears the debt from reports.
  const confirmCancel = async () => {
    setCancelling(true);
    setError('');
    try {
      await cancelCredit(toCancel._id, 'cancelled from credit ledger');
      setToCancel(null);
      loadCredits();
    } catch (err) {
      setError(err.message);
      setToCancel(null);
    } finally {
      setCancelling(false);
    }
  };

  const handlePay = async (e) => {
    e.preventDefault();
    setPayError('');

    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      setPayError('Enter a valid payment amount.');
      return;
    }

    setPaying(true);
    try {
      await payCredit(selected._id, amount, payMode);
      setPayAmount('');
      loadCredits();
      await refreshDetail(selected._id);
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPaying(false);
    }
  };

  const removePayment = async (payment) => {
    setPayError('');
    try {
      await cancelCreditPayment(selected._id, payment._id);
      loadCredits();
      await refreshDetail(selected._id);
    } catch (err) {
      setPayError(err.message);
    }
  };

  // How much of an item is still returnable on this credit.
  const returnableOf = (line) => {
    const done = (detail?.returns || [])
      .filter((r) => r.item_name === line.item_name)
      .reduce((sum, r) => sum + r.quantity, 0);
    return Math.round((line.quantity - done) * 1000) / 1000;
  };

  const startReturn = (line) => {
    setReturning({ item_name: line.item_name, max: returnableOf(line), price: line.price_per_unit });
    setReturnQty('');
    setReturnMode('cash');
    setReturnError('');
    returnKey.current = newIdempotencyKey();
  };

  const submitReturn = async (e) => {
    e.preventDefault();
    setReturnError('');
    const quantity = Number(returnQty);
    if (!quantity || quantity <= 0 || quantity > returning.max) {
      setReturnError(`Enter a quantity between 0 and ${returning.max}.`);
      return;
    }

    setReturnBusy(true);
    try {
      await createCreditReturn(
        selected._id,
        { item_name: returning.item_name, quantity, refund_mode: returnMode },
        returnKey.current
      );
      setReturning(null);
      loadCredits();
      await refreshDetail(selected._id);
    } catch (err) {
      setReturnError(err.message);
    } finally {
      setReturnBusy(false);
    }
  };

  const confirmUndoReturn = async (allowNegative) => {
    setReturnBusy(true);
    setPayError('');
    try {
      await cancelCreditReturn(selected._id, undoReturn._id, allowNegative);
      setUndoReturn(null);
      setUndoShortfalls(null);
      loadCredits();
      await refreshDetail(selected._id);
    } catch (err) {
      if (err.needsStockConfirmation) {
        setUndoShortfalls(err.shortfalls);
      } else {
        setPayError(err.message);
        setUndoReturn(null);
      }
    } finally {
      setReturnBusy(false);
    }
  };

  const netTotal = (credit) => credit.total_amount - (credit.returned_amount || 0);
  const balanceOf = (credit) => credit.balance ?? netTotal(credit) - credit.amount_paid;

  const live = detail || selected;

  return (
    <div>
      <div className="section-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          Credit Ledger
        </h1>
        <Link className="btn-add" to="/credits/add">
          <Plus size={18} strokeWidth={2.5} />
          Add Credit
        </Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : credits.length === 0 ? (
        <div className="empty-state">No credit entries yet.</div>
      ) : (
        credits.map((credit) => (
          <div
            className="list-item"
            key={credit._id}
            role="button"
            tabIndex={0}
            onClick={() => openPayModal(credit)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') openPayModal(credit);
            }}
          >
            <div className="list-item-main">
              <span className="list-item-title">
                {credit.customer_name}
                <span className={`badge badge-${credit.status}`} style={{ marginLeft: 8 }}>
                  {credit.status.replace('_', ' ')}
                </span>
              </span>
              <span className="list-item-sub">
                Paid {formatCurrency(credit.amount_paid)} of {formatCurrency(netTotal(credit))}
                {credit.returned_amount > 0 ? ` · returned ${formatCurrency(credit.returned_amount)}` : ''}
                {credit.phone ? ` · ${credit.phone}` : ''}
              </span>
              <span className="list-item-sub">
                {creditItemsLabel(credit)} &middot; {formatDate(credit.date)}
              </span>
            </div>
            <div className="list-item-actions">
              {!(credit.returned_amount > 0) && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={(e) => goToEdit(e, credit._id)}
                  aria-label="Edit credit entry"
                  title="Edit"
                >
                  <Pencil size={16} />
                </button>
              )}
              {/* Only an untouched credit can be cancelled. Once money has been collected
                  or goods returned, use Return inside the credit instead. */}
              {credit.amount_paid === 0 && !(credit.returned_amount > 0) && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={(e) => openCancel(e, credit)}
                  aria-label="Cancel credit entry"
                  title="Cancel"
                >
                  <Ban size={16} />
                </button>
              )}
              <span className="list-item-amount">{formatCurrency(balanceOf(credit))}</span>
            </div>
          </div>
        ))
      )}

      {selected && (
        <div className="modal-overlay" onClick={closePayModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="page-title" style={{ fontSize: '1.1rem' }}>
              {selected.customer_name}
            </h2>
            <p style={{ color: 'var(--color-muted)', marginTop: -8 }}>
              Outstanding: {formatCurrency(balanceOf(live))}
            </p>

            <div className="card" style={{ marginBottom: 12 }}>
              {(live.items || []).map((item, i) => {
                const canReturn = detail && returnableOf(item) > 0;
                return (
                  <div key={i} className="list-item-sub" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>
                      {item.quantity} × {item.item_name} @ {formatCurrency(item.price_per_unit)} ={' '}
                      {formatCurrency(item.line_total)}
                    </span>
                    {canReturn && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => startReturn(item)}>
                        <Undo2 size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                        Return
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {detail && (detail.payments.length > 0 || detail.returns.length > 0) && (
              <div className="card" style={{ marginBottom: 12 }}>
                {detail.payments.map((p) => (
                  <div key={p._id} className="list-item-sub" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>
                      {p.kind === 'refund' ? 'Refunded' : 'Paid'} {formatCurrency(Math.abs(p.amount))} by{' '}
                      {p.payment_mode === 'gpay' ? 'GPay' : 'cash'} &middot; {formatDate(p.date)}
                    </span>
                    {p.kind === 'payment' && (
                      <button type="button" className="icon-btn" title="Cancel this payment" aria-label="Cancel payment" onClick={() => removePayment(p)}>
                        <Ban size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {detail.returns.map((r) => (
                  <div key={r._id} className="list-item-sub" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>
                      Returned {r.quantity} × {r.item_name} ({formatCurrency(r.refund_amount)}) &middot; {formatDate(r.date)}
                    </span>
                    <button type="button" className="icon-btn" title="Cancel this return" aria-label="Cancel return" onClick={() => setUndoReturn(r)}>
                      <Ban size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {payError && <div className="error-banner">{payError}</div>}

            {balanceOf(live) > 0 && (
              <form onSubmit={handlePay}>
                <div className="form-group">
                  <label className="form-label">Amount paid now</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="any"
                    autoFocus
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Paid by</label>
                  <ModeToggle value={payMode} onChange={setPayMode} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={closePayModal}>
                    Close
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={paying}>
                    {paying ? 'Saving...' : 'Save Payment'}
                  </button>
                </div>
              </form>
            )}
            {balanceOf(live) <= 0 && (
              <button type="button" className="btn btn-secondary btn-full" onClick={closePayModal}>
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {returning && (
        <div className="modal-overlay" onClick={() => setReturning(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="page-title" style={{ fontSize: '1.1rem' }}>
              Return {returning.item_name}
            </h2>
            <p style={{ color: 'var(--color-muted)', marginTop: -8 }}>
              The goods go back into stock and {selected.customer_name} owes less.
              {detail && detail.amount_paid > 0
                ? ' Anything already paid beyond the new total is refunded.'
                : ''}
            </p>
            {returnError && <div className="error-banner">{returnError}</div>}
            <form onSubmit={submitReturn}>
              <div className="form-group">
                <label className="form-label">
                  Quantity returned
                  <span className="stock-hint">up to {returning.max}</span>
                </label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="any"
                  autoFocus
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                  required
                />
              </div>
              {detail && detail.amount_paid > 0 && (
                <div className="form-group">
                  <label className="form-label">Refund (if any) paid back by</label>
                  <ModeToggle value={returnMode} onChange={setReturnMode} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setReturning(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={returnBusy}>
                  {returnBusy ? 'Saving...' : 'Save Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toCancel)}
        danger
        title="Cancel this credit entry?"
        message={
          toCancel
            ? `${toCancel.customer_name}'s debt of ${formatCurrency(toCancel.total_amount)} will ` +
              `be cleared and the items go back into stock. The record is kept for your history.`
            : ''
        }
        confirmLabel="Cancel entry"
        cancelLabel="Keep it"
        busy={cancelling}
        onConfirm={confirmCancel}
        onCancel={() => setToCancel(null)}
      />

      <ConfirmDialog
        open={Boolean(undoReturn) && !undoShortfalls}
        danger
        title="Cancel this return?"
        message={
          undoReturn
            ? `${undoReturn.quantity} × ${undoReturn.item_name} comes back out of stock and ${selected?.customer_name} owes it again.`
            : ''
        }
        confirmLabel="Cancel return"
        cancelLabel="Keep it"
        busy={returnBusy}
        onConfirm={() => confirmUndoReturn(false)}
        onCancel={() => setUndoReturn(null)}
      />

      <StockWarningDialog
        shortfalls={undoShortfalls}
        busy={returnBusy}
        onConfirm={() => confirmUndoReturn(true)}
        onCancel={() => {
          setUndoShortfalls(null);
          setUndoReturn(null);
        }}
      />
    </div>
  );
}
