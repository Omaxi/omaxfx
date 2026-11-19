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
    const weekOffset = minutes === 10080 ? 4 * 86400 : 0;
    const bucketTime = Math.floor((candle.time - weekOffset) / interval) * interval + weekOffset;
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
