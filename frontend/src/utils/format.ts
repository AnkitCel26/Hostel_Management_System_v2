/** Display formatting helpers shared across pages. */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

/** Formats a whole-rupee amount for display (rent values are stored as ints). */
export function formatCurrency(amount: number): string {
  return inrFormatter.format(amount);
}

export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function formatDateOnly(dateOnly: string | null | undefined): string {
  if (!dateOnly) return '—';
  return formatDate(`${dateOnly}T00:00:00`);
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

export function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return initials || '?';
}
