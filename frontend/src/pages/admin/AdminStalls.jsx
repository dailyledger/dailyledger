import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, KeyRound, Power, Trash2, FileDown } from 'lucide-react';
import {
  adminGetStalls,
  adminCreateStall,
  adminUpdateStall,
  adminResetPassword,
  adminSetStallActive,
  adminDeleteStall,
  adminGetScorecard,
} from '../../api';
import { downloadScorecard } from './scorecardPdf';

const EMPTY_FORM = { name: '', phone: '', day_start_hour: 0, username: '', password: '' };

// A stall that sells past midnight can count those sales for the evening before.
const DAY_STARTS = [
  [0, '12 am (midnight)'],
  [1, '1 am'],
  [2, '2 am'],
  [3, '3 am'],
  [4, '4 am'],
  [5, '5 am'],
  [6, '6 am'],
];

function DayStartField({ value, onChange }) {
  return (
    <div className="a-field">
      <label className="a-label">Business day starts at</label>
      <select className="a-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {DAY_STARTS.map(([hour, label]) => (
          <option key={hour} value={hour}>
            {label}
          </option>
        ))}
      </select>
      <p className="a-modal-note" style={{ margin: '6px 0 0' }}>
        Sales before this hour count for the previous day. Use 4 am for a stall open past midnight.
      </p>
    </div>
  );
}

function Modal({ title, onClose, busy, error, children, confirm }) {
  return (
    <div className="a-modal-back" role="dialog" aria-modal="true">
      <form
        className="a-modal"
        onSubmit={(e) => {
          e.preventDefault();
          confirm.onClick();
        }}
      >
        <h2>{title}</h2>
        {error && <div className="a-error">{error}</div>}
        {children}
        <div className="a-modal-actions">
          <button type="button" className="a-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className={`a-btn ${confirm.danger ? 'a-btn-danger' : 'a-btn-primary'}`}
            disabled={busy || confirm.disabled}
          >
            {busy ? 'Working...' : confirm.label}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="a-field">
      <label className="a-label">{label}</label>
      {children}
    </div>
  );
}

export default function AdminStalls() {
  const [stalls, setStalls] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null); // { kind: 'add'|'edit'|'password'|'delete', stall?, ...fields }
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = useCallback(() => {
    adminGetStalls()
      .then(setStalls)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const closeModal = () => {
    setModal(null);
    setModalError('');
  };

  /** Runs an API call from a modal; closes it and shows `done` on success. */
  const run = async (action, done) => {
    setBusy(true);
    setModalError('');
    try {
      await action();
      setNotice(done);
      closeModal();
      load();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (stall) => {
    setError('');
    try {
      await adminSetStallActive(stall.id, !stall.active);
      setNotice(`${stall.name} ${stall.active ? 'deactivated' : 'activated'}.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const set = (patch) => setModal((m) => ({ ...m, ...patch }));

  // A one-page summary for the judges, as a PDF.
  const scorecard = async (stall) => {
    setError('');
    setNotice(`Preparing ${stall.name}'s scorecard...`);
    try {
      await downloadScorecard(await adminGetScorecard(stall.id, { period: 'all' }));
      setNotice(`${stall.name}'s scorecard was downloaded.`);
    } catch (err) {
      setNotice('');
      setError(`Could not create the scorecard: ${err.message}`);
    }
  };

  return (
    <div>
      <div className="a-page-head">
        <div>
          <h1 className="a-title">Stalls Management</h1>
          <p className="a-subtitle">Create stalls, manage their logins and control access</p>
        </div>
        <button className="a-btn a-btn-primary" onClick={() => { setNotice(''); setModal({ kind: 'add', ...EMPTY_FORM }); }}>
          <Plus size={16} /> Add stall
        </button>
      </div>

      {error && <div className="a-error">{error}</div>}
      {notice && <div className="a-success">{notice}</div>}

      <div className="a-card a-table-wrap">
        {!stalls ? (
          <div className="a-empty">Loading...</div>
        ) : stalls.length === 0 ? (
          <div className="a-empty">No stalls yet. Add the first one.</div>
        ) : (
          <table className="a-table">
            <thead>
              <tr>
                <th>Customer / Stall</th>
                <th>Phone</th>
                <th>Login</th>
                <th>Status</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stalls.map((stall) => (
                <tr key={stall.id}>
                  <td>{stall.name}</td>
                  <td>{stall.phone || <span className="muted">-</span>}</td>
                  <td>{stall.users.map((u) => u.username).join(', ') || <span className="muted">none</span>}</td>
                  <td>
                    <span className={`a-pill ${stall.active ? 'on' : 'off'}`}>
                      {stall.active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td>
                    <div className="a-row-actions">
                      <button className="a-btn a-btn-sm" title="Scorecard PDF" onClick={() => scorecard(stall)}>
                        <FileDown size={14} /> Scorecard
                      </button>
                      <button className="a-btn a-btn-sm" title="Edit" onClick={() => setModal({ kind: 'edit', stall, name: stall.name, phone: stall.phone, day_start_hour: stall.day_start_hour || 0 })}>
                        <Pencil size={14} /> Edit
                      </button>
                      <button className="a-btn a-btn-sm" title="Reset password" onClick={() => setModal({ kind: 'password', stall, password: '' })}>
                        <KeyRound size={14} /> Password
                      </button>
                      <button className="a-btn a-btn-sm" onClick={() => toggleActive(stall)}>
                        <Power size={14} /> {stall.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="a-btn a-btn-sm a-btn-danger" onClick={() => setModal({ kind: 'delete', stall, confirm: '' })}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal?.kind === 'add' && (
        <Modal
          title="Add stall"
          onClose={closeModal}
          busy={busy}
          error={modalError}
          confirm={{
            label: 'Create stall',
            onClick: () =>
              run(() => adminCreateStall(modal), `Stall "${modal.name}" created. Login: ${modal.username}`),
          }}
        >
          <div className="a-modal-fields">
            <Field label="Customer / stall name">
              <input className="a-input" value={modal.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} required autoFocus />
            </Field>
            <Field label="Phone">
              <input className="a-input" value={modal.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={20} />
            </Field>
            <DayStartField value={modal.day_start_hour} onChange={(day_start_hour) => set({ day_start_hour })} />
            <Field label="Login username">
              <input className="a-input" value={modal.username} onChange={(e) => set({ username: e.target.value })} minLength={3} maxLength={40} required autoComplete="off" />
            </Field>
            <Field label="Login password (min 6)">
              <input className="a-input" value={modal.password} onChange={(e) => set({ password: e.target.value })} minLength={6} required autoComplete="off" />
            </Field>
          </div>
        </Modal>
      )}

      {modal?.kind === 'edit' && (
        <Modal
          title={`Edit ${modal.stall.name}`}
          onClose={closeModal}
          busy={busy}
          error={modalError}
          confirm={{
            label: 'Save',
            disabled: !modal.name.trim(),
            onClick: () =>
              run(
                () => adminUpdateStall(modal.stall.id, { name: modal.name, phone: modal.phone, day_start_hour: modal.day_start_hour }),
                'Stall updated.'
              ),
          }}
        >
          <div className="a-modal-fields">
            <Field label="Customer / stall name">
              <input className="a-input" value={modal.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Phone">
              <input className="a-input" value={modal.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={20} />
            </Field>
            <DayStartField value={modal.day_start_hour} onChange={(day_start_hour) => set({ day_start_hour })} />
          </div>
        </Modal>
      )}

      {modal?.kind === 'password' && (
        <Modal
          title={`Reset password: ${modal.stall.name}`}
          onClose={closeModal}
          busy={busy}
          error={modalError}
          confirm={{
            label: 'Reset password',
            disabled: modal.password.length < 6,
            onClick: () =>
              run(() => adminResetPassword(modal.stall.id, modal.password), `Password for ${modal.stall.name} was reset.`),
          }}
        >
          <Field label="New password (min 6)">
            <input className="a-input" value={modal.password} onChange={(e) => set({ password: e.target.value })} autoComplete="off" autoFocus />
          </Field>
        </Modal>
      )}

      {modal?.kind === 'delete' && (
        <Modal
          title={`Delete ${modal.stall.name}?`}
          onClose={closeModal}
          busy={busy}
          error={modalError}
          confirm={{
            label: 'Delete forever',
            danger: true,
            disabled: modal.confirm !== modal.stall.name,
            onClick: () =>
              run(() => adminDeleteStall(modal.stall.id, modal.confirm), `${modal.stall.name} and all its data were deleted.`),
          }}
        >
          <p className="a-modal-note">
            This permanently deletes the stall, its login and every sale, purchase, credit and stock
            record. It cannot be undone. To only block the login, use Deactivate instead.
          </p>
          <Field label="Type the stall name to confirm">
            <input className="a-input" value={modal.confirm} placeholder={modal.stall.name} onChange={(e) => set({ confirm: e.target.value })} autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  );
}
