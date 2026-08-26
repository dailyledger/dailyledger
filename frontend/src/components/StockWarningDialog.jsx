import { AlertTriangle } from 'lucide-react';

/**
 * Shown when the server reports that a write would take stock negative.
 *
 * Staff record entries after the goods have already changed hands, so refusing
 * the entry would only push them back to paper. Instead we show what the count
 * says, explain what it means, and let them record what actually happened.
 */
export default function StockWarningDialog({ shortfalls, busy, onConfirm, onCancel }) {
  if (!shortfalls || shortfalls.length === 0) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="stock-warn-title">
      <div className="modal-card">
        <div className="modal-head">
          <span className="modal-icon warn">
            <AlertTriangle size={20} strokeWidth={2} />
          </span>
          <h2 id="stock-warn-title" className="modal-title">
            Not enough stock recorded
          </h2>
        </div>

        <div className="modal-body">
          <ul className="shortfall-list">
            {shortfalls.map((s) => (
              <li key={s.item_name}>
                <strong>{s.item_name}</strong>
                <span className="shortfall-detail">
                  recording {s.requested}, but only {s.available} in stock
                </span>
              </li>
            ))}
          </ul>

          <p className="modal-note">
            This usually means a purchase was never entered. Saving anyway records what
            actually happened and marks the item for review, so you can find the missing
            entry later.
          </p>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Go back
          </button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Saving...' : 'Save anyway'}
          </button>
        </div>
      </div>
    </div>
  );
}
