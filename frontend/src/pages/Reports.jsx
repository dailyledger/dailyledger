import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { getSales, getPurchases, getCredits, getSpoilageEntries } from '../api';
import { formatCurrency } from '../format';
import DateField from '../components/DateField';

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

function toISODate(date) {
  if (!date) return undefined;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    columns: [
      { label: 'Date' },
      { label: 'Item' },
      { label: 'Qty', numeric: true },
      { label: 'Unit' },
      { label: 'Price/Unit', numeric: true },
      { label: 'Payment Mode' },
      { label: 'Amount', numeric: true },
    ],
    renderRow: (row, i) => (
      <tr key={i}>
        <td>{toDateOnly(row.date)}</td>
        <td>{row.item_name}</td>
        <td className="num">{row.quantity}</td>
        <td>{row.unit_type}</td>
        <td className="num">{formatCurrency(row.price_per_unit)}</td>
        <td>{row.payment_mode}</td>
        <td className="num">{formatCurrency(row.amount)}</td>
      </tr>
    ),
  },
  purchases: {
    fetch: getPurchases,
    flatten: flattenPurchases,
    amountField: 'amount',
    columns: [
      { label: 'Date' },
      { label: 'Vendor' },
      { label: 'Item' },
      { label: 'Qty', numeric: true },
      { label: 'Unit' },
      { label: 'Amount', numeric: true },
    ],
    renderRow: (row, i) => (
      <tr key={i}>
        <td>{toDateOnly(row.date)}</td>
        <td>{row.vendor_name}</td>
        <td>{row.item_name}</td>
        <td className="num">{row.quantity}</td>
        <td>{row.unit_type}</td>
        <td className="num">{formatCurrency(row.amount)}</td>
      </tr>
    ),
  },
  credits: {
    fetch: getCredits,
    flatten: flattenCredits,
    amountField: 'amount',
    columns: [
      { label: 'Date' },
      { label: 'Customer' },
      { label: 'Item' },
      { label: 'Qty', numeric: true },
      { label: 'Amount Received', numeric: true },
      { label: 'Balance', numeric: true },
      { label: 'Amount', numeric: true },
    ],
    renderRow: (row, i) => (
      <tr key={i}>
        <td>{toDateOnly(row.date)}</td>
        <td>{row.customer_name}</td>
        <td>{row.item_name}</td>
        <td className="num">{row.quantity}</td>
        <td className="num">{formatCurrency(row.amount_received)}</td>
        <td className="num">{formatCurrency(row.balance)}</td>
        <td className="num">{formatCurrency(row.amount)}</td>
      </tr>
    ),
  },
  spoilage: {
    fetch: getSpoilageEntries,
    flatten: flattenSpoilage,
    amountField: 'estimated_value',
    columns: [
      { label: 'Date' },
      { label: 'Item' },
      { label: 'Qty', numeric: true },
      { label: 'Unit' },
      { label: 'Reason' },
      { label: 'Estimated Value', numeric: true },
    ],
    renderRow: (row, i) => (
      <tr key={i}>
        <td>{toDateOnly(row.date)}</td>
        <td>{row.item_name}</td>
        <td className="num">{row.quantity}</td>
        <td>{row.unit_type}</td>
        <td>{row.reason}</td>
        <td className="num">{formatCurrency(row.estimated_value)}</td>
      </tr>
    ),
  },
};

export default function Reports() {
  const [tab, setTab] = useState('sales');
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
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
      const records = await config.fetch({ from: toISODate(fromDate), to: toISODate(toDate) });
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
      <div className="reports-header">
        <span className="reports-header-icon">
          <BarChart3 size={22} strokeWidth={2} />
        </span>
        <h1 className="page-title">Reports</h1>
      </div>

      <div className="report-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`report-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => changeTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <DateField
            label="From Date"
            selected={fromDate}
            onChange={setFromDate}
            placeholder="Select start date"
            maxDate={toDate || undefined}
          />
          <DateField
            label="To Date"
            selected={toDate}
            onChange={setToDate}
            placeholder="Select end date"
          />
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
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
                    <th key={col.label} className={col.numeric ? 'num' : ''}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(config.renderRow)}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={config.columns.length - 1}>Total</td>
                  <td className="num">{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}
    </div>
  );
}
