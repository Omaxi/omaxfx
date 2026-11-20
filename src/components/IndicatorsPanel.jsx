import { useEffect, useMemo, useRef, useState } from 'react';
import { LineSeries } from 'lightweight-charts';
import { ChevronDown, Settings2, X } from 'lucide-react';

const INDICATORS = [
  { key: 'ma', label: 'Moving Average', color: '#f59e0b', pane: 'price' },
  { key: 'bb', label: 'Bollinger Bands', color: '#a78bfa', pane: 'price' },
  { key: 'rsi', label: 'RSI', color: '#38bdf8', pane: 'lower' },
  { key: 'atr', label: 'ATR', color: '#fb923c', pane: 'lower' },
  { key: 'adx', label: 'ADX', color: '#c084fc', pane: 'lower' },
  { key: 'vwap', label: 'VWAP', color: '#22c55e', pane: 'price' },
  { key: 'sessions', label: 'Sessions', color: '#64748b', pane: 'price' },
];

const DEFAULT_CONFIG = {
  ma: { instances: [{ id: 'ema9', period: 9, method: 'EMA', color: '#f59e0b' }, { id: 'ema21', period: 21, method: 'EMA', color: '#38bdf8' }] },
  bb: { instances: [{ id: 'bb20', period: 20, multiplier: 2, color: '#a78bfa' }] },
  rsi: { period: 14 },
  atr: { period: 14 },
  adx: { period: 14 },
};

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function calculateIndicators(candles, config, active, timeframe, sessionCandles = candles) {
  // At 1-minute resolution the final replay candle is still forming. Higher
  // timeframes already omit their forming aggregate candle in Chart.jsx.
  const completed = timeframe === 1 ? candles.slice(0, -1) : candles;
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
    const sessionDefs = [
      { key: 'asia', start: 1, end: 10 },
      { key: 'london', start: 10, end: 15 },
      { key: 'newyork', start: 15, end: 23 },
    ];
    sessionDefs.forEach(session => {
      let day = null, sessionHigh = null, sessionLow = null;
      const highs = [], lows = [];
      sessionCandles.forEach(c => {
        const d = new Date((c.time + 3 * 3600) * 1000);
        const dateKey = d.toISOString().slice(0, 10), hour = d.getUTCHours();
        if (dateKey !== day) { day = dateKey; sessionHigh = null; sessionLow = null; }
        if (hour >= session.start && hour < session.end) {
          sessionHigh = sessionHigh == null ? c.high : Math.max(sessionHigh, c.high);
          sessionLow = sessionLow == null ? c.low : Math.min(sessionLow, c.low);
          highs.push({ time: c.time, value: sessionHigh });
          lows.push({ time: c.time, value: sessionLow });
        } else { highs.push({ time: c.time }); lows.push({ time: c.time }); }
      });
      result['session_' + session.key + '_high'] = highs;
      result['session_' + session.key + '_low'] = lows;
    });
  }
  return result;
}
export default function IndicatorsPanel({ chartRef, chartReady, visibleData, timeframe, priceSeriesRef, liveCandle }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState({});
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const seriesRef = useRef({});
  const readyRef = useRef(false);
  const sessionCanvasRef = useRef(null);

  const selected = useMemo(() => INDICATORS.filter(item => active[item.key]), [active]);
  const sessionCandles = useMemo(() => {
    const candles = [...(visibleData || [])];
    if (!liveCandle || !Number.isFinite(Number(liveCandle.time))) return candles;
    const interval = Math.max(1, Number(timeframe) || 1) * 60;
    const bucketTime = Math.floor(Number(liveCandle.time) / interval) * interval;
    const live = { ...liveCandle, time: bucketTime };
    const existing = candles.findIndex(candle => Number(candle.time) === bucketTime);
    if (existing >= 0) candles[existing] = { ...candles[existing], ...live };
    else candles.push(live);
    return candles.sort((a, b) => Number(a.time) - Number(b.time));
  }, [visibleData, liveCandle, timeframe]);

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
    const completed = timeframe === 1 ? visibleData.slice(0, -1) : visibleData;
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
          { key: 'asia', label: 'Sydney / Asia', start: 1, end: 10, color: '#f59e0b' },
          { key: 'london', label: 'London', start: 10, end: 15, color: '#38bdf8' },
          { key: 'newyork', label: 'New York', start: 15, end: 23, color: '#fb7185' },
        ];
        const groups = new Map();
        data.forEach((candle, candleIndex) => {
          const local = new Date((Number(candle.time) + 3 * 3600) * 1000);
          const day = local.toISOString().slice(0, 10);
          const hour = local.getUTCHours();
          defs.forEach(def => {
            if (hour < def.start || hour >= def.end) return;
            const id = day + ':' + def.key;
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
          ctx.strokeStyle = item.color + 'aa';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, right - left - 1), Math.max(2, boxHeight - 1));
          ctx.setLineDash([]);

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
  }, [active.sessions, chartRef, chartReady, sessionCandles, timeframe]);

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
          {selected.some(item => ['ma', 'bb', 'rsi', 'atr', 'adx'].includes(item.key)) && (
            <div className="mt-2 border-t border-[#2a2e39] pt-2">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-gray-400"><Settings2 size={11}/> Indicator instances</div>
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
