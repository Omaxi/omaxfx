import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { useStore } from '../store';
import { aggregateData, getTimeframeBucketStart } from '../utils/timeframe';
import { getPricePrecision, getPriceTickSize } from '../utils/instrument';
import { formatMarketDateTime, formatMarketTick } from '../utils/marketClock';
import { ChevronDown, Check } from 'lucide-react';
import IndicatorsPanel from './IndicatorsPanel';
import DrawingToolbar from './DrawingToolbar';

const OPTIONS = [
  { value: 1, label: '1m' }, { value: 5, label: '5m' }, { value: 15, label: '15m' },
  { value: 30, label: '30m' }, { value: 60, label: '1H' }, { value: 240, label: '4H' },
  { value: 1440, label: '1D' }, { value: 10080, label: '1W' },
];

const timeframeLabel = value => OPTIONS.find(option => option.value === Number(value))?.label || `${value}m`;


export default function MiniChart({ timeframe, onTimeframeChange, chartId = 'mini' }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const lastTimeframeRef = useRef(null);
  const [chartReady, setChartReady] = useState(false);
  const [timeframeMenuOpen, setTimeframeMenuOpen] = useState(false);
  const timeframeButtonRef = useRef(null);
  const [timeframeMenuPosition, setTimeframeMenuPosition] = useState({ left: 176, top: 48, maxHeight: 360 });
  const rawData = useStore(state => state.rawData);
  const currentIndex = useStore(state => state.currentIndex);
  const symbol = useStore(state => state.symbol);
  const theme = useStore(state => state.theme);
  const uiTheme = useStore(state => state.uiTheme);

  useEffect(() => {
    if (!timeframeMenuOpen) return undefined;
    const closeOnOutside = event => {
      if (event.type === 'keydown' && event.key === 'Escape') setTimeframeMenuOpen(false);
      if (event.type === 'pointerdown' && !timeframeButtonRef.current?.contains(event.target) && !event.target.closest?.('[data-mini-timeframe-menu]')) {
        setTimeframeMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnOutside);
    };
  }, [timeframeMenuOpen]);

  const toggleTimeframeMenu = () => {
    if (!timeframeMenuOpen && timeframeButtonRef.current) {
      const rect = timeframeButtonRef.current.getBoundingClientRect();
      const maxHeight = Math.min(360, window.innerHeight - 24);
      const below = window.innerHeight - rect.bottom - 12;
      const top = below >= Math.min(300, maxHeight) ? rect.bottom + 6 : Math.max(8, rect.top - maxHeight - 6);
      setTimeframeMenuPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 148)),
        top,
        maxHeight,
      });
    }
    setTimeframeMenuOpen(value => !value);
  };
  const aggregatedData = useMemo(() => aggregateData(rawData, timeframe), [rawData, timeframe]);
  const candles = useMemo(() => {
    if (!rawData[currentIndex]) return [];
    if (Number(timeframe) <= 1) return rawData.slice(0, currentIndex + 1);
    const bucket = getTimeframeBucketStart(rawData[currentIndex].time, timeframe);
    let lo = 0, hi = aggregatedData.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (Number(aggregatedData[mid].time) < bucket) lo = mid + 1;
      else hi = mid;
    }
    const completed = aggregatedData.slice(0, lo);
    let first = currentIndex;
    while (first > 0 && getTimeframeBucketStart(rawData[first - 1].time, timeframe) === bucket) first--;
    const forming = aggregateData(rawData.slice(first, currentIndex + 1), timeframe);
    if (forming.length) completed.push(forming[forming.length - 1]);
    return completed;
  }, [rawData, currentIndex, timeframe, aggregatedData]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: { background: { type: 'solid', color: uiTheme === 'light' ? '#f8fafc' : (theme?.background || '#131722') }, textColor: uiTheme === 'light' ? '#475467' : '#aeb5c2', fontSize: 10, attributionLogo: false },
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
    setChartReady(true);
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) chart.applyOptions({ width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.remove();
      setChartReady(false);
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [symbol, theme, uiTheme]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    seriesRef.current.setData(candles);
    if (candles.length && lastTimeframeRef.current !== timeframe) {
      chartRef.current.timeScale().fitContent();
      lastTimeframeRef.current = timeframe;
    }
  }, [candles, timeframe]);

  const resetChartView = () => {
    const chart = chartRef.current;
    if (!chart || !candles.length) return;
    const width = containerRef.current?.clientWidth || 600;
    const axisWidth = chart.priceScale('right').width();
    const halfBars = Math.max(16, Math.floor(Math.max(100, width - axisWidth) / 12));
    const last = candles.length - 1;
    const visible = candles.slice(Math.max(0, last - halfBars), last + 1);
    const high = Math.max(...visible.map(c => Number(c.high)));
    const low = Math.min(...visible.map(c => Number(c.low)));
    const center = Number(candles[last].close);
    const span = Math.max(high - low, Math.abs(center) * 0.0005, 0.0001) * 1.25;
    chart.timeScale().applyOptions({ barSpacing: 6, rightOffset: halfBars, fixLeftEdge: false, fixRightEdge: false });
    chart.timeScale().setVisibleLogicalRange({ from: last - halfBars, to: last + halfBars });
    chart.priceScale('right').applyOptions({ autoScale: false });
    chart.priceScale('right').setVisibleRange({ from: center - span / 2, to: center + span / 2 });
  };

  useEffect(() => {
    const reset = () => resetChartView();
    window.addEventListener('omaxfx:reset-chart', reset);
    window.addEventListener(`omaxfx:reset-chart:${chartId}`, reset);
    return () => {
      window.removeEventListener('omaxfx:reset-chart', reset);
      window.removeEventListener(`omaxfx:reset-chart:${chartId}`, reset);
    };
  }, [chartId, candles]);

  return (
    <div className="absolute inset-0 bg-[#131722]">
      <div ref={containerRef} className="absolute inset-0" />
      <DrawingToolbar positionClassName="absolute top-12 left-2" />
      <IndicatorsPanel chartRef={chartRef} chartReady={chartReady} visibleData={candles} displayData={aggregatedData} timeframe={timeframe} priceSeriesRef={seriesRef} liveCandle={rawData[currentIndex] || null} rawData={rawData} currentIndex={currentIndex} />
      {/* Keep each pane's timeframe control beside its own Indicators button. */}
      <div className="absolute left-[148px] top-2 z-30 pointer-events-auto">
        <button ref={timeframeButtonRef} type="button" onClick={toggleTimeframeMenu}
          aria-label="Chart timeframe" aria-haspopup="listbox" aria-expanded={timeframeMenuOpen}
          className="flex h-8 min-w-[56px] items-center justify-center gap-1.5 rounded-md border border-[#2a2e39] bg-[#1e222d] px-2 text-[10px] font-bold text-white shadow-none transition-colors hover:bg-[#2a2e39] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <span>{timeframeLabel(timeframe)}</span>
          <ChevronDown size={10} className={`transition-transform ${timeframeMenuOpen ? 'rotate-180' : ''}`}/>
        </button>
      </div>
      {timeframeMenuOpen && <>
        <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setTimeframeMenuOpen(false)} />
        <div data-mini-timeframe-menu role="listbox" aria-label="Select chart timeframe"
          className="theme-menu-surface fixed min-w-[140px] overflow-hidden rounded-lg border border-[#2a2e39] bg-[#1e222d] shadow-2xl"
          style={{ zIndex: 9999, left: timeframeMenuPosition.left, top: timeframeMenuPosition.top, maxHeight: timeframeMenuPosition.maxHeight, overflowY: 'auto' }}>
          <div className="sticky top-0 border-b border-[#2a2e39] bg-[#1e222d] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">Timeframe</div>
          {OPTIONS.map(option => {
            const selected = Number(timeframe) === option.value;
            return <button key={option.value} type="button" role="option" aria-selected={selected}
              onClick={() => { onTimeframeChange(option.value); setTimeframeMenuOpen(false); }}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-white transition-colors hover:bg-[#2a2e39] ${selected ? 'bg-blue-600/15' : ''}`}>
              <span className="flex items-center gap-2">
                <span className="flex w-3 items-center justify-center">{selected && <Check size={10} className="text-blue-400"/>}</span>
                <span className={selected ? 'font-bold' : ''}>{option.label}</span>
              </span>
            </button>;
          })}
        </div>
      </>}
    </div>
  );
}
