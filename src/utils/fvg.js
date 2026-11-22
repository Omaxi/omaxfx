// Fair Value Gap detection adapted from "Fair Value Gap [LuxAlgo]" by LuxAlgo.
// © LuxAlgo. Source license: CC BY-NC-SA 4.0
// https://creativecommons.org/licenses/by-nc-sa/4.0/
// This implementation follows the source's three-candle confirmation and
// close-based mitigation rules. Default threshold is 0%, matching LuxAlgo.

export const formatFvgTimeframe = (minutes) => {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 60) return `${value}m`;
  if (value === 1440) return '1D';
  if (value === 10080) return '1W';
  return value % 60 === 0 ? `${value / 60}h` : `${value}m`;
};

// LuxAlgo's default Threshold % is zero and Auto is disabled.
export const detectFairValueGaps = (candles, timeframe, thresholdPercent = 0) => {
  if (!Array.isArray(candles) || candles.length < 3) return [];
  const threshold = Math.max(0, Number(thresholdPercent) || 0) / 100;
  const gaps = [];

  for (let i = 2; i < candles.length; i++) {
    const first = candles[i - 2];
    const middle = candles[i - 1];
    const third = candles[i];
    const values = [first?.high, first?.low, middle?.close, third?.high, third?.low];
    if (!values.every(value => Number.isFinite(Number(value)))) continue;

    let direction = null;
    let top = 0;
    let bottom = 0;

    // Exact LuxAlgo confirmation: the middle candle must also close beyond
    // the first candle's boundary; a wick-only three-candle gap is not enough.
    if (
      Number(third.low) > Number(first.high) &&
      Number(middle.close) > Number(first.high) &&
      (Number(third.low) - Number(first.high)) / Number(first.high) > threshold
    ) {
      direction = 'bullish';
      top = Number(third.low);
      bottom = Number(first.high);
    } else if (
      Number(third.high) < Number(first.low) &&
      Number(middle.close) < Number(first.low) &&
      Number(third.high) !== 0 &&
      (Number(first.low) - Number(third.high)) / Number(third.high) > threshold
    ) {
      direction = 'bearish';
      top = Number(first.low);
      bottom = Number(third.high);
    }

    if (!direction || !(top > bottom)) continue;

    // LuxAlgo considers an FVG mitigated only after a candle CLOSES through
    // the far edge, not when a wick merely touches it.
    let mitigatedAt = null;
    for (let j = i + 1; j < candles.length; j++) {
      const close = Number(candles[j]?.close);
      if (!Number.isFinite(close)) continue;
      if (direction === 'bullish' && close < bottom) {
        mitigatedAt = Number(candles[j].time);
        break;
      }
      if (direction === 'bearish' && close > top) {
        mitigatedAt = Number(candles[j].time);
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

  return gaps;
};

// Keep only the most recently formed FVG for a timeframe. If that latest
// zone has already been mitigated, return no zone rather than reviving an older one.
export const latestFairValueGap = (gaps, cutoff = Infinity) => {
  if (!Array.isArray(gaps)) return null;
  const latest = [...gaps]
    .filter(zone => Number(zone.startTime) <= Number(cutoff))
    .sort((a, b) => Number(a.startTime) - Number(b.startTime)
      || String(a.id).localeCompare(String(b.id)))
    .at(-1);
  if (!latest || (latest.mitigatedAt != null && Number(latest.mitigatedAt) <= Number(cutoff))) return null;
  return latest;
};


// Return at most two zones: the newest still-active FVG and the newest
// FVG that has been mitigated by the replay cutoff. The latter is retained
// as an inverse FVG (iFVG) instead of disappearing from the chart.
export const latestFairValueGapPair = (gaps, cutoff = Infinity) => {
  if (!Array.isArray(gaps)) return [];
  const formed = gaps
    .filter(zone => Number(zone.startTime) <= Number(cutoff))
    .sort((a, b) => Number(a.startTime) - Number(b.startTime)
      || String(a.id).localeCompare(String(b.id)));

  let active = null;
  let mitigated = null;
  for (const zone of formed) {
    const mitigationTime = zone.mitigatedAt == null ? null : Number(zone.mitigatedAt);
    if (mitigationTime != null && Number.isFinite(mitigationTime) && mitigationTime <= Number(cutoff)) {
      mitigated = { ...zone, isIFVG: true };
    } else {
      active = { ...zone, isIFVG: false };
    }
  }

  return [active, mitigated].filter(Boolean);
};
