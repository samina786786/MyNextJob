import type { SalaryPeriod } from '@/lib/jobs/types';

const PERIOD_LABEL: Record<Exclude<SalaryPeriod, 'unknown'>, string> = {
  hour: 'hour',
  day: 'day',
  month: 'month',
  year: 'year',
};

function currencySymbol(currency: string): string {
  const code = currency.trim().toUpperCase();
  if (code === 'USD' || code === '$') return '$';
  if (code === 'INR' || code === '₹') return '₹';
  if (code === 'EUR' || code === '€') return '€';
  if (code === 'GBP' || code === '£') return '£';
  return `${code} `;
}

function formatAmount(value: number, currency: string): string {
  const code = currency.trim().toUpperCase();
  const symbol = currencySymbol(currency);

  if (code === 'INR' || currency.trim() === '₹') {
    if (value >= 100_000) {
      const lakhs = value / 100_000;
      const compact = Number.isInteger(lakhs) ? String(lakhs) : lakhs.toFixed(1).replace(/\.0$/, '');
      return `₹${compact}L`;
    }
    return `₹${Math.round(value).toLocaleString('en-IN')}`;
  }

  if (value >= 1000) {
    const thousands = value / 1000;
    const compact = Number.isInteger(thousands)
      ? String(thousands)
      : thousands.toFixed(1).replace(/\.0$/, '');
    return `${symbol}${compact}k`;
  }

  return `${symbol}${Math.round(value).toLocaleString('en-US')}`;
}

function periodLabel(period: SalaryPeriod | null): string | null {
  if (!period || period === 'unknown') return null;
  return PERIOD_LABEL[period];
}

/**
 * Structured salary only. Omit the row when min/max are both missing.
 * Does not infer compensation from description text.
 */
export function formatSalary(input: {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
}): string | null {
  const min = input.salaryMin;
  const max = input.salaryMax;
  if (min == null && max == null) return null;
  const currency = input.salaryCurrency?.trim();
  if (!currency) return null;

  let range: string;
  if (min != null && max != null && min !== max) {
    range = `${formatAmount(min, currency)}–${formatAmount(max, currency)}`;
  } else {
    range = formatAmount(min ?? max ?? 0, currency);
  }

  const period = periodLabel(input.salaryPeriod);
  return period ? `${range} / ${period}` : range;
}
