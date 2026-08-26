import { AlertTriangle } from 'lucide-react';

/** Generic confirm, used for cancelling an entry. */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Go back',
  busy,
  danger,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="modal-card">
        <div className="modal-head">
          <span className={`modal-icon${danger ? ' danger' : ''}`}>
            <AlertTriangle size={20} strokeWidth={2} />
          </span>
          <h2 id="confirm-title" className="modal-title">
            {title}
          </h2>
        </div>

        <div className="modal-body">
          <p className="modal-note">{message}</p>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
