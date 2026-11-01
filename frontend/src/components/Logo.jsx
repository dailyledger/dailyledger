import { useId } from 'react';

/** DailyLedger mark: an open ledger with a rupee coin. */
export function LogoMark({ size = 40 }) {
  // Each mark needs its own gradient id: a copy inside a hidden panel would otherwise
  // win the lookup and leave the visible one unpainted.
  const gradientId = `dl-mark-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="DailyLedger">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F97316" />
          <stop offset="1" stopColor="#C2410C" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${gradientId})`} />
      <path d="M10.5 13c3.3-1.3 6.6-1 9.5 1v15c-2.9-2-6.2-2.3-9.5-1z" fill="#fff" />
      <path d="M29.5 13c-3.3-1.3-6.6-1-9.5 1v15c2.9-2 6.2-2.3 9.5-1z" fill="#fff" fillOpacity=".82" />
      <circle cx="29" cy="11" r="5" fill="#FFD166" />
      <path
        d="M26.9 9.4h4.2M26.9 11h4.2M28.2 9.4c1.6 0 1.6 2.6 0 2.6l1.4 2"
        stroke="#9A3412"
        strokeWidth=".9"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Mark plus wordmark. `light` is for dark or coloured backgrounds. */
export default function Logo({ size = 40, light = false, subtitle }) {
  return (
    <span className={`brand-logo${light ? ' light' : ''}`}>
      <LogoMark size={size} />
      <span className="brand-logo-text">
        <span className="brand-logo-name">
          Daily<b>Ledger</b>
        </span>
        {subtitle && <span className="brand-logo-sub">{subtitle}</span>}
      </span>
    </span>
  );
}
