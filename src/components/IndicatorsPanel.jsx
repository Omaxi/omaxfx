import { useEffect, useMemo, useRef, useState } from 'react';
import { LineSeries } from 'lightweight-charts';
import { ChevronDown, Settings2, X } from 'lucide-react';
import { useStore } from '../store';
import { aggregateData } from '../utils/timeframe';
import { detectFairValueGaps, formatFvgTimeframe, latestFairValueGapPair } from '../utils/fvg';
import { getPricePrecision } from '../utils/instrument';
import { getMarketSession } from '../utils/marketClock';

const INDICATORS = [
  { key: 'ma', label: 'Moving Average', color: '#f59e0b', pane: 'price' },
  { key: 'bb', label: 'Bollinger Bands', color: '#a78bfa', pane: 'price' },
  { key: 'rsi', label: 'RSI', color: '#38bdf8', pane: 'lower' },
  { key: 'atr', label: 'ATR', color: '#fb923c', pane: 'lower' },
  { key: 'adx', label: 'ADX', color: '#c084fc', pane: 'lower' },
  { key: 'vwap', label: 'VWAP', color: '#22c55e', pane: 'price' },
  { key: 'sessions', label: 'Sessions', color: '#64748b', pane: 'price' },
  { key: 'fvg', label: 'Fair Value Gaps', color: '#38bdf8', pane: 'price' },
  { key: 'htfCandleViewer', label: 'HTF Candle Viewer', color: '#22c55e', pane: 'price' },
];

const DEFAULT_CONFIG = {
  ma: { instances: [{ id: 'ema9', period: 9, method: 'EMA', color: '#f59e0b' }, { id: 'ema21', period: 21, method: 'EMA', color: '#38bdf8' }] },
  bb: { instances: [{ id: 'bb20', period: 20, multiplier: 2, color: '#a78bfa' }] },
  rsi: { period: 14 },
  atr: { period: 14 },
  adx: { period: 14 },
  fvg: { showCurrent: true, showHigher: true, higherTimeframe: 15 },
  htfCandleViewer: { timeframe: 240 },
};

function IndicatorSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 112 });
  const selected = options.find(option => Number(option.value) === Number(value));

  useEffect(() => {
    if (!open) return undefined;
    const close = event => {
      if (event.type === 'keydown' && event.key === 'Escape') setOpen(false);
      if (event.type === 'pointerdown' && !buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const toggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ left: Math.max(8, rect.left), top: rect.bottom + 4, width: Math.max(112, rect.width) });
    }
    setOpen(current => !current);
  };

  return (
    <>
      <button ref={buttonRef} type="button" onClick={toggle} aria-haspopup="listbox" aria-expanded={open}
        className="flex h-8 min-w-[112px] items-center justify-between gap-2 rounded border border-[#2a2e39] bg-[#1e222d] px-3 text-xs font-bold text-white transition-colors hover:bg-[#2a2e39]">
        <span>{selected?.label ?? value}</span>
        <ChevronDown size={11} className={'text-gray-400 transition-transform ' + (open ? 'rotate-180' : '')}/>
      </button>
      {open && <>
        <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setOpen(false)}/>
        <div ref={menuRef} role="listbox" className="fixed min-w-[112px] overflow-hidden rounded-lg border border-[#2a2e39] bg-[#1e222d] shadow-2xl"
          style={{ zIndex: 9999, left: position.left, top: position.top, width: position.width }}>
          <div className="border-b border-[#2a2e39] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">Timeframe</div>
          {options.map(option => {
            const active = Number(option.value) === Number(value);
            return <button key={option.value} type="button" role="option" aria-selected={active}
              onClick={() => { onChange(option.value); setOpen(false); }}
              className={'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-white hover:bg-[#2a2e39] ' + (active ? 'bg-blue-600/15' : '')}>
              <span className={active ? 'font-bold' : ''}>{option.label}</span>
              {active && <span className="text-blue-400">✓</span>}
            </button>;
          })}
        </div>
      </>}
    </>
  );
}

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function calculateIndicators(candles, config, active, timeframe, sessionCandles = candles) {
  // The last displayed candle is developing at every chart timeframe.
  // Keep indicator calculations on completed candles for consistent behavior.
  const completed = candles.slice(0, -1);
  const result = {};
  const closes = completed.map(c => c.close);
  const period = (key) => Math.max(2, Math.min(500, Number(config[key]?.period) || DEFAULT_CONFIG[key]?.period || 14));

  if (active.ma) {
    const instances = config.ma?.instances?.length ? config.ma.instances : [{ id: 'ma', period: config.ma?.period || 20, method: config.ma?.method || 'SMA' }];
    instances.forEach((instance, index) => {
      const p = Math.max(2, Math.min(500, Number(instance.period) || 20));
      const key = 'ma_' + instance.id;
      if (instance.method === 'EMA') {
        const alpha = 2 / (p + 1);
        let ema = null;
        result[key] = completed.map((c, i) => {
          if (i + 1 < p) return { time: c.time };
          if (ema == null) ema = average(closes.slice(0, p));
          else ema = (closes[i] * alpha) + (ema * (1 - alpha));
          return { time: c.time, value: ema };
        });
      } else {
        result[key] = completed.map((c, i) => i + 1 < p ? { time: c.time } : ({ time: c.time, value: average(closes.slice(i - p + 1, i + 1)) }));
      }
    });
  }

  if (active.bb) {
    const instances = config.bb?.instances?.length ? config.bb.instances : [{ id: 'bb', period: config.bb?.period || 20, multiplier: config.bb?.multiplier || 2 }];
    instances.forEach(instance => {
      const p = Math.max(2, Math.min(500, Number(instance.period) || 20));
      const multiplier = Math.max(0.1, Math.min(10, Number(instance.multiplier) || 2));
      const upper = [], middle = [], lower = [];
      completed.forEach((c, i) => {
        if (i + 1 < p) { upper.push({ time: c.time }); middle.push({ time: c.time }); lower.push({ time: c.time }); return; }
        const window = closes.slice(i - p + 1, i + 1);
        const mean = average(window);
        const deviation = Math.sqrt(average(window.map(value => (value - mean) ** 2)));
        middle.push({ time: c.time, value: mean });
        upper.push({ time: c.time, value: mean + multiplier * deviation });
        lower.push({ time: c.time, value: mean - multiplier * deviation });
      });
      result['bb_' + instance.id + '_upper'] = upper;
      result['bb_' + instance.id + '_middle'] = middle;
      result['bb_' + instance.id + '_lower'] = lower;
    });
  }

  if (active.vwap) {
    let day = null, cumulativePV = 0, cumulativeVolume = 0;
    result.vwap = completed.map(c => {
      const key = new Date((c.time + 3 * 3600) * 1000).toISOString().slice(0, 10);
      if (key !== day) { day = key; cumulativePV = 0; cumulativeVolume = 0; }
      const volume = Number(c.volume) > 0 ? Number(c.volume) : 1;
      cumulativePV += ((c.high + c.low + c.close) / 3) * volume;
      cumulativeVolume += volume;
      return { time: c.time, value: cumulativePV / cumulativeVolume };
    });
  }

  if (active.rsi || active.atr || active.adx) {
    const pRSI = period('rsi'), pATR = period('atr'), pADX = period('adx');
    const tr = [], gains = [], losses = [], plusDM = [], minusDM = [];
    completed.forEach((c, i) => {
      const prev = completed[i - 1];
      const change = prev ? c.close - prev.close : 0;
      gains.push(Math.max(change, 0)); losses.push(Math.max(-change, 0));
      tr.push(prev ? Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)) : c.high - c.low);
      const up = prev ? c.high - prev.high : 0, down = prev ? prev.low - c.low : 0;
      plusDM.push(up > down && up > 0 ? up : 0);
      minusDM.push(down > up && down > 0 ? down : 0);
    });

    if (active.atr) {
      let smoothed = 0;
      result.atr = completed.map((c, i) => {
        if (i < pATR - 1) return { time: c.time };
        if (i === pATR - 1) smoothed = average(tr.slice(0, pATR));
        else smoothed = ((smoothed * (pATR - 1)) + tr[i]) / pATR;
        return { time: c.time, value: smoothed };
      });
    }

    if (active.rsi) {
      let avgGain = 0, avgLoss = 0;
      result.rsi = completed.map((c, i) => {
        if (i < pRSI) return { time: c.time };
        if (i === pRSI) { avgGain = average(gains.slice(1, pRSI + 1)); avgLoss = average(losses.slice(1, pRSI + 1)); }
        else { avgGain = ((avgGain * (pRSI - 1)) + gains[i]) / pRSI; avgLoss = ((avgLoss * (pRSI - 1)) + losses[i]) / pRSI; }
        const value = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - (100 / (1 + avgGain / avgLoss));
        return { time: c.time, value };
      });
    }

    if (active.adx) {
      let smoothTR = 0, smoothPlus = 0, smoothMinus = 0, adx = null;
      const dxValues = [];
      result.adx = completed.map((c, i) => {
        if (i < pADX) return { time: c.time };
        if (i === pADX) {
          smoothTR = tr.slice(1, pADX + 1).reduce((a, b) => a + b, 0);
          smoothPlus = plusDM.slice(1, pADX + 1).reduce((a, b) => a + b, 0);
          smoothMinus = minusDM.slice(1, pADX + 1).reduce((a, b) => a + b, 0);
        } else {
          smoothTR = smoothTR - smoothTR / pADX + tr[i];
          smoothPlus = smoothPlus - smoothPlus / pADX + plusDM[i];
          smoothMinus = smoothMinus - smoothMinus / pADX + minusDM[i];
        }
        const plusDI = smoothTR ? 100 * smoothPlus / smoothTR : 0;
        const minusDI = smoothTR ? 100 * smoothMinus / smoothTR : 0;
        const dx = (plusDI + minusDI) ? 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI) : 0;
        dxValues.push(dx);
        if (dxValues.length < pADX) return { time: c.time };
        if (adx == null) adx = average(dxValues.slice(-pADX));
        else adx = ((adx * (pADX - 1)) + dx) / pADX;
        return { time: c.time, value: adx };
      });
    }
  }

  if (active.sessions) {
    const sessionDefs = [{ key: 'asia' }, { key: 'london' }, { key: 'newyork' }];
    sessionDefs.forEach(session => {
      let sessionId = null, sessionHigh = null, sessionLow = null;
      const highs = [], lows = [];
      sessionCandles.forEach(c => {
        const info = getMarketSession(c.time);
        const nextId = info?.sessionDate + ':' + info?.key;
        if (!info || info.key !== session.key) {
          highs.push({ time: c.time }); lows.push({ time: c.time });
          return;
        }
        if (nextId !== sessionId) {
          sessionId = nextId; sessionHigh = null; sessionLow = null;
        }
        sessionHigh = sessionHigh == null ? c.high : Math.max(sessionHigh, c.high);
        sessionLow = sessionLow == null ? c.low : Math.min(sessionLow, c.low);
        highs.push({ time: c.time, value: sessionHigh });
        lows.push({ time: c.time, value: sessionLow });
      });
      result['session_' + session.key + '_high'] = highs;
      result['session_' + session.key + '_low'] = lows;
    });
  }
  return result;
}
export default function IndicatorsPanel({ onHtfDashboard, chartRef, chartReady, visibleData, displayData, timeframe, priceSeriesRef, liveCandle, rawData, currentIndex }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState({});
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const seriesRef = useRef({});
  const readyRef = useRef(false);
  const sessionCanvasRef = useRef(null);
  const fvgCanvasRef = useRef(null);
  const htfCandleCanvasRef = useRef(null);
  const sessionColors = useStore(state => state.sessionColors);

  const selected = useMemo(() => INDICATORS.filter(item => active[item.key]), [active]);
  const sessionCandles = useMemo(() => {
    const candles = [...(visibleData || [])];
    if (!liveCandle || !Number.isFinite(Number(liveCandle.time))) return candles;
    const interval = Math.max(1, Number(timeframe) || 1) * 60;
    const bucketTime = Math.floor(Number(liveCandle.time) / interval) * interval;
    // Chart.jsx already supplies the replay-aggregated developing candle.
    // Never overwrite its accumulated HTF high/low with the latest 1m OHLC.
    if (!candles.some(candle => Number(candle.time) === bucketTime)) {
      candles.push({ ...liveCandle, time: bucketTime });
      candles.sort((a, b) => Number(a.time) - Number(b.time));
    }
    return candles;
  }, [visibleData, liveCandle, timeframe]);

  const higherTimeframe = Number(config.fvg?.higherTimeframe) || 15;
  const htfViewerTimeframe = Number(config.htfCandleViewer?.timeframe) || 240;
  // Build the selected HTF candle strictly from replay-visible raw candles.
  // The last aggregate remains incomplete and therefore updates on every replay step.
  const htfViewerCandle = useMemo(() => {
    const current = rawData?.[currentIndex];
    if (!current) return null;
    const bucket = Math.floor(Number(current.time) / (htfViewerTimeframe * 60)) * htfViewerTimeframe * 60;
    let first = currentIndex;
    while (first > 0 && Number(rawData[first - 1].time) >= bucket) first--;
    const candles = aggregateData(rawData.slice(first, currentIndex + 1), htfViewerTimeframe);
    return candles[0] || null;
  }, [rawData, currentIndex, htfViewerTimeframe]);
  const htfLevelOrigins = useMemo(() => {
    const current = rawData?.[currentIndex];
    if (!current) return null;
    const bucketStart = Math.floor(Number(current.time) / (htfViewerTimeframe * 60)) * htfViewerTimeframe * 60;
    let firstIndex = currentIndex;
    while (firstIndex > 0 && Number(rawData[firstIndex - 1].time) >= bucketStart) firstIndex--;
    let highIndex = firstIndex;
    let lowIndex = firstIndex;
    for (let index = firstIndex + 1; index <= currentIndex; index++) {
      if (Number(rawData[index].high) > Number(rawData[highIndex].high)) highIndex = index;
      if (Number(rawData[index].low) < Number(rawData[lowIndex].low)) lowIndex = index;
    }
    return { openIndex: firstIndex, highIndex, lowIndex, closeIndex: currentIndex };
  }, [rawData, currentIndex, htfViewerTimeframe]);
  useEffect(() => {
    if (!active.htfCandleViewer || !htfViewerCandle || !rawData?.[currentIndex]) {
      onHtfDashboard?.(null);
      return;
    }
    const nextBoundary = Number(htfViewerCandle.time) + htfViewerTimeframe * 60;
    const replayBoundary = Number(rawData[currentIndex].time) + 60;
    const remaining = Math.max(0, nextBoundary - replayBoundary);
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = Math.floor(remaining % 60);
    const countdown = hours > 0
      ? hours + 'h ' + String(minutes).padStart(2, '0') + 'm ' + String(seconds).padStart(2, '0') + 's'
      : minutes + 'm ' + String(seconds).padStart(2, '0') + 's';
    const precision = getPricePrecision(useStore.getState().symbol, useStore.getState().contractSpecs);
    const label = htfViewerTimeframe === 5 ? '5M' : htfViewerTimeframe === 15 ? '15M' : htfViewerTimeframe === 60 ? '1H' : '4H';
    onHtfDashboard?.({
      label,
      timeframe: label,
      range: (Number(htfViewerCandle.high) - Number(htfViewerCandle.low)).toFixed(precision),
      countdown,
    });
  }, [active.htfCandleViewer, htfViewerCandle, htfViewerTimeframe, rawData, currentIndex, onHtfDashboard]);

  const replayCutoff = rawData?.[currentIndex]
    ? Number(rawData[currentIndex].time) + 60
    : 0;

  // Precompute complete history only when the dataset or timeframe changes.
  // The replay cursor then reveals only zones that have actually formed, and
  // does not recalculate the entire history on every replay step.
  const currentFvgHistory = useMemo(
    () => detectFairValueGaps(displayData || [], timeframe),
    [displayData, timeframe]
  );
  const higherFvgHistory = useMemo(
    () => detectFairValueGaps(aggregateData(rawData || [], higherTimeframe), higherTimeframe),
    [rawData, higherTimeframe]
  );
  // Keep the newest active FVG and the newest mitigated FVG (iFVG)
  // independently for each source timeframe.
  const currentFvgZones = useMemo(() => {
    const completed = currentFvgHistory.filter(zone =>
      zone.startTime + Number(timeframe) * 60 <= replayCutoff
    );
    return latestFairValueGapPair(completed, replayCutoff);
  }, [currentFvgHistory, replayCutoff, timeframe]);
  const higherFvgZones = useMemo(() => {
    const completed = higherFvgHistory.filter(zone =>
      zone.startTime + higherTimeframe * 60 <= replayCutoff
    );
    return latestFairValueGapPair(completed, replayCutoff);
  }, [higherFvgHistory, replayCutoff, higherTimeframe]);

  useEffect(() => {
    const chart = chartReady ? chartRef.current : null;
    if (!chart) return undefined;
    const series = {};
    let lowerPane = 1;
    const add = (key, color, paneIndex = 0, lineWidth = 1.5, lineStyle = 0) => {
      series[key] = chart.addSeries(LineSeries, {
        color, lineWidth, lineStyle, priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false, title: key.toUpperCase(),
      }, paneIndex);
      if (paneIndex > 0) {
        try { chart.panes()[paneIndex].setHeight(88); } catch (e) {}
      }
    };

    selected.forEach(item => {
      if (item.key === 'ma') {
        (config.ma.instances || []).forEach(instance => add('ma_' + instance.id, instance.color || item.color, 0, 1.7));
      }
      if (item.key === 'bb') {
        (config.bb.instances || []).forEach(instance => {
          add('bb_' + instance.id + '_upper', instance.color || '#a78bfa', 0, 1);
          add('bb_' + instance.id + '_middle', instance.color || '#8b5cf6', 0, 1);
          add('bb_' + instance.id + '_lower', instance.color || '#a78bfa', 0, 1);
        });
      }
      if (item.key === 'vwap') add('vwap', item.color, 0, 1.5);
      if (item.key === 'rsi') add('rsi', item.color, lowerPane++);
      if (item.key === 'atr') add('atr', item.color, lowerPane++);
      if (item.key === 'adx') add('adx', item.color, lowerPane++);
    });
    seriesRef.current = series;
    readyRef.current = true;
    return () => {
      readyRef.current = false;
      Object.values(series).forEach(item => {
        try { chart.removeSeries(item); } catch (e) {}
      });
      seriesRef.current = {};
    };
  }, [chartRef, chartReady, selected, config]);

  useEffect(() => {
    if (!readyRef.current) return;
    const chart = chartRef.current;
    const completed = visibleData.slice(0, -1);
    if (!chart || completed.length < 2) {
      Object.values(seriesRef.current).forEach(series => { try { series.setData([]); } catch (e) {} });
      return;
    }
    const calculated = calculateIndicators(visibleData, config, active, timeframe, sessionCandles);
    Object.entries(seriesRef.current).forEach(([key, series]) => {
      try { series.setData(calculated[key] || []); } catch (e) {}
    });
  }, [chartRef, visibleData, sessionCandles, config, active, chartReady, timeframe]);

  // LuxAlgo-inspired session boxes: translucent range rectangles with dashed
  // borders and session labels. Times use the simulator's fixed UTC+3 clock.
  useEffect(() => {
    const canvas = sessionCanvasRef.current;
    const chart = chartReady ? chartRef.current : null;
    const priceSeries = priceSeriesRef?.current;
    if (!canvas || !chart) return undefined;
    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        if (!active.sessions || !priceSeries) return;

        const data = sessionCandles;
        if (!data?.length) return;
        const defs = [
          { key: 'asia', label: 'Asian', color: sessionColors?.asia || '#f59e0b' },
          { key: 'london', label: 'London', color: sessionColors?.london || '#38bdf8' },
          { key: 'newyork', label: 'New York', color: sessionColors?.newyork || '#fb7185' },
        ];
        const defsByKey = Object.fromEntries(defs.map(def => [def.key, def]));
        const groups = new Map();
        data.forEach(candle => {
          const session = getMarketSession(Number(candle.time));
          const def = session && defsByKey[session.key];
          if (def) {
            const id = session.sessionDate + ':' + def.key;
            let item = groups.get(id);
            if (!item) {
              item = { ...def, startTime: Number(candle.time), endTime: Number(candle.time), high: Number(candle.high), low: Number(candle.low) };
              groups.set(id, item);
            } else {
              item.endTime = Number(candle.time);
              item.high = Math.max(item.high, Number(candle.high));
              item.low = Math.min(item.low, Number(candle.low));
            }
          });
        });

        let paneWidth = rect.width, paneHeight = rect.height;
        try {
          const axisWidth = chart.priceScale('right').width();
          const timeAxisHeight = chart.timeScale().height();
          if (axisWidth > 0) paneWidth -= axisWidth;
          if (timeAxisHeight > 0) paneHeight -= timeAxisHeight;
        } catch {}
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, paneWidth, paneHeight);
        ctx.clip();
        groups.forEach(item => {
          // Anchor the session range to candle times to keep it aligned with
          // the actual chart data after replay jumps and timeframe changes.
          const timeScale = chart.timeScale();
          const barSpacing = Math.max(1, Number(timeScale.options().barSpacing) || 6);
          const firstX = timeScale.timeToCoordinate(item.startTime);
          const lastX = timeScale.timeToCoordinate(item.endTime);
          const x1 = firstX == null ? null : firstX - barSpacing / 2;
          const x2 = lastX == null ? null : lastX + barSpacing / 2;
          const y1 = priceSeries.priceToCoordinate(item.high);
          const y2 = priceSeries.priceToCoordinate(item.low);
          if ([x1, x2, y1, y2].some(value => value == null || !Number.isFinite(value))) return;
          const left = Math.max(0, Math.min(x1, x2));
          const right = Math.min(paneWidth, Math.max(x1, x2));
          const top = Math.max(0, Math.min(y1, y2));
          const bottom = Math.min(paneHeight, Math.max(y1, y2));
          if (right <= left || bottom <= top) return;
          const boxHeight = Math.max(3, bottom - top);
          ctx.fillStyle = item.color + '18';
          ctx.fillRect(left, top, right - left, boxHeight);
          ctx.font = '600 10px Arial';
          ctx.textAlign = 'center';
          ctx.fillStyle = item.color;
          ctx.fillText(item.label, Math.max(36, Math.min(paneWidth - 36, (left + right) / 2)), Math.max(11, top - 5));
        });
        ctx.restore();
      });
    };
    draw();
    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(draw);
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      timeScale.unsubscribeVisibleLogicalRangeChange(draw);
      observer.disconnect();
    };
  }, [active.sessions, chartRef, chartReady, sessionCandles, timeframe, sessionColors]);

  // Include the developing HTF candle's full range in the chart autoscale.
  // The transparent one-point series contributes only the requested price range.
  useEffect(() => {
    const chart = chartReady ? chartRef.current : null;
    if (!chart || !active.htfCandleViewer || !htfViewerCandle || !visibleData?.length) return undefined;
    const low = Number(htfViewerCandle.low);
    const high = Number(htfViewerCandle.high);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return undefined;
    let scaleSeries;
    try {
      scaleSeries = chart.addSeries(LineSeries, {
        color: 'rgba(0,0,0,0)', lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: low, maxValue: high } }),
      }, 0);
      scaleSeries.setData([{ time: visibleData[visibleData.length - 1].time, value: htfViewerCandle.close }]);
    } catch (error) {
      if (scaleSeries) { try { chart.removeSeries(scaleSeries); } catch {} }
      return undefined;
    }
    return () => { try { chart.removeSeries(scaleSeries); } catch {} };
  }, [active.htfCandleViewer, htfViewerCandle, visibleData, chartRef, chartReady]);

  // Draw the live-forming higher-timeframe candle in the chart's right-side space.
  useEffect(() => {
    const canvas = htfCandleCanvasRef.current;
    const chart = chartReady ? chartRef.current : null;
    const priceSeries = priceSeriesRef?.current;
    if (!canvas || !chart || !priceSeries) return undefined;
    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        if (!active.htfCandleViewer || !htfViewerCandle || !visibleData?.length) return;

        let paneWidth = rect.width, paneHeight = rect.height;
        try {
          const axisWidth = chart.priceScale('right').width();
          const timeAxisHeight = chart.timeScale().height();
          if (axisWidth > 0) paneWidth -= axisWidth;
          if (timeAxisHeight > 0) paneHeight -= timeAxisHeight;
        } catch {}
        const timeScale = chart.timeScale();
        const last = visibleData[visibleData.length - 1];
        const lastX = timeScale.timeToCoordinate(last.time);
        if (lastX == null || !Number.isFinite(lastX)) return;
        const spacing = Math.max(3, Number(timeScale.options().barSpacing) || 6);
        // Keep a constant gap from the latest lower-timeframe candle. The chart
        // already reserves rightOffset space, so panning moves both together
        // without pinning the HTF drawing over historical candles.
        const candleX = lastX + spacing * 10;
        if (candleX < 12 || candleX > paneWidth - 18) return;
        const yHigh = priceSeries.priceToCoordinate(htfViewerCandle.high);
        const yLow = priceSeries.priceToCoordinate(htfViewerCandle.low);
        const yOpen = priceSeries.priceToCoordinate(htfViewerCandle.open);
        const yClose = priceSeries.priceToCoordinate(htfViewerCandle.close);
        if ([yHigh, yLow, yOpen, yClose].some(value => value == null || !Number.isFinite(value))) return;

        const bullish = Number(htfViewerCandle.close) >= Number(htfViewerCandle.open);
        const color = bullish ? '#26a69a' : '#ef4444';
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));
        const bodyWidth = 18;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, paneWidth, paneHeight);
        ctx.clip();

        // Dashed OHLC guides run from the latest lower-timeframe candle to
        // the corresponding level on the developing HTF candle.
        const guideEndX = candleX - bodyWidth / 2 - 2;
        const precision = getPricePrecision(useStore.getState().symbol, useStore.getState().contractSpecs);
        const fmt = value => Number(value).toFixed(precision);
        // Resolve each 1-minute source event to the actual displayed candle
        // that contains it. This keeps the guide attached to the visible wick
        // when the chart is switched to 5m/15m/1h rather than using an
        // off-grid 1-minute timestamp on the higher-timeframe chart.
        const chartInterval = Math.max(1, Number(timeframe) || 1) * 60;
        const originX = index => {
          const sourceTime = rawData?.[htfLevelOrigins?.[index]]?.time;
          if (sourceTime == null) return null;
          const sourceBucket = Math.floor(Number(sourceTime) / chartInterval) * chartInterval;
          const sourceBar = visibleData.find(bar => Number(bar.time) === sourceBucket)
            || visibleData.find(bar => Number(bar.time) <= Number(sourceTime)
              && Number(sourceTime) < Number(bar.time) + chartInterval);
          if (!sourceBar) return null;
          const x = timeScale.timeToCoordinate(sourceBar.time);
          return x == null || !Number.isFinite(x) ? null : x + spacing / 2;
        };
        const levels = [
          { value: Number(htfViewerCandle.high), y: yHigh, x: originX('highIndex'), color: '#94a3b8', label: 'H' },
          { value: Number(htfViewerCandle.open), y: yOpen, x: originX('openIndex'), color: '#f59e0b', label: 'O' },
          { value: Number(htfViewerCandle.close), y: yClose, x: originX('closeIndex'), color, label: 'C' },
          { value: Number(htfViewerCandle.low), y: yLow, x: originX('lowIndex'), color: '#94a3b8', label: 'L' },
        ];
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        levels.forEach(level => {
          // Start exactly at the source candle's right wick/body edge and
          // finish at the HTF candle's left body edge. Do not draw a detached
          // stub if the originating candle is outside the visible viewport.
          if (level.x == null || level.x >= guideEndX) return;
          ctx.strokeStyle = level.color;
          ctx.globalAlpha = 0.82;
          ctx.beginPath();
          ctx.moveTo(level.x, level.y);
          ctx.lineTo(guideEndX, level.y);
          ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(candleX, yHigh);
        ctx.lineTo(candleX, yLow);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillRect(candleX - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);

        const labelX = candleX + 16;
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        levels.forEach(level => {
          ctx.fillStyle = level.color;
          ctx.fillText(fmt(level.value), labelX + 7, level.y);
        });

        // Dashboard details are rendered in the unified HTML Live Information card.
        ctx.restore();
      });
    };
    draw();
    const timeScale = chart.timeScale();
    const priceScale = chart.priceScale('right');
    timeScale.subscribeVisibleLogicalRangeChange(draw);
    priceScale.subscribeVisiblePriceRangeChange?.(draw);
    chart.subscribeSizeChange?.(draw);
    // lightweight-charts v5 does not expose a stable axis-drag callback across
    // all interactions; pointer/wheel redraws keep the overlay in sync while
    // traders scale the price axis or zoom the chart.
    window.addEventListener('pointermove', draw, { passive: true });
    window.addEventListener('wheel', draw, { passive: true });
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      timeScale.unsubscribeVisibleLogicalRangeChange(draw);
      priceScale.unsubscribeVisiblePriceRangeChange?.(draw);
      chart.unsubscribeSizeChange?.(draw);
      window.removeEventListener('pointermove', draw);
      window.removeEventListener('wheel', draw);
      observer.disconnect();
    };
  }, [active.htfCandleViewer, htfViewerCandle, htfViewerTimeframe, htfLevelOrigins, rawData, currentIndex, visibleData, timeframe, chartRef, chartReady, priceSeriesRef]);

  // Draw chart-timeframe and configured higher-timeframe FVGs on a dedicated
  // canvas so both remain anchored to market timestamps after timeframe changes.
  useEffect(() => {
    const canvas = fvgCanvasRef.current;
    const chart = chartReady ? chartRef.current : null;
    const priceSeries = priceSeriesRef?.current;
    if (!canvas || !chart || !priceSeries) return undefined;
    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        if (!active.fvg) return;

        let paneWidth = rect.width, paneHeight = rect.height;
        try {
          const axisWidth = chart.priceScale('right').width();
          const timeAxisHeight = chart.timeScale().height();
          if (axisWidth > 0) paneWidth -= axisWidth;
          if (timeAxisHeight > 0) paneHeight -= timeAxisHeight;
        } catch {}
        const data = visibleData || [];
        if (data.length < 2) return;
        const timeScale = chart.timeScale();
        const timeToX = (time) => {
          let lo = 0, hi = data.length - 1;
          if (time <= Number(data[0].time)) hi = 1;
          else if (time >= Number(data[hi].time)) lo = hi - 1;
          else {
            while (hi - lo > 1) {
              const mid = Math.floor((lo + hi) / 2);
              if (Number(data[mid].time) < time) lo = mid;
              else hi = mid;
            }
          }
          const t1 = Number(data[lo].time), t2 = Number(data[hi].time);
          const x1 = timeScale.timeToCoordinate(t1), x2 = timeScale.timeToCoordinate(t2);
          if ([x1, x2].some(value => value == null || !Number.isFinite(value)) || t2 === t1) return null;
          return x1 + (x2 - x1) * ((Number(time) - t1) / (t2 - t1));
        };
        const zones = [
          ...(config.fvg?.showHigher && Number(config.fvg?.higherTimeframe) !== Number(timeframe) ? higherFvgZones.map(zone => ({ ...zone, source: 'higher' })) : []),
          ...(config.fvg?.showCurrent ? currentFvgZones.map(zone => ({ ...zone, source: 'current' })) : []),
        ];
        let visibleFrom = -Infinity, visibleTo = Infinity;
        try {
          const range = timeScale.getVisibleRange();
          if (typeof range?.from === 'number') visibleFrom = range.from;
          if (typeof range?.to === 'number') visibleTo = range.to;
        } catch {}
        const visibleZones = zones.filter(zone =>
          zone.startTime <= visibleTo && (zone.mitigatedAt == null || zone.mitigatedAt >= visibleFrom)
        );
        if (!visibleZones.length) return;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, paneWidth, paneHeight);
        ctx.clip();
        visibleZones.forEach(zone => {
          const startX = timeToX(zone.startTime);
          const endX = zone.mitigatedAt == null ? paneWidth : timeToX(zone.mitigatedAt);
          const topY = priceSeries.priceToCoordinate(zone.top);
          const bottomY = priceSeries.priceToCoordinate(zone.bottom);
          if ([startX, endX, topY, bottomY].some(value => value == null || !Number.isFinite(value))) return;
          const left = Math.max(0, Math.min(startX, endX));
          const right = Math.min(paneWidth, Math.max(startX, endX));
          const top = Math.min(topY, bottomY);
          const bottom = Math.max(topY, bottomY);
          if (right - left < 2 || bottom < 0 || top > paneHeight) return;
          // Active zones retain source colors: higher TF green, chart TF red.
          // Once mitigated, the zone becomes a neutral grey iFVG.
          const isIFVG = zone.isIFVG === true;
          const color = isIFVG ? '148,163,184' : (zone.source === 'higher' ? '34,197,94' : '239,68,68');
          const alpha = isIFVG ? 0.16 : (zone.source === 'higher' ? 0.20 : 0.18);
          ctx.fillStyle = 'rgba(' + color + ',' + alpha + ')';
          ctx.fillRect(left, top, right - left, Math.max(2, bottom - top));
          // Borderless FVG fill; keep the timeframe label as plain text.
          const label = formatFvgTimeframe(zone.timeframe) + (isIFVG ? ' iFVG' : ' FVG');
          ctx.font = '600 9px Arial';
          const labelX = Math.max(left + 4, Math.min(right - ctx.measureText(label).width - 4, left + 5));
          const labelY = Math.max(10, Math.min(paneHeight - 5, top + 11));
          ctx.fillStyle = isIFVG ? '#cbd5e1' : (zone.source === 'higher' ? '#4ade80' : '#f87171');
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, labelX, labelY);
        });
        ctx.restore();
      });
    };
    draw();
    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(draw);
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      timeScale.unsubscribeVisibleLogicalRangeChange(draw);
      observer.disconnect();
    };
  }, [active.fvg, config.fvg, currentFvgZones, higherFvgZones, visibleData, timeframe, chartRef, chartReady, priceSeriesRef]);

  const toggle = (key) => setActive(current => ({ ...current, [key]: !current[key] }));
  const updateConfig = (key, field, value) => setConfig(current => ({
    ...current,
    [key]: { ...current[key], [field]: value },
  }));
  const addInstance = (key) => setConfig(current => {
    const instances = current[key].instances || [];
    const id = key + '_' + Date.now().toString(36);
    return { ...current, [key]: { ...current[key], instances: [...instances, key === 'ma'
      ? { id, period: 50, method: 'EMA', color: '#22c55e' }
      : { id, period: 20, multiplier: 2.5, color: '#c084fc' }] } };
  });
  const updateInstance = (key, id, field, value) => setConfig(current => ({
    ...current, [key]: { ...current[key], instances: current[key].instances.map(instance =>
      instance.id === id ? { ...instance, [field]: value } : instance) },
  }));
  const removeInstance = (key, id) => setConfig(current => ({
    ...current, [key]: { ...current[key], instances: current[key].instances.filter(instance => instance.id !== id) },
  }));

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <canvas ref={fvgCanvasRef} className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true"/>
      <canvas ref={htfCandleCanvasRef} className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true"/>
      <canvas ref={sessionCanvasRef} className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true"/>
      <div className="absolute top-2 left-12 z-40 pointer-events-auto" onPointerDown={event => event.stopPropagation()}>
      <button onClick={() => setOpen(value => !value)} className="flex items-center gap-1 rounded-md border border-[#2a2e39] bg-[#131722]/95 px-2 py-1 text-[10px] font-bold text-gray-200 shadow-lg hover:bg-[#1e222d]">
        Indicators <ChevronDown size={11} className={open ? 'rotate-180' : ''}/>
        {selected.length > 0 && <span className="rounded bg-blue-600 px-1 text-white">{selected.length}</span>}
      </button>
      {open && (
        <div className="mt-1 w-64 rounded-lg border border-[#2a2e39] bg-[#131722]/98 p-2 shadow-2xl">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Chart indicators</span>
            <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-500 hover:text-white"><X size={12}/></button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {INDICATORS.map(item => (
              <button key={item.key} onClick={() => toggle(item.key)} className={`rounded border px-2 py-1.5 text-left text-[10px] ${active[item.key] ? 'border-blue-500 bg-blue-600/20 text-white' : 'border-[#2a2e39] bg-[#1e222d] text-gray-400 hover:text-white'}`}>
                {active[item.key] ? '✓ ' : '+ '}{item.label}
              </button>
            ))}
          </div>
          {selected.some(item => ['ma', 'bb', 'rsi', 'atr', 'adx', 'fvg', 'htfCandleViewer'].includes(item.key)) && (
            <div className="mt-2 border-t border-[#2a2e39] pt-2">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-gray-400"><Settings2 size={11}/> Indicator instances</div>
              {selected.some(item => item.key === 'htfCandleViewer') && <div className="mb-2 rounded bg-[#1e222d] p-2">
                <div className="mb-2 text-[10px] font-semibold text-white">HTF Candle Viewer</div>
                <label className="flex items-center justify-between gap-2 text-[10px] text-gray-300">
                  Higher timeframe candle
                  <IndicatorSelect value={config.htfCandleViewer.timeframe} onChange={value => updateConfig('htfCandleViewer', 'timeframe', Number(value))} options={[{ value: 5, label: '5m' }, { value: 15, label: '15m' }, { value: 60, label: '1h' }, { value: 240, label: '4h' }]}/>
                </label>
                <p className="mt-2 text-[9px] leading-4 text-gray-500">The candle is built only from candles reached by the replay cursor. Its OHLC, body, and wicks update live with each replay step.</p>
              </div>}
              {selected.some(item => item.key === 'fvg') && <div className="mb-2 rounded bg-[#1e222d] p-2">
                <div className="mb-2 text-[10px] font-semibold text-white">Fair Value Gaps</div>
                <label className="mb-1 flex items-center gap-2 text-[10px] text-gray-300">
                  <input type="checkbox" checked={config.fvg.showCurrent} onChange={event => updateConfig('fvg', 'showCurrent', event.target.checked)} className="accent-blue-500"/>
                  Current chart timeframe ({formatFvgTimeframe(timeframe)})
                </label>
                <label className="mb-1 flex items-center gap-2 text-[10px] text-gray-300">
                  <input type="checkbox" checked={config.fvg.showHigher} onChange={event => updateConfig('fvg', 'showHigher', event.target.checked)} className="accent-blue-500"/>
                  Higher timeframe FVG
                </label>
                <label className="flex items-center justify-between gap-2 text-[10px] text-gray-300">
                  Higher timeframe
                  <IndicatorSelect value={config.fvg.higherTimeframe} onChange={value => updateConfig('fvg', 'higherTimeframe', Number(value))} options={[{ value: 5, label: '5m' }, { value: 15, label: '15m' }, { value: 30, label: '30m' }, { value: 60, label: '1h' }, { value: 240, label: '4h' }, { value: 1440, label: '1D' }, { value: 10080, label: '1W' }]}/>
                </label>
                <p className="mt-2 text-[9px] leading-4 text-gray-500">Only the latest unmitigated FVG is shown per timeframe. A newly formed gap replaces the previous one. Higher-timeframe zones remain anchored to their original market times when you switch chart timeframes.</p>
              </div>}
              {selected.some(item => item.key === 'ma') && <div className="mb-2 rounded bg-[#1e222d] p-2">
                <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-white">Moving averages <button onClick={() => addInstance('ma')} className="text-blue-400">+ Add</button></div>
                {(config.ma.instances || []).map(instance => <div key={instance.id} className="mb-1 flex items-center gap-1">
                  <input aria-label="MA period" type="number" min="2" max="500" value={instance.period} onChange={e => updateInstance('ma', instance.id, 'period', Math.max(2, Math.min(500, Number(e.target.value) || 2)))} className="w-14 rounded bg-[#0b0e11] px-1.5 py-1 text-[10px] text-white"/>
                  <select value={instance.method} onChange={e => updateInstance('ma', instance.id, 'method', e.target.value)} className="flex-1 rounded bg-[#0b0e11] px-1.5 py-1 text-[10px] text-white"><option>EMA</option><option>SMA</option></select>
                  <input aria-label="MA color" type="color" value={instance.color} onChange={e => updateInstance('ma', instance.id, 'color', e.target.value)} className="h-6 w-7 bg-transparent"/>
                  <button onClick={() => removeInstance('ma', instance.id)} className="px-1 text-red-400">×</button>
                </div>)}
              </div>}
              {selected.some(item => item.key === 'bb') && <div className="rounded bg-[#1e222d] p-2">
                <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-white">Bollinger bands <button onClick={() => addInstance('bb')} className="text-blue-400">+ Add</button></div>
                {(config.bb.instances || []).map(instance => <div key={instance.id} className="mb-1 flex items-center gap-1">
                  <input aria-label="BB period" type="number" min="2" max="500" value={instance.period} onChange={e => updateInstance('bb', instance.id, 'period', Math.max(2, Math.min(500, Number(e.target.value) || 2)))} className="w-14 rounded bg-[#0b0e11] px-1.5 py-1 text-[10px] text-white"/>
                  <input aria-label="BB deviation" type="number" min="0.1" max="10" step="0.1" value={instance.multiplier} onChange={e => updateInstance('bb', instance.id, 'multiplier', Math.max(0.1, Math.min(10, Number(e.target.value) || 2)))} className="w-14 rounded bg-[#0b0e11] px-1.5 py-1 text-[10px] text-white"/>
                  <input aria-label="BB color" type="color" value={instance.color} onChange={e => updateInstance('bb', instance.id, 'color', e.target.value)} className="h-6 w-7 bg-transparent"/>
                  <button onClick={() => removeInstance('bb', instance.id)} className="px-1 text-red-400">×</button>
                </div>)}
              </div>}
              {selected.filter(item => ['rsi', 'atr', 'adx'].includes(item.key)).map(item => (
                <label key={item.key} className="mt-2 flex items-center justify-between rounded bg-[#1e222d] px-2 py-1.5 text-[10px] text-gray-300">
                  {item.label} period
                  <input type="number" min="2" max="500" value={config[item.key]?.period || DEFAULT_CONFIG[item.key].period}
                    onChange={event => updateConfig(item.key, 'period', Math.max(2, Math.min(500, Number(event.target.value) || 2)))}
                    className="w-16 rounded border border-[#343b49] bg-[#0b0e11] px-2 py-1 text-right text-white"/>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
