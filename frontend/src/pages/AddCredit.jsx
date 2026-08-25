import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getItems, createCredit } from '../api';
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

export default function AddCredit() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getItems().then(setItems).catch(() => setItems([]));
  }, []);

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
        price_per_unit: match.last_price ?? '',
        _prefilledPrice: match.last_price ?? null,
        bargained: false,
      });
    } else {
      updateLine(index, { item_name: name, _prefilledPrice: null });
    }
  };

  const handlePriceChange = (index, value) => {
    const line = lines[index];
    const bargained =
      line._prefilledPrice !== null && Number(value) !== Number(line._prefilledPrice);
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

    for (const line of lines) {
      if (!line.item_name || !line.quantity || line.price_per_unit === '') {
        setError('Please fill in all fields for each line item.');
        return;
      }
    }

    const payload = {
      customer_name: customerName,
      phone: phone || undefined,
      items: lines.map((line) => ({
        item_name: line.item_name,
        unit_type: line.unit_type,
        quantity: Number(line.quantity),
        price_per_unit: Number(line.price_per_unit),
        line_total: lineTotal(line),
        bargained: line.bargained,
      })),
      total_amount: grandTotal,
      notes: notes || undefined,
    };

    setSubmitting(true);
    try {
      await createCredit(payload);
      navigate('/credits');
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Add Credit</h1>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Customer name</label>
          <input
            className="form-input"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Phone (optional)</label>
          <input
            className="form-input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

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
                list="credit-item-options"
                value={line.item_name}
                onChange={(e) => handleItemNameChange(index, e.target.value)}
                placeholder="Search or type item name"
                required
              />
              <datalist id="credit-item-options">
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
                <label className="form-label">Quantity</label>
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
          <label className="form-label">Notes (optional)</label>
          <input
            className="form-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save Credit'}
        </button>
      </form>
    </div>
  );
}
