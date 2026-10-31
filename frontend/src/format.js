export function formatCurrency(value) {
  const n = Number(value) || 0;
  const text = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return n < 0 ? `-₹${text}` : `₹${text}`;
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
