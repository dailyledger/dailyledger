import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getItems, createProduction, newIdempotencyKey } from '../api';
import { formatCurrency } from '../format';
import EntryDateField, { entryDatePayload } from '../components/EntryDateField';
import StockWarningDialog from '../components/StockWarningDialog';

const UNIT_TYPES = ['piece', 'kg', 'litre'];
const EMPTY_INGREDIENT = { item_name: '', quantity: '' };

/**
 * Cooking batch: pick the ingredients and how much of each was used, say how many
 * plates came out, and the dish appears in stock ready to sell. Only the quantity
 * used is costed, so 4 of 5 lemons costs 4 lemons and the fifth stays in stock.
 */
export default function AddCooking() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [dish, setDish] = useState({ dish_name: '', unit_type: 'piece', quantity: '', selling_price: '', notes: '' });
  const [ingredients, setIngredients] = useState([{ ...EMPTY_INGREDIENT }]);
  const [entryDate, setEntryDate] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [shortfalls, setShortfalls] = useState(null);
  const idempotencyKey = useRef(newIdempotencyKey());

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

  const byName = (name) => items.find((it) => it.item_name.toLowerCase() === name.trim().toLowerCase());

  // A dish that already exists keeps its unit and last selling price.
  const existingDish = byName(dish.dish_name);
  const dishIsCooked = existingDish ? existingDish.kind === 'cooked' : true;
  const cookedDishes = items.filter((it) => it.kind === 'cooked');
  // Anything in stock can go into a dish except the dish itself.
  const pickable = items.filter((it) => it.kind !== 'cooked' && it.stock_quantity !== undefined);

  const setDishField = (patch) => setDish((d) => ({ ...d, ...patch }));

  const onDishName = (value) => {
    const match = byName(value);
    if (match && match.kind === 'cooked') {
      setDishField({
        dish_name: value,
        unit_type: match.unit_type,
        selling_price: dish.selling_price || match.last_selling_price || '',
      });
    } else {
      setDishField({ dish_name: value });
    }
  };

  const updateIngredient = (index, patch) =>
    setIngredients((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const lineCost = (row) => {
    const item = byName(row.item_name);
    return item && row.quantity ? Number(row.quantity) * item.last_cost_price : 0;
  };

  const totalCost = ingredients.reduce((sum, row) => sum + lineCost(row), 0);
  const made = Number(dish.quantity) || 0;
  const costPerUnit = made > 0 ? totalCost / made : 0;
  const profitPerUnit = Number(dish.selling_price) - costPerUnit;

  const save = async (allowNegative) => {
    setSubmitting(true);
    try {
      await createProduction(
        {
          dish_name: dish.dish_name,
          unit_type: dish.unit_type,
          quantity: Number(dish.quantity),
          selling_price: Number(dish.selling_price),
          ingredients: ingredients.map((row) => ({
            item_name: row.item_name,
            quantity: Number(row.quantity),
          })),
          notes: dish.notes || undefined,
          ...entryDatePayload(entryDate),
          ...(allowNegative ? { allow_negative: true } : {}),
        },
        idempotencyKey.current
      );
      navigate('/cooking');
    } catch (err) {
      setSubmitting(false);
      if (err.needsStockConfirmation) {
        setShortfalls(err.shortfalls);
        return;
      }
      setShortfalls(null);
      setError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (ingredients.some((row) => !byName(row.item_name))) {
      setError('Pick every ingredient from your stock. Buy it on the Purchase screen first.');
      return;
    }
    await save(false);
  };

  return (
    <div>
      <h1 className="page-title">Add Cooking</h1>

      {error && <div className="error-banner">{error}</div>}

      <StockWarningDialog
        shortfalls={shortfalls}
        busy={submitting}
        onConfirm={() => save(true)}
        onCancel={() => setShortfalls(null)}
      />

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Dish name</label>
          <input
            className="form-input"
            list="cooked-dishes"
            value={dish.dish_name}
            onChange={(e) => onDishName(e.target.value)}
            placeholder="e.g. Chicken Biriyani"
            maxLength={60}
            required
          />
          <datalist id="cooked-dishes">
            {cookedDishes.map((it) => (
              <option key={it._id} value={it.item_name} />
            ))}
          </datalist>
          {existingDish && !dishIsCooked && (
            <p className="error-banner" style={{ marginTop: 8 }}>
              "{existingDish.item_name}" is already a purchased item. Choose a different dish name.
            </p>
          )}
        </div>

        <div className="line-item-row">
          <div className="form-group">
            <label className="form-label">How many made</label>
            <input
              className="form-input"
              type="number"
              min="0"
              step="any"
              value={dish.quantity}
              onChange={(e) => setDishField({ quantity: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Counted in</label>
            <select
              className="form-select"
              value={dish.unit_type}
              disabled={Boolean(existingDish && dishIsCooked)}
              onChange={(e) => setDishField({ unit_type: e.target.value })}
            >
              {UNIT_TYPES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <h2 className="admin-heading-lite">Ingredients used</h2>
        {ingredients.map((row, index) => {
          const item = byName(row.item_name);
          return (
            <div className="line-item" key={index}>
              {ingredients.length > 1 && (
                <button
                  type="button"
                  className="remove-line-btn"
                  aria-label="Remove ingredient"
                  onClick={() => setIngredients((rows) => rows.filter((_, i) => i !== index))}
                >
                  &times;
                </button>
              )}
              <div className="form-group">
                <label className="form-label">Ingredient</label>
                <input
                  className="form-input"
                  list="ingredient-options"
                  value={row.item_name}
                  onChange={(e) => updateIngredient(index, { item_name: e.target.value })}
                  placeholder="Search your stock"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Quantity used
                  {item && (
                    <span className="stock-hint">
                      {item.stock_quantity} {item.unit_type} in stock
                    </span>
                  )}
                </label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="any"
                  value={row.quantity}
                  onChange={(e) => updateIngredient(index, { quantity: e.target.value })}
                  required
                />
              </div>
              <div className="line-total">
                <span>{item ? `@ ${formatCurrency(item.last_cost_price)} per ${item.unit_type}` : 'Cost'}</span>
                <span>{formatCurrency(lineCost(row))}</span>
              </div>
            </div>
          );
        })}
        <datalist id="ingredient-options">
          {pickable.map((it) => (
            <option key={it._id} value={it.item_name} />
          ))}
        </datalist>

        <button
          type="button"
          className="btn btn-secondary btn-full"
          onClick={() => setIngredients((rows) => [...rows, { ...EMPTY_INGREDIENT }])}
        >
          + Add another ingredient
        </button>

        <div className="form-group" style={{ marginTop: 16 }}>
          <label className="form-label">Selling price per {dish.unit_type}</label>
          <input
            className="form-input"
            type="number"
            min="0.01"
            step="any"
            value={dish.selling_price}
            onChange={(e) => setDishField({ selling_price: e.target.value })}
            required
          />
        </div>

        <div className="running-total" style={{ display: 'block' }}>
          <div className="cook-sum">
            <span>Cost of ingredients used</span>
            <span>{formatCurrency(totalCost)}</span>
          </div>
          <div className="cook-sum">
            <span>Cost per {dish.unit_type}</span>
            <span>{made > 0 ? formatCurrency(costPerUnit) : '-'}</span>
          </div>
          <div className="cook-sum">
            <span>Profit per {dish.unit_type}</span>
            <span className={made > 0 && dish.selling_price && profitPerUnit < 0 ? 'negative' : ''}>
              {made > 0 && dish.selling_price ? formatCurrency(profitPerUnit) : '-'}
            </span>
          </div>
        </div>

        <EntryDateField value={entryDate} onChange={setEntryDate} />

        <div className="form-group">
          <label className="form-label">Notes (optional)</label>
          <input className="form-input" value={dish.notes} onChange={(e) => setDishField({ notes: e.target.value })} />
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting || (existingDish && !dishIsCooked)}>
          {submitting ? 'Saving...' : 'Save Cooking'}
        </button>
      </form>
    </div>
  );
}
