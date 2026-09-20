// Format a number as money with thousand separators: 1000000 → "1,000,000.00"
export const fmtMoney = (n, decimals = 2) => {
  if (n == null || isNaN(n)) return '0.00';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

// Format a number as integer with separators: 1000000 → "1,000,000"
export const fmtInt = (n) => {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US', {
    maximumFractionDigits: 0,
  });
};

// Compact bytes: 15234567 → "15.2 MB"
export const fmtMB = (bytes) => {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(1) + ' MB';
};