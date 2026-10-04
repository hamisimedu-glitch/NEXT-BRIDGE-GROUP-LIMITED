export function parseMoney(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMoneyInput(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^0-9.]/g, '');
  const decimalIndex = normalized.indexOf('.');
  const whole = decimalIndex < 0 ? normalized : normalized.slice(0, decimalIndex);
  const fraction = decimalIndex < 0 ? '' : normalized.slice(decimalIndex + 1).replace(/\./g, '').slice(0, 2);
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimalIndex < 0 ? groupedWhole : `${groupedWhole}.${fraction}`;
}

export function formatKes(amount: number | null | undefined, fractionDigits = 0) {
  if (amount == null || !Number.isFinite(Number(amount))) return '—';
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: Math.max(fractionDigits, 2),
  }).format(Number(amount));
}

export function formatDateTime(value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    ...options,
  }).format(date);
}
