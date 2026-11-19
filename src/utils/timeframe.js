export const aggregateData = (data, timeframeMinutes) => {
  if (timeframeMinutes === 1 || data.length === 0) return data;

  const aggregated = [];
  let currentCandle = null;
  const timeframeSeconds = timeframeMinutes * 60;

  data.forEach((candle) => {
    // Align bars to actual epoch clock boundaries, not the first CSV row.
    const blockTime = Math.floor(candle.time / timeframeSeconds) * timeframeSeconds;

    if (!currentCandle || currentCandle.time !== blockTime) {
      if (currentCandle) aggregated.push(currentCandle);
      currentCandle = {
        time: blockTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
      };
    } else {
      currentCandle.high = Math.max(currentCandle.high, candle.high);
      currentCandle.low = Math.min(currentCandle.low, candle.low);
      currentCandle.close = candle.close;
      currentCandle.volume = (currentCandle.volume || 0) + (candle.volume || 0);
    }
  });

  if (currentCandle) aggregated.push(currentCandle);
  return aggregated;
};