import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPurchase, getPurchase, updatePurchase } from '../api';

const UNIT_TYPES = ['kg', 'litre', 'piece'];

export default function AddPurchase() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [form, setForm] = useState({
    vendor_name: '',
    item_name: '',
    quantity: '',
    unit_type: 'piece',
    rate: '',
    units_per_pack: '',
    selling_price: '',
    payment_mode: 'cash',
    notes: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEditMode);

  useEffect(() => {
    if (!isEditMode) return;

    let cancelled = false;
    getPurchase(id)
      .then((purchase) => {
        if (cancelled) return;
        setForm({
          vendor_name: purchase.vendor_name,
          item_name: purchase.item_name,
          quantity: purchase.quantity,
          unit_type: purchase.unit_type,
          // Older records predate the rate field, so derive it from the total.
          rate: purchase.rate || (purchase.quantity ? purchase.amount / purchase.quantity : ''),
          units_per_pack: purchase.units_per_pack > 1 ? purchase.units_per_pack : '',
          payment_mode: purchase.payment_mode,
          notes: purchase.notes || '',
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

  const packUnits = Number(form.units_per_pack) > 1 ? Number(form.units_per_pack) : 1;

  // Quantity counts packs when a pack size is set, so the rate is per pack and
  // the label has to say so.
  const rateUnitLabel = packUnits > 1 ? `per pack of ${packUnits} ${form.unit_type}` : `per ${form.unit_type}`;

  // Preview only. The server multiplies quantity x rate itself and ignores any
  // total we might send, so this can never disagree with what gets stored.
  const totalAmount =
    form.quantity && form.rate ? Number((Number(form.quantity) * Number(form.rate)).toFixed(2)) : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    if (!isEditMode && (!form.selling_price || Number(form.selling_price) <= 0)) {
      setError('Selling price is required and must be greater than 0.');
      setSubmitting(false);
      return;
    }

    if (!form.rate || Number(form.rate) <= 0) {
      setError('Rate is required and must be greater than 0.');
      setSubmitting(false);
      return;
    }

    // No total is sent — the server computes quantity x rate.
    const payload = {
      vendor_name: form.vendor_name,
      item_name: form.item_name,
      quantity: Number(form.quantity),
      unit_type: form.unit_type,
      rate: Number(form.rate),
      units_per_pack: form.units_per_pack ? Number(form.units_per_pack) : 1,
      selling_price: form.selling_price ? Number(form.selling_price) : undefined,
      payment_mode: form.payment_mode,
      notes: form.notes || undefined,
    };

    try {
      if (isEditMode) {
        await updatePurchase(id, payload);
        setSuccess('Purchase updated successfully.');
        setSubmitting(false);
        setTimeout(() => navigate('/purchases'), 900);
      } else {
        await createPurchase(payload);
        navigate('/purchases');
      }
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="empty-state">Loading purchase...</div>;
  }

  return (
    <div>
      <h1 className="page-title">{isEditMode ? 'Edit Purchase' : 'Add Purchase'}</h1>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

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
          <label className="form-label">
            Units per pack (optional)
            {form.units_per_pack > 1 && form.quantity && (
              <span className="stock-hint">
                = {Number(form.quantity) * Number(form.units_per_pack)} {form.unit_type} total
              </span>
            )}
          </label>
          <input
            className="form-input"
            type="number"
            min="1"
            step="1"
            value={form.units_per_pack}
            onChange={(e) => update('units_per_pack', e.target.value)}
            placeholder="e.g. 50 — for bulk packs sold individually (leave blank if not applicable)"
          />
        </div>

        <div className="line-item-row">
          <div className="form-group">
            <label className="form-label">
              Rate
              <span className="stock-hint">{rateUnitLabel}</span>
            </label>
            <input
              className="form-input"
              type="number"
              min="0.01"
              step="any"
              value={form.rate}
              onChange={(e) => update('rate', e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Total Amount</label>
            <input
              className="form-input"
              type="text"
              value={totalAmount === '' ? '—' : `₹${totalAmount}`}
              readOnly
              disabled
            />
          </div>
        </div>

        {!isEditMode && (
          <div className="form-group">
            <label className="form-label">Selling price</label>
            <input
              className="form-input"
              type="number"
              min="0.01"
              step="any"
              value={form.selling_price}
              onChange={(e) => update('selling_price', e.target.value)}
              placeholder="Sets the initial price to suggest at next sale"
              required
            />
          </div>
        )}

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
          {submitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save Purchase'}
        </button>
      </form>
    </div>
  );
}
