import { useMemo, useState } from 'react';
import {
  BarChart3,
  RotateCcw,
  SlidersHorizontal,
  Upload,
  Settings,
  FileSpreadsheet,
  FileText,
  ArrowUpDown,
} from 'lucide-react';
import { adminGetReport, adminGetVoided } from '../../api';
import { formatCurrency, formatDate } from '../../format';
import MultiSelect from './MultiSelect';
import { useCustomerOptions, isoToday } from './adminQuery';
import { exportExcel, exportPdf } from './exportReport';

const dateOnly = (value) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

/*
 * One config per report type: how to fetch it, which columns it shows, and its
 * totals row. `key` columns read from the row; `money` columns are right-aligned
 * rupee amounts; `fmt` formats non-money cells for the screen.
 */
const REPORTS = {
  sales: {
    label: 'Sales',
    usesPayment: true,
    fetch: (q) => adminGetReport('sales', q),
    columns: [
      { key: 'date', label: 'Date', fmt: dateOnly },
      { key: 'stall', label: 'Customer' },
      { key: 'detail', label: 'Items' },
      { key: 'payment_mode', label: 'Payment' },
      { key: 'amount', label: 'Amount', money: true },
    ],
    totals: (res) => ({ amount: res.total }),
  },
  'sales-by-product': {
    label: 'Sales by product',
    usesPayment: true,
    fetch: (q) => adminGetReport('sales-by-product', q),
    columns: [
      { key: 'stall', label: 'Customer' },
      { key: 'item', label: 'Product' },
      { key: 'unit', label: 'Unit' },
      { key: 'quantity', label: 'Units sold', numeric: true },
      { key: 'revenue', label: 'Revenue', money: true },
      { key: 'cost', label: 'Cost', money: true },
      { key: 'profit', label: 'Profit', money: true },
    ],
    totals: (res) => res.totals,
  },
  purchases: {
    label: 'Purchases',
    usesPayment: true,
    fetch: (q) => adminGetReport('purchases', q),
    columns: [
      { key: 'date', label: 'Date', fmt: dateOnly },
      { key: 'stall', label: 'Customer' },
      { key: 'detail', label: 'Item (vendor)' },
      { key: 'payment_mode', label: 'Payment' },
      { key: 'amount', label: 'Amount', money: true },
    ],
    totals: (res) => ({ amount: res.total }),
  },
  voided: {
    label: 'Voided entries',
    usesPayment: false,
    fetch: (q) => adminGetVoided(q),
    columns: [
      { key: 'voided_at', label: 'Voided at', fmt: formatDate },
      { key: 'type', label: 'Type' },
      { key: 'stall', label: 'Customer' },
      { key: 'detail', label: 'Details' },
      { key: 'amount', label: 'Amount', money: true },
      { key: 'voided_by', label: 'Voided by' },
      { key: 'reason', label: 'Reason' },
    ],
    totals: () => null,
  },
};

const PAGE_SIZES = [5, 10, 20, 50, 'all'];
const INITIAL = { customers: [], type: 'sales', from: '', to: isoToday(), payment: '', includeVoided: false };

export default function AdminReports() {
  const options = useCustomerOptions();
  const [form, setForm] = useState(INITIAL);
  const [showFilters, setShowFilters] = useState(true);
  const [startError, setStartError] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { type, rows, totals, from, to, customers }
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const config = REPORTS[result?.type || form.type];
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const generate = async () => {
    if (!form.from) {
      setStartError(true);
      setError('Start date is required.');
      return;
    }
    if (form.to && form.to < form.from) {
      setError('End date cannot be before the start date.');
      return;
    }

    setStartError(false);
    setError('');
    setLoading(true);
    try {
      const type = form.type;
      const res = await REPORTS[type].fetch({
        stalls: form.customers.join(','),
        from: form.from,
        to: form.to,
        payment_mode: REPORTS[type].usesPayment ? form.payment : '',
        include_voided: REPORTS[type].usesPayment && form.includeVoided ? 'true' : '',
      });
      setResult({
        type,
        rows: res.rows,
        totals: REPORTS[type].totals(res),
        truncated: res.truncated,
        from: form.from,
        to: form.to,
        customers: options.filter((o) => form.customers.includes(o.id)).map((o) => o.label),
      });
      setPage(1);
      setSort({ key: null, dir: 'asc' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setForm({ ...INITIAL, to: isoToday() });
    setResult(null);
    setError('');
    setStartError(false);
    setPage(1);
  };

  const sorted = useMemo(() => {
    if (!result) return [];
    if (!sort.key) return result.rows;
    const col = config.columns.find((c) => c.key === sort.key);
    const numeric = col.money || col.numeric;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...result.rows].sort((a, b) => {
      const x = a[sort.key] ?? '';
      const y = b[sort.key] ?? '';
      return (numeric ? Number(x) - Number(y) : String(x).localeCompare(String(y))) * dir;
    });
  }, [result, sort, config]);

  const size = pageSize === 'all' ? Math.max(sorted.length, 1) : pageSize;
  const pageCount = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(page, pageCount);
  const visible = sorted.slice((current - 1) * size, current * size);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const cellText = (col, row) => (col.fmt ? col.fmt(row[col.key]) : row[col.key] ?? '');

  /** The report as plain values, in the order shown on screen, for the exporters. */
  const buildExport = () => {
    const cols = config.columns;
    const range = `${result.from ? dateOnly(result.from) : 'Any'} to ${result.to ? dateOnly(result.to) : 'Any'}`;
    return {
      title: `${config.label} report`,
      meta: [
        `Customers: ${result.customers.length ? result.customers.join(', ') : 'All customers'}`,
        `Period: ${range}`,
        `Generated: ${new Date().toLocaleString('en-IN')}`,
      ],
      headers: cols.map((c) => c.label),
      rows: sorted.map((row) => cols.map((c) => (c.money ? row[c.key] : cellText(c, row)))),
      moneyCols: new Set(cols.flatMap((c, i) => (c.money ? [i] : []))),
      totals: result.totals
        ? cols.map((c, i) => (i === 0 ? 'Total' : result.totals[c.key] !== undefined ? result.totals[c.key] : ''))
        : null,
    };
  };

  const doExport = async (kind) => {
    setExportOpen(false);
    setExporting(true);
    setError('');
    try {
      await (kind === 'pdf' ? exportPdf : exportExcel)(buildExport());
    } catch (err) {
      setError(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="a-report-head">
        <h1 className="a-report-title">
          <BarChart3 size={22} />
          {config.label} report
        </h1>
        <div className="a-actions">
          <button className="a-btn" onClick={reset} disabled={exporting}>
            <RotateCcw size={16} /> Reset
          </button>
          <button className={`a-btn${showFilters ? ' a-btn-active' : ''}`} onClick={() => setShowFilters((s) => !s)}>
            <SlidersHorizontal size={16} /> Filters
          </button>
          <div className="a-export">
            <button
              className="a-btn a-btn-primary"
              onClick={() => setExportOpen((o) => !o)}
              disabled={!result || exporting}
              title={result ? 'Export this report' : 'Generate a report first'}
            >
              <Upload size={16} /> {exporting ? 'Exporting...' : 'Export'}
            </button>
            {exportOpen && (
              <div className="a-menu">
                <button onClick={() => doExport('xlsx')}>
                  <FileSpreadsheet size={18} /> Excel (.xlsx)
                </button>
                <button onClick={() => doExport('pdf')}>
                  <FileText size={18} /> PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="a-error">{error}</div>}

      {showFilters && (
        <div className="a-card a-filters">
          <div className="a-field">
            <label className="a-label">Customers</label>
            <MultiSelect
              title="Customers"
              options={options}
              value={form.customers}
              onChange={(customers) => set({ customers })}
              placeholder="Select Customers... (none = all)"
            />
          </div>
          <div className="a-field">
            <label className="a-label">Report type</label>
            <select className="a-select" value={form.type} onChange={(e) => set({ type: e.target.value })}>
              {Object.entries(REPORTS).map(([key, r]) => (
                <option key={key} value={key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="a-field">
            <label className="a-label">
              Start date <span className="req">*</span>
            </label>
            <input
              type="date"
              className={`a-input${startError ? ' invalid' : ''}`}
              value={form.from}
              max={form.to || undefined}
              onChange={(e) => {
                set({ from: e.target.value });
                setStartError(false);
              }}
            />
          </div>
          <div className="a-field">
            <label className="a-label">End date</label>
            <input
              type="date"
              className="a-input"
              value={form.to}
              min={form.from || undefined}
              onChange={(e) => set({ to: e.target.value })}
            />
          </div>

          {REPORTS[form.type].usesPayment && (
            <>
              <div className="a-field">
                <label className="a-label">Payment</label>
                <select className="a-select" value={form.payment} onChange={(e) => set({ payment: e.target.value })}>
                  <option value="">All</option>
                  <option value="cash">Cash</option>
                  <option value="gpay">GPay</option>
                </select>
              </div>
              {form.type !== 'sales-by-product' && (
                <label className="a-check" style={{ alignSelf: 'end' }}>
                  <input
                    type="checkbox"
                    checked={form.includeVoided}
                    onChange={(e) => set({ includeVoided: e.target.checked })}
                  />
                  Include voided entries
                </label>
              )}
            </>
          )}

          <div className="a-filters-foot">
            <button className="a-btn a-btn-primary" onClick={generate} disabled={loading}>
              <Settings size={16} /> {loading ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      )}

      <div className="a-pager">
        <div>
          Records per page:
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n === 'all' ? 'All' : n}
              </option>
            ))}
          </select>
          <span style={{ marginLeft: 20 }}>
            Total records: <strong>{result ? result.rows.length : 0}</strong>
            {result?.truncated && ' (latest only, narrow the dates)'}
          </span>
        </div>
        <div className="a-pager-nav">
          <button className="a-btn a-btn-sm" onClick={() => setPage(current - 1)} disabled={current <= 1}>
            Previous
          </button>
          <span>
            Page <strong>{current}</strong> of <strong>{pageCount}</strong>
          </span>
          <button className="a-btn a-btn-sm" onClick={() => setPage(current + 1)} disabled={current >= pageCount}>
            Next
          </button>
        </div>
      </div>

      <div className="a-card a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              {config.columns.map((col) => (
                <th
                  key={col.key}
                  className={`sortable${col.money || col.numeric ? ' num' : ''}`}
                  onClick={() => result && toggleSort(col.key)}
                >
                  {col.label}
                  {result && <ArrowUpDown size={12} style={{ marginLeft: 6, opacity: sort.key === col.key ? 1 : 0.35 }} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!result ? (
              <tr>
                <td colSpan={config.columns.length} className="a-empty">
                  Choose your filters and press Generate.
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={config.columns.length} className="a-empty">
                  No records for these filters.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={`${row.type || ''}${row.id}`}>
                  {config.columns.map((col) => (
                    <td
                      key={col.key}
                      className={`${col.money || col.numeric ? 'num' : ''}${col.key === 'profit' && row.profit < 0 ? ' neg' : ''}`}
                    >
                      {col.money ? formatCurrency(row[col.key]) : cellText(col, row) || <span className="muted">-</span>}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {result?.totals && visible.length > 0 && (
            <tfoot>
              <tr>
                {config.columns.map((col, i) => (
                  <td key={col.key} className={col.money || col.numeric ? 'num' : ''}>
                    {i === 0
                      ? 'Total'
                      : result.totals[col.key] !== undefined
                        ? col.money
                          ? formatCurrency(result.totals[col.key])
                          : result.totals[col.key]
                        : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
