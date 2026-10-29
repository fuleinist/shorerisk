const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatAUD(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const millions = value / 1_000_000;
    return `$${trimZero(millions.toFixed(1))}M`;
  }
  if (abs >= 1_000) {
    const thousands = value / 1_000;
    return `$${trimZero(thousands.toFixed(thousands >= 100 ? 0 : 1))}k`;
  }
  return `$${Math.round(value)}`;
}

export function formatAUDExact(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  const groups: string[] = [];
  for (let index = digits.length; index > 0; index -= 3) {
    groups.unshift(digits.slice(Math.max(0, index - 3), index));
  }
  return `${sign}$${groups.join(',')}`;
}

export function formatCount(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatPercent(value: number, places = 0): string {
  return `${(value * 100).toFixed(places)}%`;
}

export function formatNumber(value: number, places = 1): string {
  return trimZero(value.toFixed(places));
}

export function trimZero(text: string): string {
  return text.replace(/\.0$/, '');
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()] ?? '';
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

export function formatClass(assetClass: string): string {
  return assetClass.replace(/_/g, ' ');
}