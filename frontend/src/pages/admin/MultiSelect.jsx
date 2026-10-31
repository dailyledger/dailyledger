import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

/**
 * Multi-select dropdown with search and "Select All" (same behaviour as the Odoo
 * report filters). `options` is [{ id, label, sub? }]; `value` is an array of ids.
 */
export default function MultiSelect({ options, value, onChange, placeholder = 'Select...', title }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const selected = options.filter((o) => value.includes(o.id));
  const visible = options.filter((o) =>
    `${o.label} ${o.sub || ''}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  const allSelected = options.length > 0 && value.length === options.length;

  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className={`a-ms${open ? ' open' : ''}`} ref={box}>
      <div className="a-ms-control" onClick={() => setOpen((o) => !o)}>
        {selected.length === 0 && <span className="a-ms-placeholder">{placeholder}</span>}
        {selected.slice(0, 2).map((o) => (
          <span className="a-chip" key={o.id}>
            <span>{o.label}</span>
            <button
              type="button"
              aria-label={`Remove ${o.label}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(o.id);
              }}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {selected.length > 2 && <span className="a-chip">+{selected.length - 2} more</span>}
        <ChevronDown className="a-ms-caret" size={16} />
      </div>

      {open && (
        <div className="a-ms-panel">
          <div className="a-ms-head">
            <strong>
              {title || 'Options'}
              {value.length > 0 && <span style={{ color: 'var(--a-muted)' }}> ({value.length})</span>}
            </strong>
            <label className="a-ms-all">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onChange(allSelected ? [] : options.map((o) => o.id))}
              />
              <strong>Select All</strong>
            </label>
          </div>
          <div className="a-ms-search">
            <input
              className="a-input"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="a-ms-list">
            {visible.length === 0 ? (
              <div className="a-empty" style={{ padding: 16 }}>
                No matches
              </div>
            ) : (
              visible.map((o) => (
                <label className="a-ms-item" key={o.id}>
                  <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
                  <span>
                    {o.label}
                    {o.sub && <small>{o.sub}</small>}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
