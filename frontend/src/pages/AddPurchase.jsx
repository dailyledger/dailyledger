import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPurchase } from '../api';

const UNIT_TYPES = ['kg', 'litre', 'piece'];

export default function AddPurchase() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    vendor_name: '',
    item_name: '',
    quantity: '',
    unit_type: 'piece',
    amount: '',
    payment_mode: 'cash',
    notes: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await createPurchase({
        vendor_name: form.vendor_name,
        item_name: form.item_name,
        quantity: Number(form.quantity),
        unit_type: form.unit_type,
        amount: Number(form.amount),
        payment_mode: form.payment_mode,
        notes: form.notes || undefined,
      });
      navigate('/purchases');
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Add Purchase</h1>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Vendor name</label>
          <input
            className="form-input"
            value={form.vendor_name}
            onChange={(e) => update('vendor_name', e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Item name</label>
          <input
            className="form-input"
            value={form.item_name}
            onChange={(e) => update('item_name', e.target.value)}
            required
          />
        </div>

        <div className="line-item-row">
          <div className="form-group">
            <label className="form-label">Quantity</label>
            <input
              className="form-input"
              type="number"
              min="0"
              step="any"
              value={form.quantity}
              onChange={(e) => update('quantity', e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Unit type</label>
            <select
              className="form-select"
              value={form.unit_type}
              onChange={(e) => update('unit_type', e.target.value)}
            >
              {UNIT_TYPES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Amount</label>
          <input
            className="form-input"
            type="number"
            min="0"
            step="any"
            value={form.amount}
            onChange={(e) => update('amount', e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Payment mode</label>
          <div className="mode-toggle">
            <button
              type="button"
              className={form.payment_mode === 'cash' ? 'active' : ''}
              onClick={() => update('payment_mode', 'cash')}
            >
              Cash
            </button>
            <button
              type="button"
              className={form.payment_mode === 'gpay' ? 'active' : ''}
              onClick={() => update('payment_mode', 'gpay')}
            >
              GPay
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Notes (optional)</label>
          <input
            className="form-input"
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save Purchase'}
        </button>
      </form>
    </div>
  );
}
