import DateField from './DateField';

/**
 * Optional date on an entry form, so yesterday's book can be entered this morning.
 * Without it every entry was stamped "now", which pushed a whole missed day onto
 * the day you caught up.
 *
 * Capped at today (a mistyped year would otherwise hide the entry in a month
 * nobody looks at) and at a year back, matching the server's own limit.
 */
export const MAX_BACKDATE_DAYS = 365;

export function earliestAllowedDate() {
  const d = new Date();
  d.setDate(d.getDate() - MAX_BACKDATE_DAYS);
  return d;
}

/**
 * What to send to the server. `null` means today — we leave the field off entirely
 * so the server stamps the real time rather than a made-up one.
 *
 * A back-dated entry is sent as midday, safely inside the chosen day whichever way
 * the shop's timezone falls.
 */
export function entryDatePayload(date) {
  if (!date) return {};

  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (isToday) return {};

  const stamped = new Date(date);
  stamped.setHours(12, 0, 0, 0);
  return { date: stamped.toISOString() };
}

export default function EntryDateField({ value, onChange }) {
  return (
    <DateField
      label="Date"
      hint="leave blank for today"
      selected={value}
      onChange={onChange}
      placeholder="Today"
      minDate={earliestAllowedDate()}
      maxDate={new Date()}
    />
  );
}
