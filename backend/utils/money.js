// Money is stored as rupees in a Number field. Floating point makes
// `amount / quantity` produce values like 33.333333333333336, which accumulate
// into visible drift across reports. Every computed money value must pass
// through round2() before it is stored or compared.
//
// The stronger fix is to store integer paise everywhere; that is a larger change
// because every frontend display would need to divide by 100. Rounding at each
// write boundary removes the drift without that churn.

function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  // Number.EPSILON nudge avoids 1.005 -> 1.00 (it is really 1.00499999...).
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Quantities can be fractional (1.5 kg) but not endlessly so. Three decimals
// covers grams-in-kg without letting float noise through.
function round3(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

module.exports = { round2, round3, isPositiveNumber, isNonNegativeNumber };
