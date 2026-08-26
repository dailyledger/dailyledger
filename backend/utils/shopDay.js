// Blocker 05: "today" must mean the shop's today, not the server's.
//
// `new Date('2026-08-26T00:00:00.000')` has no timezone designator, so V8 parses
// it in the server's local zone. Render runs containers in UTC while the shops
// are in IST (UTC+5:30), which shifted every daily boundary by 5.5 hours.
//
// Instead of doing timezone arithmetic inside queries, we stamp an indexed
// `date_key` ("YYYY-MM-DD") on every transaction at write time, computed in the
// shop's own zone. Daily grouping then becomes a plain string match that cannot
// drift.

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

// Node ships with full ICU, so Intl handles the DST/offset rules for us.
function partsInZone(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = {};
  for (const { type, value } of fmt.formatToParts(date)) {
    parts[type] = value;
  }

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    // 'en-CA' with hour12:false renders midnight as "24" rather than "00".
    hour: Number(parts.hour) % 24,
  };
}

/**
 * The business-day key for `date` in `timeZone`.
 *
 * `dayStartHour` handles shops that close after midnight: with dayStartHour = 6,
 * a sale at 1am Wednesday still belongs to Tuesday's takings, which is how the
 * owner counts it.
 */
function dateKeyFor(date, timeZone = DEFAULT_TIMEZONE, dayStartHour = 0) {
  const when = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(when.getTime())) {
    throw new Error('dateKeyFor: invalid date');
  }

  const { year, month, day, hour } = partsInZone(when, timeZone);

  if (dayStartHour > 0 && hour < dayStartHour) {
    // Before the day boundary: this belongs to the previous business day.
    const shifted = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    shifted.setUTCDate(shifted.getUTCDate() - 1);
    return shifted.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function todayKey(timeZone = DEFAULT_TIMEZONE, dayStartHour = 0) {
  return dateKeyFor(new Date(), timeZone, dayStartHour);
}

/** Inclusive list of keys from `startKey` back `days` business days. */
function keysBack(days, timeZone = DEFAULT_TIMEZONE, dayStartHour = 0) {
  const today = todayKey(timeZone, dayStartHour);
  const cursor = new Date(`${today}T00:00:00.000Z`);
  const keys = [];
  for (let i = 0; i < days; i += 1) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return keys;
}

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

module.exports = { DEFAULT_TIMEZONE, dateKeyFor, todayKey, keysBack, isDateKey };
