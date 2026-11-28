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
export function findNextSessionCandleIndex(rawData, currentIndex, startHour, endHour, offsetSeconds = MARKET_OFFSET_SECONDS) {
  if (!Array.isArray(rawData) || rawData.length === 0) return -1;
  const start = Number(startHour);
  let end = Number(endHour);
  const offset = Number(offsetSeconds);
  const cursor = Math.trunc(Number(currentIndex));
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= rawData.length ||
      !Number.isFinite(start) || start < 0 || start >= 24 ||
      !Number.isFinite(end) || end < 0 || end > 24 ||
      !Number.isFinite(offset)) return -1;

  // Permit overnight windows (for example 16:00–01:00), while rejecting
  // equal start/end values because they do not describe a usable session.
  if (end <= start) {
    if (end === start) return -1;
    end += 24;
  }

  const currentTime = Number(rawData[cursor]?.time);
  const lastTime = Number(rawData[rawData.length - 1]?.time);
  if (!Number.isFinite(currentTime) || !Number.isFinite(lastTime)) return -1;

  const secondsPerDay = 86400;
  const brokerDayStart = Math.floor((currentTime + offset) / secondsPerDay) * secondsPerDay - offset;
  let sessionStart = brokerDayStart + start * 3600;
  if (currentTime >= sessionStart) sessionStart += secondsPerDay;

  // Binary-search each candidate window. If a day has no candles in the
  // requested session, skip it rather than failing the click.
  while (sessionStart <= lastTime) {
    const sessionEnd = sessionStart + (end - start) * 3600;
    let low = cursor + 1;
    let high = rawData.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      const time = Number(rawData[middle]?.time);
      if (Number.isFinite(time) && time < sessionStart) low = middle + 1;
      else high = middle;
    }
    if (low < rawData.length) {
      const candidateTime = Number(rawData[low]?.time);
      if (Number.isFinite(candidateTime) && candidateTime >= sessionStart && candidateTime < sessionEnd) return low;
    }
    sessionStart += secondsPerDay;
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
