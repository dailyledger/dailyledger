import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { getCredits, payCredit } from '../api';
import { formatCurrency, formatDate } from '../format';

export default function CreditLedger() {
  const navigate = useNavigate();
  const [credits, setCredits] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payError, setPayError] = useState('');
  const [paying, setPaying] = useState(false);

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

  const openPayModal = (credit) => {
    setSelected(credit);
    setPayAmount('');
    setPayError('');
  };

  const closePayModal = () => setSelected(null);

  const goToEdit = (e, creditId) => {
    e.stopPropagation();
    navigate(`/credits/${creditId}/edit`);
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
      await payCredit(selected._id, amount);
      setSelected(null);
      loadCredits();
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div>
      <div className="section-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          Credit Ledger
        </h1>
        <Link className="btn btn-primary btn-sm" to="/credits/add">
          + Add Credit
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
                Paid {formatCurrency(credit.amount_paid)} of {formatCurrency(credit.total_amount)}
                {credit.phone ? ` · ${credit.phone}` : ''}
              </span>
              <span className="list-item-sub">
                {credit.items?.length || 0} item{credit.items?.length === 1 ? '' : 's'} &middot;{' '}
                {formatDate(credit.date)}
              </span>
            </div>
            <div className="list-item-actions">
              <button
                type="button"
                className="icon-btn"
                onClick={(e) => goToEdit(e, credit._id)}
                aria-label="Edit credit entry"
                title="Edit"
              >
                <Pencil size={16} />
              </button>
              <span className="list-item-amount">
                {formatCurrency(credit.total_amount - credit.amount_paid)}
              </span>
            </div>
          </div>
        ))
      )}

      {selected && (
        <div className="modal-overlay" onClick={closePayModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="page-title" style={{ fontSize: '1.1rem' }}>
              Record payment &middot; {selected.customer_name}
            </h2>
            <p style={{ color: 'var(--color-muted)', marginTop: -8 }}>
              Outstanding: {formatCurrency(selected.total_amount - selected.amount_paid)}
            </p>

            {payError && <div className="error-banner">{payError}</div>}

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
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={closePayModal}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={paying}>
                  {paying ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
