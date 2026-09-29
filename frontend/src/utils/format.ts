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

/** Formats an ISO date string as a readable local date. */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Formats a date-only value (YYYY-MM-DD) as a readable local date. Anchored
 * to local midnight so the calendar day never shifts with the viewer's
 * timezone (a plain `new Date('2026-09-01')` parses as UTC midnight).
 */
export function formatDateOnly(dateOnly: string | null | undefined): string {
  if (!dateOnly) return '—';
  return formatDate(`${dateOnly}T00:00:00`);
}

/** Up to two uppercase initials derived from a person's name (for avatars). */
export function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return initials || '?';
}
