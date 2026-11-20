const MARKET_OFFSET_SECONDS = 3 * 60 * 60;

export function toMarketDate(time) {
  if (typeof time === 'number' && Number.isFinite(time)) {
    return new Date((time + MARKET_OFFSET_SECONDS) * 1000);
  }
  if (time && typeof time === 'object' &&
      Number.isInteger(time.year) && Number.isInteger(time.month) && Number.isInteger(time.day)) {
    return new Date(Date.UTC(time.year, time.month - 1, time.day, 3));
  }
  return null;
}

const pad = (value) => String(value).padStart(2, '0');

export function formatMarketDateTime(time) {
  const date = toMarketDate(time);
  if (!date || !Number.isFinite(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

// Lightweight Charts TickMarkType values: Year=0, Month=1, DayOfMonth=2,
// Time=3, TimeWithSeconds=4. All labels use the broker's UTC+3 clock.
export function formatMarketTick(time, tickMarkType) {
  const date = toMarketDate(time);
  if (!date || !Number.isFinite(date.getTime())) return '';
  const month = date.toLocaleString('en', { month: 'short', timeZone: 'UTC' });
  switch (Number(tickMarkType)) {
    case 0: return String(date.getUTCFullYear());
    case 1: return month;
    case 2: return `${date.getUTCDate()} ${month}`;
    default: return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  }
}
