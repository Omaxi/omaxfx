// Return the UTC-aligned start timestamp for a selected timeframe bucket.
export const getTimeframeBucketStart = (time, timeframeMinutes) => {
  const minutes = Number(timeframeMinutes);
  if (!Number.isFinite(minutes) || minutes <= 1) return Number(time);
  const interval = Math.round(minutes * 60);
  // Source timestamps are stored three hours behind the UTC+3 market clock.
  // Align daily candles to the broker's UTC+3 market calendar; keep weekly candles UTC-aligned.
  const marketOffset = minutes === 1440 ? 3 * 3600 : 0;
  const weekOffset = minutes === 10080 ? 4 * 86400 : 0;
  return Math.floor((Number(time) + marketOffset - weekOffset) / interval) * interval + weekOffset - marketOffset;
};

// Aggregate sorted OHLC candles into UTC-aligned timeframe buckets.
export const aggregateData = (data, timeframeMinutes) => {
  if (!Array.isArray(data) || data.length === 0) return [];
  const minutes = Number(timeframeMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return data;
  if (minutes === 1) return data;

  const interval = Math.round(minutes * 60);
  const aggregated = [];
  let current = null;

  for (const candle of data) {
    if (!candle || !Number.isFinite(candle.time)) continue;
    // Daily boundaries follow the UTC+3 market calendar used by the CSV.
    const marketOffset = minutes === 1440 ? 3 * 3600 : 0;
    const weekOffset = minutes === 10080 ? 4 * 86400 : 0;
    const bucketTime = Math.floor((candle.time + marketOffset - weekOffset) / interval) * interval + weekOffset - marketOffset;
    if (!current || current.time !== bucketTime) {
      if (current) aggregated.push(current);
      current = {
        time: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: Number.isFinite(candle.volume) ? candle.volume : 0,
      };
      continue;
    }
    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    current.close = candle.close;
    current.volume += Number.isFinite(candle.volume) ? candle.volume : 0;
  }

  if (current) aggregated.push(current);
  return aggregated;
};


// Return the most recent fully completed candle at the selected timeframe.
// For aggregated bars, currentIndex is the next raw candle at the replay boundary.
export const getExecutionCandle = (rawData, displayData, currentIndex, timeframeMinutes) => {
  const cursor = rawData?.[currentIndex];
  if (!cursor) return null;
  const minutes = Number(timeframeMinutes) || 1;
  if (minutes <= 1) return cursor;
  const cutoff = Number(cursor.time) + 60;
  const bars = Array.isArray(displayData) ? displayData : aggregateData(rawData, minutes);
  for (let i = bars.length - 1; i >= 0; i--) {
    const bar = bars[i];
    if (Number(bar.time) + minutes * 60 <= cutoff) {
      return { ...bar, time: Number(bar.time) + minutes * 60 - 60 };
    }
  }
  return null;
};
