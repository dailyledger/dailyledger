import { useState } from 'react';
import { getSales, getPurchases, getCredits, getSpoilageEntries } from '../api';
import { formatCurrency } from '../format';

const TABS = [
  { key: 'sales', label: 'Sales' },
  { key: 'purchases', label: 'Purchase' },
  { key: 'credits', label: 'Credit' },
  { key: 'spoilage', label: 'Spoilage' },
];

function toDateOnly(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function flattenSales(sales) {
  const rows = [];
  sales.forEach((sale) => {
    (sale.items || []).forEach((item) => {
      rows.push({
        date: sale.date,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_type: item.unit_type,
        price_per_unit: item.price_per_unit,
        amount: item.line_total,
        payment_mode: sale.payment_mode,
      });
    });
  });
  return rows;
}

function flattenPurchases(purchases) {
  return purchases.map((p) => ({
    date: p.date,
    vendor_name: p.vendor_name,
    item_name: p.item_name,
    quantity: p.quantity,
    unit_type: p.unit_type,
    amount: p.amount,
  }));
}

function flattenCredits(credits) {
  const rows = [];
  credits.forEach((credit) => {
    const balance = credit.total_amount - credit.amount_paid;
    (credit.items || []).forEach((item) => {
      rows.push({
        date: credit.date,
        customer_name: credit.customer_name,
        item_name: item.item_name,
        quantity: item.quantity,
        amount: item.line_total,
        amount_received: credit.amount_paid,
        balance,
      });
    });
  });
  return rows;
}

function flattenSpoilage(entries) {
  return entries.map((s) => ({
    date: s.date,
    item_name: s.item_name,
    quantity: s.quantity,
    unit_type: s.unit_type,
    estimated_value: s.estimated_value,
    reason: s.reason,
  }));
}

const REPORT_CONFIG = {
  sales: {
    fetch: getSales,
    flatten: flattenSales,
    amountField: 'amount',
    amountColumnIndex: 5,
    columns: ['Date', 'Item', 'Qty', 'Unit', 'Price/Unit', 'Amount', 'Payment Mode'],
    renderRow: (row, i) => (
      <tr key={i}>
        <td>{toDateOnly(row.date)}</td>
        <td>{row.item_name}</td>
        <td>{row.quantity}</td>
        <td>{row.unit_type}</td>
        <td>{formatCurrency(row.price_per_unit)}</td>
        <td>{formatCurrency(row.amount)}</td>
        <td>{row.payment_mode}</td>
      </tr>
    ),
  },
  purchases: {
    fetch: getPurchases,
    flatten: flattenPurchases,
    amountField: 'amount',
    amountColumnIndex: 5,
    columns: ['Date', 'Vendor', 'Item', 'Qty', 'Unit', 'Amount'],
    renderRow: (row, i) => (
      <tr key={i}>
        <td>{toDateOnly(row.date)}</td>
        <td>{row.vendor_name}</td>
        <td>{row.item_name}</td>
        <td>{row.quantity}</td>
        <td>{row.unit_type}</td>
        <td>{formatCurrency(row.amount)}</td>
      </tr>
    ),
  },
  credits: {
    fetch: getCredits,
    flatten: flattenCredits,
    amountField: 'amount',
    amountColumnIndex: 4,
    columns: ['Date', 'Customer', 'Item', 'Qty', 'Amount', 'Amount Received', 'Balance'],
    renderRow: (row, i) => (
      <tr key={i}>
        <td>{toDateOnly(row.date)}</td>
        <td>{row.customer_name}</td>
        <td>{row.item_name}</td>
        <td>{row.quantity}</td>
        <td>{formatCurrency(row.amount)}</td>
        <td>{formatCurrency(row.amount_received)}</td>
        <td>{formatCurrency(row.balance)}</td>
      </tr>
    ),
  },
  spoilage: {
    fetch: getSpoilageEntries,
    flatten: flattenSpoilage,
    amountField: 'estimated_value',
    amountColumnIndex: 4,
    columns: ['Date', 'Item', 'Qty', 'Unit', 'Estimated Value', 'Reason'],
    renderRow: (row, i) => (
      <tr key={i}>
        <td>{toDateOnly(row.date)}</td>
        <td>{row.item_name}</td>
        <td>{row.quantity}</td>
        <td>{row.unit_type}</td>
        <td>{formatCurrency(row.estimated_value)}</td>
        <td>{row.reason}</td>
      </tr>
    ),
  },
};

export default function Reports() {
  const [tab, setTab] = useState('sales');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const config = REPORT_CONFIG[tab];

  const changeTab = (key) => {
    setTab(key);
    setRows(null);
    setError('');
  };

  const handleGenerate = async () => {
    setError('');
    setLoading(true);
    setRows(null);

    try {
      const records = await config.fetch({ from: fromDate || undefined, to: toDate || undefined });
      setRows(config.flatten(records));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const total = rows ? rows.reduce((sum, row) => sum + (Number(row[config.amountField]) || 0), 0) : 0;

  return (
    <div>
      <h1 className="page-title">Reports</h1>

      <div className="toggle-group" style={{ flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`toggle-option${tab === t.key ? ' active' : ''}`}
            onClick={() => changeTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="line-item-row">
          <div className="form-group">
            <label className="form-label">From Date</label>
            <input
              className="form-input"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">To Date</label>
            <input
              className="form-input"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
        <button className="btn btn-primary btn-full" onClick={handleGenerate} disabled={loading}>
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {rows && (
        rows.length === 0 ? (
          <div className="empty-state">No records found for this range.</div>
        ) : (
          <div className="table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  {config.columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(config.renderRow)}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={config.amountColumnIndex}>Total</td>
                  <td>{formatCurrency(total)}</td>
                  <td colSpan={config.columns.length - config.amountColumnIndex - 1} />
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}
    </div>
  );
}
