export const formatFvgTimeframe = (minutes) => {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 60) return `${value}m`;
  if (value === 1440) return '1D';
  if (value === 10080) return '1W';
  return value % 60 === 0 ? `${value / 60}h` : `${value}m`;
};

// Three-candle Fair Value Gap detection. A gap remains extended to the right
// until price trades through its far boundary (full mitigation).
export const detectFairValueGaps = (candles, timeframe) => {
  if (!Array.isArray(candles) || candles.length < 3) return [];
  const gaps = [];

  for (let i = 2; i < candles.length; i++) {
    const first = candles[i - 2];
    const third = candles[i];
    if (![first?.high, first?.low, third?.high, third?.low].every(Number.isFinite)) continue;

    let direction = null;
    let top = 0;
    let bottom = 0;
    if (third.low > first.high) {
      direction = 'bullish';
      top = third.low;
      bottom = first.high;
    } else if (third.high < first.low) {
      direction = 'bearish';
      top = first.low;
      bottom = third.high;
    }
    if (!direction || !(top > bottom)) continue;

    let mitigatedAt = null;
    for (let j = i + 1; j < candles.length; j++) {
      const candle = candles[j];
      if (direction === 'bullish' && Number(candle.low) <= bottom) {
        mitigatedAt = Number(candle.time);
        break;
      }
      if (direction === 'bearish' && Number(candle.high) >= top) {
        mitigatedAt = Number(candle.time);
        break;
      }
    }

    gaps.push({
      id: `${timeframe}:${Number(third.time)}:${direction}`,
      direction,
      top,
      bottom,
      startTime: Number(third.time),
      mitigatedAt,
      timeframe: Number(timeframe),
    });
  }

  return gaps.slice(-250);
};
