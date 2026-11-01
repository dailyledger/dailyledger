import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import MultiSelect from './MultiSelect';
import { useCustomerOptions } from './adminQuery';

/*
 * Pieces every admin page shares: the KPI card, the content card, the change badge, tabs,
 * and the "which stalls, which period" bar.
 */

export const PERIODS = [
  { key: 'all', label: 'All time' },
  { key: 'day', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
];

const AVATAR_COLORS = ['#e8590c', '#2f9e6b', '#3b5bdb', '#f59f00', '#a64dd6', '#e0457b', '#12a594'];
export const avatarColor = (name) =>
  AVATAR_COLORS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

export function timeAgo(value) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/** "+12%" or "-5%" against the previous period; nothing when there is nothing to compare. */
export function Delta({ now, before, points, goodWhenDown }) {
  if (before === null || before === undefined) return null;
  let diff;
  let label;
  if (points) {
    diff = now - before;
    label = `${Math.abs(diff).toFixed(1)} pts`;
  } else {
    if (before === 0) return now === 0 ? null : <span className="a-delta up">New</span>;
    diff = ((now - before) / Math.abs(before)) * 100;
    label = `${Math.abs(diff).toFixed(0)}%`;
  }
  const up = diff >= 0;
  const good = goodWhenDown ? !up : up;
  return (
    <span className={`a-delta ${good ? 'up' : 'down'}`} title="Compared with the previous period">
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {label}
    </span>
  );
}

export function Kpi({ icon: Icon, tone, label, value, negative, delta }) {
  return (
    <div className="a-kpi">
      <div className="a-kpi-top">
        <span className={`a-kpi-icon ${tone}`}>
          <Icon size={20} />
        </span>
        {delta}
      </div>
      <div className={`a-kpi-value${negative ? ' neg' : ''}`}>{value}</div>
      <div className="a-kpi-label">{label}</div>
    </div>
  );
}

export function Card({ title, sub, aside, children, className = '', flush }) {
  return (
    <div className={`a-card ${flush ? 'a-card-flush' : ''} ${className}`}>
      {title && (
        <h3 className="a-card-title">
          {title}
          {aside}
        </h3>
      )}
      {sub && <p className="a-card-sub">{sub}</p>}
      {children}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="a-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          className={value === t.key ? 'active' : ''}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Stall and period filters with a reload button; `tick` changes whenever data should reload. */
export function useScope(defaultPeriod = 'all') {
  const [period, setPeriod] = useState(defaultPeriod);
  const [stalls, setStalls] = useState([]);
  const [tick, setTick] = useState(0);
  return {
    period,
    stalls,
    tick,
    setPeriod,
    setStalls,
    reload: () => setTick((t) => t + 1),
    query: { period, stalls: stalls.join(',') },
  };
}

export function ScopeBar({ scope, hideStalls, hidePeriod }) {
  const options = useCustomerOptions();
  return (
    <div className="a-actions">
      {!hideStalls && (
        <div style={{ width: 250 }}>
          <MultiSelect title="Customers" options={options} value={scope.stalls} onChange={scope.setStalls} placeholder="All customers" />
        </div>
      )}
      {!hidePeriod && (
        <div className="a-seg">
          {PERIODS.map((p) => (
            <button key={p.key} className={scope.period === p.key ? 'active' : ''} onClick={() => scope.setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      <button className="a-btn" onClick={scope.reload} title="Reload data">
        <RefreshCw size={15} /> Reload
      </button>
    </div>
  );
}

/** Calls `fn` every `ms` while mounted (used for live pages). */
export function useInterval(fn, ms) {
  useEffect(() => {
    const timer = setInterval(fn, ms);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
}
