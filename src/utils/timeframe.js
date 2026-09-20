export const aggregateData = (data, timeframeMinutes) => {
  if (timeframeMinutes === 1 || data.length === 0) return data;

  const firstTime = data[0].time;
  const aggregated = [];
  let currentCandle = null;
  const timeframeSeconds = timeframeMinutes * 60;

  data.forEach((candle) => {
    const offset = candle.time - firstTime;
    const blockOffset = Math.floor(offset / timeframeSeconds) * timeframeSeconds;
    const blockTime = firstTime + blockOffset;

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