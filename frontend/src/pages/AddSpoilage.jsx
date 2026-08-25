import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getItems, createSpoilage, getSpoilageEntry, updateSpoilage } from '../api';

const UNIT_TYPES = ['kg', 'litre', 'piece'];
const REASONS = ['spoiled', 'expired', 'damaged'];

export default function AddSpoilage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [form, setForm] = useState({
    item_name: '',
    quantity: '',
    unit_type: 'piece',
    estimated_value: '',
    reason: 'spoiled',
    notes: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEditMode);

  useEffect(() => {
    let cancelled = false;

    getItems()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setItemsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isEditMode) return;

    let cancelled = false;
    getSpoilageEntry(id)
      .then((entry) => {
        if (cancelled) return;
        setForm({
          item_name: entry.item_name,
          quantity: entry.quantity,
          unit_type: entry.unit_type,
          estimated_value: entry.estimated_value,
          reason: entry.reason,
          notes: entry.notes || '',
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, isEditMode]);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleItemNameChange = (name) => {
    const match = items.find((it) => it.item_name === name);
    setForm((prev) => ({
      ...prev,
      item_name: name,
      unit_type: match ? match.unit_type : prev.unit_type,
    }));
  };

  const getStockFor = (itemName) => {
    const match = items.find((it) => it.item_name === itemName);
    return match ? match.stock_quantity : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    const payload = {
      item_name: form.item_name,
      quantity: Number(form.quantity),
      unit_type: form.unit_type,
      estimated_value: Number(form.estimated_value),
      reason: form.reason,
      notes: form.notes || undefined,
    };

    try {
      if (isEditMode) {
        await updateSpoilage(id, payload);
        setSuccess('Spoilage entry updated successfully.');
        setSubmitting(false);
        setTimeout(() => navigate('/spoilage'), 900);
      } else {
        await createSpoilage(payload);
        navigate('/spoilage');
      }
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="empty-state">Loading spoilage entry...</div>;
  }

  return (
    <div>
      <h1 className="page-title">{isEditMode ? 'Edit Spoilage' : 'Add Spoilage'}</h1>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

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
              {itemsLoading
                ? 'Loading items...'
                : items.length
                ? 'Select an item'
                : 'No items in catalog yet'}
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
            <label className="form-label">
              Quantity
              {form.item_name && getStockFor(form.item_name) !== null && (
                <span className="stock-hint">
                  {getStockFor(form.item_name)} {form.unit_type} in stock
                </span>
              )}
            </label>
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
          {submitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save Spoilage'}
        </button>
      </form>
    </div>
  );
}
