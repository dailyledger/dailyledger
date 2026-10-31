import { useEffect, useState, useMemo } from 'react';
import { Boxes, ArrowUp, ArrowDown } from 'lucide-react';
import { getItems, changeItemKind } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatCurrency } from '../format';

const LOW_STOCK_THRESHOLD = 5;

const COLUMNS = [
  { key: 'item_name', label: 'Item Name' },
  { key: 'unit_type', label: 'Unit' },
  { key: 'stock_quantity', label: 'Stock Qty', numeric: true },
  { key: 'last_cost_price', label: 'Cost Price', numeric: true },
  { key: 'last_selling_price', label: 'Selling Price', numeric: true },
  { key: 'stock_value', label: 'Stock Value', numeric: true },
];

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState('item_name');
  const [sortDir, setSortDir] = useState('asc');
  const [toChange, setToChange] = useState(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getItems()
      .then((data) => {
        if (!cancelled) setItems(data);
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
  }, []);

  // stock_value comes from the server: what the stock on hand is worth at its average cost.
  const rows = useMemo(() => items.map((item) => ({ ...item })), [items]);

  // The first purchase decides an item's type. If it was wrong, it can be corrected
  // until the item has been sold (to raw) or used in cooking (to resale).
  const confirmChange = async () => {
    setChanging(true);
    setError('');
    try {
      const kind = toChange.kind === 'raw' ? 'resale' : 'raw';
      await changeItemKind(toChange._id, kind);
      setItems((list) => list.map((it) => (it._id === toChange._id ? { ...it, kind } : it)));
    } catch (err) {
      setError(err.message);
    } finally {
      setChanging(false);
      setToChange(null);
    }
  };

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'string') {
        return aVal.localeCompare(bVal);
      }
      return (aVal ?? 0) - (bVal ?? 0);
    });
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [rows, sortKey, sortDir]);

  const totalValue = rows.reduce((sum, row) => sum + row.stock_value, 0);

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div>
      <div className="reports-header">
        <span className="reports-header-icon">
          <Boxes size={22} strokeWidth={2} />
        </span>
        <h1 className="page-title">Inventory</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="empty-state">Loading inventory...</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">No items in catalog yet.</div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`sortable-th${col.numeric ? ' num' : ''}`}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortKey === col.key &&
                        (sortDir === 'asc' ? (
                          <ArrowUp size={13} className="sort-icon" />
                        ) : (
                          <ArrowDown size={13} className="sort-icon" />
                        ))}
                    </th>
                  ))}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  // Negative stock means an entry is missing somewhere — usually a
                  // purchase that was never recorded. Surface it above everything
                  // else so the owner can go and find the gap.
                  const needsReview = row.stock_quantity < 0;
                  const outOfStock = row.stock_quantity === 0;
                  const lowStock =
                    !needsReview && !outOfStock && row.stock_quantity <= LOW_STOCK_THRESHOLD;
                  return (
                    <tr
                      key={row._id}
                      className={outOfStock ? 'row-out-of-stock' : lowStock ? 'row-low-stock' : ''}
                    >
                      <td>
                        {row.item_name}
                        {row.kind === 'raw' && <span className="badge badge-kind"> raw material</span>}
                        {row.kind === 'cooked' && <span className="badge badge-kind"> cooked</span>}
                      </td>
                      <td>{row.unit_type}</td>
                      <td className="num">{row.stock_quantity}</td>
                      <td className="num">{formatCurrency(row.last_cost_price)}</td>
                      <td className="num">{formatCurrency(row.last_selling_price)}</td>
                      <td className="num">{formatCurrency(row.stock_value)}</td>
                      <td>
                        {needsReview && (
                          <span className="badge-review" title="More has been sold than was ever purchased — a purchase entry is probably missing">
                            Check entries
                          </span>
                        )}
                        {outOfStock && <span className="badge badge-out-of-stock">No Stock</span>}
                        {lowStock && <span className="badge badge-unpaid">Low Stock</span>}
                        {row.kind !== 'cooked' && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ marginLeft: 6 }}
                            onClick={() => setToChange(row)}
                          >
                            {row.kind === 'raw' ? 'Make resale' : 'Make raw'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Total Inventory Value</td>
                  <td className="num">{formatCurrency(totalValue)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(toChange)}
        title={
          toChange
            ? `Change ${toChange.item_name} to ${toChange.kind === 'raw' ? 'a resale item' : 'a raw material'}?`
            : ''
        }
        message={
          toChange
            ? toChange.kind === 'raw'
              ? 'It will appear on the Sale screen. This is only allowed if it has not been used in cooking.'
              : 'It will disappear from the Sale screen and can be used in cooking. This is only allowed if it has not been sold.'
            : ''
        }
        confirmLabel="Change type"
        cancelLabel="Keep it"
        busy={changing}
        onConfirm={confirmChange}
        onCancel={() => setToChange(null)}
      />
    </div>
  );
}
