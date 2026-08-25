import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getItems, createSale, getSale, updateSale } from '../api';
import { formatCurrency } from '../format';

const UNIT_TYPES = ['kg', 'litre', 'piece'];

function emptyLine() {
  return {
    item_name: '',
    unit_type: 'piece',
    quantity: '',
    price_per_unit: '',
    bargained: false,
    _prefilledPrice: null,
  };
}

export default function AddSale() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [items, setItems] = useState([]);
  const [lines, setLines] = useState([emptyLine()]);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [notes, setNotes] = useState('');
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
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isEditMode) return;

    let cancelled = false;
    getSale(id)
      .then((sale) => {
        if (cancelled) return;
        setLines(
          (sale.items || []).map((item) => ({
            item_name: item.item_name,
            unit_type: item.unit_type,
            quantity: item.quantity,
            price_per_unit: item.price_per_unit,
            bargained: item.bargained,
            _prefilledPrice: null,
          }))
        );
        setPaymentMode(sale.payment_mode);
        setNotes(sale.notes || '');
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

  const updateLine = (index, changes) => {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...changes } : line))
    );
  };

  const handleItemNameChange = (index, name) => {
    const match = items.find(
      (it) => it.item_name.toLowerCase() === name.toLowerCase()
    );

    if (match) {
      updateLine(index, {
        item_name: name,
        unit_type: match.unit_type,
        price_per_unit: match.last_selling_price ?? '',
        _prefilledPrice: match.last_selling_price ?? null,
        bargained: false,
      });
    } else {
      updateLine(index, { item_name: name, _prefilledPrice: null });
    }
  };

  const getStockFor = (itemName) => {
    const match = items.find(
      (it) => it.item_name.toLowerCase() === itemName.toLowerCase()
    );
    return match ? match.stock_quantity : null;
  };

  const handlePriceChange = (index, value) => {
    const line = lines[index];
    const bargained =
      line._prefilledPrice !== null &&
      line._prefilledPrice > 0 &&
      Number(value) !== Number(line._prefilledPrice);
    updateLine(index, { price_per_unit: value, bargained });
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (index) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const lineTotal = (line) => {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.price_per_unit) || 0;
    return qty * price;
  };

  const grandTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    for (const line of lines) {
      if (!line.item_name || !line.quantity || line.price_per_unit === '') {
        setError('Please fill in all fields for each line item.');
        return;
      }
    }

    const payload = {
      items: lines.map((line) => ({
        item_name: line.item_name,
        unit_type: line.unit_type,
        quantity: Number(line.quantity),
        price_per_unit: Number(line.price_per_unit),
        line_total: lineTotal(line),
        bargained: line.bargained,
      })),
      total_amount: grandTotal,
      payment_mode: paymentMode,
      notes: notes || undefined,
    };

    setSubmitting(true);
    try {
      if (isEditMode) {
        await updateSale(id, payload);
        setSuccess('Sale updated successfully.');
        setSubmitting(false);
        setTimeout(() => navigate('/sales'), 900);
      } else {
        await createSale(payload);
        navigate('/sales');
      }
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="empty-state">Loading sale...</div>;
  }

  return (
    <div>
      <h1 className="page-title">{isEditMode ? 'Edit Sale' : 'Add Sale'}</h1>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <form onSubmit={handleSubmit}>
        {lines.map((line, index) => (
          <div className="line-item" key={index}>
            {lines.length > 1 && (
              <button
                type="button"
                className="remove-line-btn"
                onClick={() => removeLine(index)}
                aria-label="Remove line"
              >
                &times;
              </button>
            )}

            <div className="form-group">
              <label className="form-label">Item name</label>
              <input
                className="form-input"
                list="item-options"
                value={line.item_name}
                onChange={(e) => handleItemNameChange(index, e.target.value)}
                placeholder="Search or type item name"
                required
              />
              <datalist id="item-options">
                {items.map((it) => (
                  <option key={it._id} value={it.item_name} />
                ))}
              </datalist>
            </div>

            <div className="line-item-row">
              <div className="form-group">
                <label className="form-label">Unit type</label>
                <select
                  className="form-select"
                  value={line.unit_type}
                  onChange={(e) => updateLine(index, { unit_type: e.target.value })}
                >
                  {UNIT_TYPES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">
                  Quantity
                  {line.item_name && getStockFor(line.item_name) !== null && (
                    <span className="stock-hint">
                      {getStockFor(line.item_name)} {line.unit_type} in stock
                    </span>
                  )}
                </label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="any"
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Price per unit
                {line.bargained && <span className="bargained-tag">Bargained</span>}
              </label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="any"
                value={line.price_per_unit}
                onChange={(e) => handlePriceChange(index, e.target.value)}
                required
              />
            </div>

            <div className="line-total">
              <span>Line total</span>
              <span>{formatCurrency(lineTotal(line))}</span>
            </div>
          </div>
        ))}

        <button type="button" className="btn btn-secondary btn-full" onClick={addLine}>
          + Add another item
        </button>

        <div className="running-total">
          <span>Total</span>
          <span>{formatCurrency(grandTotal)}</span>
        </div>

        <div className="form-group">
          <label className="form-label">Payment mode</label>
          <div className="mode-toggle">
            <button
              type="button"
              className={paymentMode === 'cash' ? 'active' : ''}
              onClick={() => setPaymentMode('cash')}
            >
              Cash
            </button>
            <button
              type="button"
              className={paymentMode === 'gpay' ? 'active' : ''}
              onClick={() => setPaymentMode('gpay')}
            >
              GPay
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Notes (optional)</label>
          <input
            className="form-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save Sale'}
        </button>
      </form>
    </div>
  );
}
