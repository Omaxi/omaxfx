import { useEffect, useMemo, useRef } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { useStore } from '../store';
import { aggregateData, getTimeframeBucketStart } from '../utils/timeframe';
import { getPricePrecision, getPriceTickSize } from '../utils/instrument';
import { formatMarketDateTime, formatMarketTick } from '../utils/marketClock';

const OPTIONS = [
  { value: 1, label: '1m' }, { value: 5, label: '5m' }, { value: 15, label: '15m' },
  { value: 30, label: '30m' }, { value: 60, label: '1H' }, { value: 240, label: '4H' },
  { value: 1440, label: '1D' }, { value: 10080, label: '1W' },
];

export default function MiniChart({ timeframe, onTimeframeChange }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const lastTimeframeRef = useRef(null);
  const rawData = useStore(state => state.rawData);
  const currentIndex = useStore(state => state.currentIndex);
  const displayData = useStore(state => state.displayData);
  const symbol = useStore(state => state.symbol);
  const theme = useStore(state => state.theme);
  const candles = useMemo(() => {
    if (!rawData[currentIndex]) return [];
    if (Number(timeframe) <= 1) return rawData.slice(0, currentIndex + 1);
    const bucket = getTimeframeBucketStart(rawData[currentIndex].time, timeframe);
    let lo = 0, hi = displayData.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (Number(displayData[mid].time) < bucket) lo = mid + 1;
      else hi = mid;
    }
    const completed = displayData.slice(0, lo);
    let first = currentIndex;
    while (first > 0 && getTimeframeBucketStart(rawData[first - 1].time, timeframe) === bucket) first--;
    const forming = aggregateData(rawData.slice(first, currentIndex + 1), timeframe);
    if (forming.length) completed.push(forming[forming.length - 1]);
    return completed;
  }, [rawData, displayData, currentIndex, timeframe]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: { background: { type: 'solid', color: theme?.background || '#131722' }, textColor: '#aeb5c2', fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderVisible: false },
      timeScale: { timeVisible: true, secondsVisible: false, borderVisible: false, rightOffset: 3, tickMarkFormatter: (time, type) => formatMarketTick(time, type) },
      localization: { timeFormatter: time => formatMarketDateTime(time) },
      handleScroll: true,
      handleScale: true,
    });
    lastTimeframeRef.current = null;
    const state = useStore.getState();
    const series = chart.addSeries(CandlestickSeries, {
      upColor: theme?.upBody || '#26a69a',
      downColor: theme?.downBody || '#ef5350',
      wickUpColor: theme?.upWick || '#26a69a',
      wickDownColor: theme?.downWick || '#ef5350',
      borderVisible: false,
      priceLineVisible: false,
      priceFormat: { type: 'price', precision: getPricePrecision(symbol, state.contractSpecs), minMove: getPriceTickSize(symbol, state.contractSpecs) },
    });
    chartRef.current = chart;
    seriesRef.current = series;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) chart.applyOptions({ width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [symbol, theme]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    seriesRef.current.setData(candles);
    if (candles.length && lastTimeframeRef.current !== timeframe) {
      chartRef.current.timeScale().fitContent();
      lastTimeframeRef.current = timeframe;
    }
  }, [candles, timeframe]);

  return (
    <div className="absolute inset-0 bg-[#131722]">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute left-2 top-2 z-20 flex items-center gap-2 rounded-md border border-[#2a2e39] bg-[#131722]/95 px-2 py-1 shadow-lg">
        <span className="text-[10px] font-bold text-white">{symbol}</span>
        <select aria-label="Chart timeframe" value={timeframe} onChange={event => onTimeframeChange(event.target.value)} className="h-6 rounded border border-[#343b4b] bg-[#1e222d] px-1 text-[10px] font-semibold text-white outline-none">
          {OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </div>
  );
}
