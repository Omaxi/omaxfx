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

// Trading-session boundaries are fixed to the simulator's broker clock (UTC+3).
// New York runs overnight, so 00:00–00:59 belongs to the previous day's NY session.
export function getMarketSession(time) {
  const date = toMarketDate(time);
  if (!date || !Number.isFinite(date.getTime())) return null;
  const hour = date.getUTCHours();
  let key, label;
  if (hour >= 1 && hour < 11) { key = 'asia'; label = 'Asian'; }
  else if (hour >= 11 && hour < 16) { key = 'london'; label = 'London'; }
  else { key = 'newyork'; label = 'New York'; }
  if (key === 'newyork' && hour < 1) date.setUTCDate(date.getUTCDate() - 1);
  const sessionDate = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return { key, label, sessionDate };
}

const pad = (value) => String(value).padStart(2, '0');

/**
 * Find the next available candle in the next occurrence of a configured
 * broker-clock session. Data may contain weekends, holidays, or missing
 * intraday windows, so keep advancing by calendar day until a real candle
 * is found. rawData must be sorted by ascending epoch time.
 */
/**
 * Find the next real candle belonging to the next occurrence of a configured
 * broker-clock session. Scan forward from the replay cursor instead of using
 * binary search: imported CSVs can contain gaps, duplicate timestamps, or
 * imperfect ordering, and a missed lookup must never silently block a jump.
 *
 * Session windows are [start, end). Overnight windows (e.g. 16:00–01:00)
 * attribute after-midnight candles to the previous broker date.
 */
export function findNextSessionCandleIndex(rawData, currentIndex, startHour, endHour, offsetSeconds = MARKET_OFFSET_SECONDS) {
  if (!Array.isArray(rawData) || rawData.length < 2) return -1;
  const start = Number(startHour);
  const end = Number(endHour);
  const offset = Number(offsetSeconds);
  const cursor = Math.trunc(Number(currentIndex));
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= rawData.length - 1 ||
      !Number.isFinite(start) || start < 0 || start >= 24 ||
      !Number.isFinite(end) || end < 0 || end > 24 ||
      !Number.isFinite(offset) || end === start) return -1;

  const overnight = end < start;
  const durationHours = overnight ? end + 24 - start : end - start;
  if (!(durationHours > 0 && durationHours <= 24)) return -1;

  const currentTime = Number(rawData[cursor]?.time);
  if (!Number.isFinite(currentTime)) return -1;
  const secondsPerDay = 86400;
  const currentBrokerDay = Math.floor((currentTime + offset) / secondsPerDay) * secondsPerDay - offset;
  let earliestSessionStart = currentBrokerDay + start * 3600;

  // If the cursor is already at or beyond today's session start, the next
  // occurrence is tomorrow. Otherwise today's upcoming session is eligible.
  if (currentTime >= earliestSessionStart) earliestSessionStart += secondsPerDay;

  const durationSeconds = durationHours * 3600;
  for (let index = cursor + 1; index < rawData.length; index += 1) {
    const candleTime = Number(rawData[index]?.time);
    if (!Number.isFinite(candleTime) || candleTime < earliestSessionStart) continue;

    const brokerDay = Math.floor((candleTime + offset) / secondsPerDay) * secondsPerDay - offset;
    let sessionStart = brokerDay + start * 3600;
    if (overnight && candleTime < sessionStart) sessionStart -= secondsPerDay;

    const sessionEnd = sessionStart + durationSeconds;
    if (sessionStart >= earliestSessionStart &&
        candleTime >= sessionStart && candleTime < sessionEnd) {
      return index;
    }
  }
  return -1;
}


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
