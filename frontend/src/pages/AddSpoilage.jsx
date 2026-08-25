import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getItems, createSpoilage } from '../api';

const UNIT_TYPES = ['kg', 'litre', 'piece'];
const REASONS = ['spoiled', 'expired', 'damaged'];

export default function AddSpoilage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    item_name: '',
    quantity: '',
    unit_type: 'piece',
    estimated_value: '',
    reason: 'spoiled',
    notes: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getItems().then(setItems).catch(() => setItems([]));
  }, []);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleItemNameChange = (name) => {
    const match = items.find((it) => it.item_name === name);
    setForm((prev) => ({
      ...prev,
      item_name: name,
      unit_type: match ? match.unit_type : prev.unit_type,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await createSpoilage({
        item_name: form.item_name,
        quantity: Number(form.quantity),
        unit_type: form.unit_type,
        estimated_value: Number(form.estimated_value),
        reason: form.reason,
        notes: form.notes || undefined,
      });
      navigate('/spoilage');
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Add Spoilage</h1>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Item name</label>
          <select
            className="form-select"
            value={form.item_name}
            onChange={(e) => handleItemNameChange(e.target.value)}
            required
          >
            <option value="" disabled>
              {items.length ? 'Select an item' : 'No items in catalog yet'}
            </option>
            {items.map((it) => (
              <option key={it._id} value={it.item_name}>
                {it.item_name}
              </option>
            ))}
          </select>
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
          <label className="form-label">Estimated value</label>
          <input
            className="form-input"
            type="number"
            min="0"
            step="any"
            value={form.estimated_value}
            onChange={(e) => update('estimated_value', e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Reason</label>
          <select
            className="form-select"
            value={form.reason}
            onChange={(e) => update('reason', e.target.value)}
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
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
          {submitting ? 'Saving...' : 'Save Spoilage'}
        </button>
      </form>
    </div>
  );
}
