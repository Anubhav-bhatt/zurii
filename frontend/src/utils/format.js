/**
 * Display formatting. The database stores normalized numbers; every price and
 * duration string a user sees is produced here, so no component invents its
 * own format.
 */

const FORMATTERS = new Map();

function currencyFormatter(currency) {
  if (!FORMATTERS.has(currency)) {
    FORMATTERS.set(
      currency,
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      })
    );
  }
  return FORMATTERS.get(currency);
}

/**
 * 59700 → '₹59,700'   (en-IN grouping, matching the original static data)
 * 159999 → '₹1,59,999'
 *
 * Returns null for a missing amount so callers can hide the element instead of
 * rendering '₹NaN'.
 */
export function formatCurrency(amount, currency = 'INR') {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return null;
  try {
    return currencyFormatter(currency).format(Number(amount));
  } catch {
    // Unknown currency code — fall back to a plain grouped number.
    return `${currency} ${Number(amount).toLocaleString('en-IN')}`;
  }
}

/**
 * Build '7 Days / 6 Nights' from the numeric columns.
 *
 * `fallbackText` is the migrated `duration_text`, used when parsing was
 * incomplete — never guess the missing half.
 */
export function formatDuration(days, nights, fallbackText = null) {
  if (Number.isFinite(days) && Number.isFinite(nights)) return `${days} Days / ${nights} Nights`;
  if (fallbackText) return fallbackText;
  if (Number.isFinite(days)) return `${days} Days`;
  if (Number.isFinite(nights)) return `${nights} Nights`;
  return null;
}

/** 'beach' → 'Beach' for tag chips. */
export function titleCase(value) {
  if (!value) return '';
  return String(value)
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
