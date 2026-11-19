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
  ma: { period: 20 },
  bb: { period: 20, multiplier: 2 },
  rsi: { period: 14 },
  atr: { period: 14 },
  adx: { period: 14 },
};

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function calculateIndicators(candles, config, active) {
  const completed = candles.slice(0, -1);
  const result = {};
  const closes = completed.map(c => c.close);
  const period = (key) => Math.max(2, Math.min(500, Number(config[key]?.period) || DEFAULT_CONFIG[key]?.period || 14));

  if (active.ma) {
    const p = period('ma');
    result.ma = completed.map((c, i) => i + 1 < p ? { time: c.time } : ({ time: c.time, value: average(closes.slice(i - p + 1, i + 1)) }));
  }

  if (active.bb) {
    const p = period('bb');
    const multiplier = Math.max(0.1, Math.min(10, Number(config.bb.multiplier) || 2));
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
    result.bbUpper = upper; result.bbMiddle = middle; result.bbLower = lower;
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
        const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
        return { time: c.time, value: 100 - (100 / (1 + rs)) };
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
      let day = null, open = null;
      result['session_' + session.key] = completed.map(c => {
        const d = new Date((c.time + 3 * 3600) * 1000);
        const dateKey = d.toISOString().slice(0, 10), hour = d.getUTCHours();
        if (dateKey !== day) { day = dateKey; open = null; }
        if (hour >= session.start && hour < session.end) {
          if (open == null || (hour === session.start && d.getUTCMinutes() === 0)) open = c.open;
          return { time: c.time, value: open };
        }
        return { time: c.time };
      });
    });
  }
  return result;
}
export default function IndicatorsPanel({ chartRef, chartReady, visibleData }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState({});
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [editing, setEditing] = useState(null);
  const seriesRef = useRef({});
  const readyRef = useRef(false);

  const selected = useMemo(() => INDICATORS.filter(item => active[item.key]), [active]);

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
      if (item.key === 'ma') add('ma', item.color);
      if (item.key === 'bb') {
        add('bbUpper', '#a78bfa', 0, 1);
        add('bbMiddle', '#8b5cf6', 0, 1);
        add('bbLower', '#a78bfa', 0, 1);
      }
      if (item.key === 'vwap') add('vwap', item.color, 0, 1.5);
      if (item.key === 'sessions') {
        add('session_asia', '#f59e0b', 0, 1);
        add('session_london', '#38bdf8', 0, 1);
        add('session_newyork', '#a78bfa', 0, 1);
      }
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
    const calculated = calculateIndicators(visibleData, config, active);
    Object.entries(seriesRef.current).forEach(([key, series]) => {
      try { series.setData(calculated[key] || []); } catch (e) {}
    });
  }, [chartRef, visibleData, config, active, chartReady]);

  const toggle = (key) => setActive(current => ({ ...current, [key]: !current[key] }));
  const updateConfig = (key, field, value) => setConfig(current => ({
    ...current,
    [key]: { ...current[key], [field]: value },
  }));

  return (
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
          {selected.filter(item => DEFAULT_CONFIG[item.key]).length > 0 && (
            <div className="mt-2 border-t border-[#2a2e39] pt-2">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-gray-400"><Settings2 size={11}/> Parameters</div>
              {selected.filter(item => DEFAULT_CONFIG[item.key]).map(item => (
                <div key={item.key} className="mb-2 rounded bg-[#1e222d] p-2">
                  <div className="mb-1 text-[10px] font-semibold text-white">{item.label}</div>
                  <label className="flex items-center justify-between gap-2 text-[10px] text-gray-400">
                    Period
                    <input type="number" min="2" max="500" value={config[item.key]?.period || DEFAULT_CONFIG[item.key].period} onChange={event => updateConfig(item.key, 'period', Math.max(2, Math.min(500, Number(event.target.value) || 2)))} className="w-16 rounded border border-[#343b49] bg-[#0b0e11] px-2 py-1 text-right text-white"/>
                  </label>
                  {item.key === 'bb' && <label className="mt-1 flex items-center justify-between gap-2 text-[10px] text-gray-400">
                    Deviation
                    <input type="number" min="0.1" max="10" step="0.1" value={config.bb.multiplier} onChange={event => updateConfig('bb', 'multiplier', Math.max(0.1, Math.min(10, Number(event.target.value) || 2)))} className="w-16 rounded border border-[#343b49] bg-[#0b0e11] px-2 py-1 text-right text-white"/>
                  </label>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
