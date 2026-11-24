import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { useStore } from '../store';
import { getPricePrecision, getPriceTickSize } from '../utils/instrument';
import { aggregateData, getTimeframeBucketStart } from '../utils/timeframe';
import { toMarketDate, formatMarketDateTime, formatMarketTick } from '../utils/marketClock';
import { X, Trash2, Lock, ChevronDown } from 'lucide-react';
import IndicatorsPanel from './IndicatorsPanel';
import DrawingToolbar from './DrawingToolbar';
import StylePanel from './StylePanel';

const calcRRR = (entry, sl, tp) => {
  if (entry == null || sl == null || tp == null) return null;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (risk === 0) return null;
  return (reward / risk).toFixed(1);
};

const distToSegment = (px, py, x1, y1, x2, y2) => {
  const A = px - x1, B = py - y1;
  const C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;
  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  return Math.hypot(px - xx, py - yy);
};

const drawShape = (ctx, drawing, pointToXY, isDraft, isSelected) => {
  const borderColor = drawing.borderColor || drawing.color || '#3b82f6';
  const fillColor = drawing.fillColor || (borderColor + '33');
  const lineWidth = drawing.lineWidth ?? 1;
  const showBorder = drawing.showBorder === true;
  const pts = drawing.points.map(p => pointToXY(p)).filter(Boolean);
  if (pts.length === 0) return;
  
  ctx.strokeStyle = borderColor;
  ctx.fillStyle = fillColor;
  ctx.lineWidth = isDraft ? 1.5 : lineWidth;
  ctx.setLineDash(isDraft ? [5, 5] : []);
  const canvasW = ctx.canvas.clientWidth || ctx.canvas.width;
  const canvasH = ctx.canvas.clientHeight || ctx.canvas.height;

  if (drawing.type === 'text' && pts.length === 1) {
    ctx.font = `${drawing.fontSize || 14}px ${drawing.fontFamily || 'sans-serif'}`;
    ctx.fillStyle = borderColor;
    ctx.textBaseline = 'bottom';
    ctx.fillText(drawing.text, pts[0].x, pts[0].y);
  } else if (drawing.type === 'horizontal') {
    const { y } = pts[0];
    {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasW, y);
      ctx.stroke();
    }
  } else if (drawing.type === 'vertical') {
    const { x } = pts[0];
    {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasH);
      ctx.stroke();
    }
  } else if (drawing.type === 'trendline' && pts.length === 2) {
    {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.stroke();
    }
  } else if (drawing.type === 'rectangle' && pts.length === 2) {
    const x = Math.min(pts[0].x, pts[1].x);
    const y = Math.min(pts[0].y, pts[1].y);
    const w = Math.abs(pts[1].x - pts[0].x);
    const h = Math.abs(pts[1].y - pts[0].y);
    ctx.fillRect(x, y, w, h);
    if (showBorder) ctx.strokeRect(x, y, w, h);
  } else if (drawing.type === 'fibonacci' && pts.length === 2) {
    const levels = [0, 0.5, 0.618, 0.764, 1];
    const y1 = pts[0].y, y2 = pts[1].y;
    const x1 = pts[0].x, x2 = pts[1].x;
    const xMin = Math.min(x1, x2);
    const xMax = Math.max(x1, x2);
    ctx.fillStyle = fillColor;
    ctx.fillRect(xMin, Math.min(y1, y2), xMax - xMin, Math.abs(y2 - y1));
    levels.forEach(level => {
      if (!showBorder) return;
      const y = y1 + (y2 - y1) * level;
      const isKey = level === 0.5 || level === 0.618;
      ctx.beginPath();
      ctx.strokeStyle = isKey ? borderColor : borderColor + 'aa';
      ctx.setLineDash(isKey ? [] : [3, 3]);
      ctx.moveTo(xMin, y);
      ctx.lineTo(xMax, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = borderColor;
      ctx.font = 'bold 10px monospace';
      const pct = (level * 100).toFixed(1);
      const price = drawing.points[0].price + (drawing.points[1].price - drawing.points[0].price) * level;
      ctx.fillText(`${pct}%  ${price.toFixed(getPricePrecision(useStore.getState().symbol, useStore.getState().contractSpecs))}`, xMax + 4, y + 3);
    });

  }

  if (isSelected) {
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;

    if (drawing.type === 'text' && pts.length === 1) {
      ctx.font = `${drawing.fontSize || 14}px ${drawing.fontFamily || 'sans-serif'}`;
      const metrics = ctx.measureText(drawing.text);
      const width = metrics.width;
      const height = drawing.fontSize || 14;
      ctx.strokeRect(pts[0].x - 2, pts[0].y - height - 2, width + 4, height + 6);
    } else if (drawing.type === 'horizontal') {
      const { y } = pts[0];
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasW, y);
      ctx.stroke();
    } else if (drawing.type === 'vertical') {
      const { x } = pts[0];
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasH);
      ctx.stroke();
    } else if (drawing.type === 'trendline' && pts.length === 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.stroke();
    } else if (pts.length === 2) {
      const x1 = Math.min(pts[0].x, pts[1].x);
      const x2 = Math.max(pts[0].x, pts[1].x);
      const y1 = Math.min(pts[0].y, pts[1].y);
      const y2 = Math.max(pts[0].y, pts[1].y);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }

    ctx.setLineDash([]);
  }
};

const drawPencilStroke = (ctx, stroke, pointToXY) => {
  if (!stroke.points || stroke.points.length < 2) return;
  const points = stroke.points.map(p => Number.isFinite(p.time) && Number.isFinite(p.price) ? pointToXY(p) : p).filter(Boolean);
  if (points.length < 2) return;
  ctx.strokeStyle = stroke.color || '#3b82f6';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  // Smooth the freehand path with quadratic curves through segment midpoints.
  // Unlike the previous uniform spline, this avoids sharp joins and overshoot
  // when pointer samples arrive at uneven intervals.
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
  }
  ctx.stroke();
};

const DOUBLE_TAP_TIME = 500;
const DOUBLE_TAP_DIST = 50;

const PENCIL_COLORS = [
  '#ffffff', '#ef5350', '#26a69a', '#3b82f6',
  '#f59e0b', '#a855f7', '#22c55e', '#06b6d4',
];

const X_BUTTON_OFFSET_FROM_RIGHT = 200;

export default function Chart({ chartId = 'main' }) {
  const chartContainerRef = useRef();
  const canvasRef = useRef();
  const crosshairCanvasRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const lineSeriesRef = useRef();
  const linesRef = useRef([]);
  const dragRef = useRef(null);
  const draftRef = useRef(null);
  const dragDrawRef = useRef(null);
  const visibleDataRef = useRef([]);
  const lastRenderedDataRef = useRef([]);
  const lastTimeframeRef = useRef(1);
  const lastRecenterRef = useRef(0);
  const activePointersRef = useRef(new Set());
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const touchDownPosRef = useRef({ x: 0, y: 0 });
  const chartLockedRef = useRef(false);
  const selectedItemRef = useRef(null);
  const currentPencilRef = useRef(null);
  const scheduleDrawRef = useRef(() => {});

  const [pendingBtnPos, setPendingBtnPos] = useState([]);
  const [positionBtnPos, setPositionBtnPos] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [chartReady, setChartReady] = useState(false);
  const [textInput, setTextInput] = useState(null);
  const [htfDashboard, setHtfDashboard] = useState(null);
  const [indicatorDashboard, setIndicatorDashboard] = useState([]);
  const [dashboardCollapsed, setDashboardCollapsed] = useState(false);
  const [chartUiPanelsHidden, setChartUiPanelsHidden] = useState(false);
  const cancelTextEditRef = useRef(false);

  const { 
    rawData, displayData, currentIndex, positions, pendingOrders, 
    draftPosition, timeframe, cancelPendingOrder, closePosition, activeDrawingTool,
    isDrawingMode, isPlaying, togglePlay, stepForward, removeDrawing, gameStarted,
    theme, uiTheme, snapshotDrawings, recenterToken,
    isPencilMode, pencilColor, setPencilColor,
    chartType, symbol, contractSpecs
  } = useStore();

  const lockChart = useCallback((locked) => {
    if (!chartRef.current) return;
    if (chartLockedRef.current === locked) return;
    try {
      chartRef.current.applyOptions({
        handleScroll: !locked,
        handleScale: !locked,
      });
      chartLockedRef.current = locked;
    } catch (e) {}
  }, []);

  useEffect(() => {
    const handlePanelShortcut = (event) => {
      if (event.key?.toLowerCase() !== 'h' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target?.tagName)) return;
      event.preventDefault();
      setChartUiPanelsHidden(hidden => !hidden);
    };
    window.addEventListener('keydown', handlePanelShortcut);
    return () => window.removeEventListener('keydown', handlePanelShortcut);
  }, []);
  useEffect(() => { selectedItemRef.current = selectedItem; }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem) return;
    if (selectedItem.type === 'drawing') {
      const d = useStore.getState().drawings.find(x => x.id === selectedItem.id);
      if (!d) { setSelectedItem(null); lockChart(false); return; }
    } else if (selectedItem.type === 'trade') {
      const state = useStore.getState();
      let exists = false;
      if (selectedItem.target === 'position') {
        exists = state.positions.some(p => p.id === selectedItem.positionId);
      } else if (selectedItem.target === 'pending') {
        exists = state.pendingOrders.some(o => o.id === selectedItem.orderId);
      } else if (selectedItem.target === 'draft') {
        exists = !!state.draftPosition;
      }
      if (!exists) { setSelectedItem(null); lockChart(false); }
    }
  }, [positions, pendingOrders, selectedItem]);

  useEffect(() => {
    const shouldLock = !!activeDrawingTool || !!isDrawingMode || !!selectedItem || !!isPencilMode || !!textInput;
    lockChart(shouldLock);
  }, [activeDrawingTool, isDrawingMode, selectedItem, isPencilMode, textInput, lockChart]);

  useEffect(() => {
    if (!gameStarted) {
      setSelectedItem(null);
      lockChart(false);
    }
  }, [gameStarted, lockChart]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const t = useStore.getState().theme;
    const ct = useStore.getState().chartType;
    const lightUi = useStore.getState().uiTheme === 'light';
    
    chartRef.current = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#6b7280',
        fontSize: 9,
        attributionLogo: false,
        panes: {
          separatorColor: lightUi ? '#d0d5dd' : '#2a2e39',
          separatorHoverColor: '#3b82f6',
          enableResize: true,
        },
      },
      // Lightweight Charts formats Unix timestamps as UTC by default. The CSV
      // is broker wall-clock time UTC+3, stored internally as UTC-3 for replay.
      // Apply the same +3 offset to axis and crosshair labels as the candle panel.
      localization: {
        locale: 'en-GB',
        timeFormatter: (time) => formatMarketDateTime(time),
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      timeScale: { 
        timeVisible: true, secondsVisible: false,
        borderVisible: false, barSpacing: 6, rightOffset: 60,
        tickMarkFormatter: (time, tickMarkType) => formatMarketTick(time, tickMarkType),
      },
      rightPriceScale: { borderVisible: false },
      crosshair: {
        mode: 1,
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
    });

    setChartReady(true);

    // Per-symbol price format: EURUSD 5 decimals, Gold 2 decimals.
    const initialState = useStore.getState();
    const initialPrecision = getPricePrecision(initialState.symbol, initialState.contractSpecs);
    const initialMinMove = getPriceTickSize(initialState.symbol, initialState.contractSpecs);

    seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
      upColor: t.upBody, downColor: t.downBody, borderVisible: false,
      wickUpColor: t.upWick, wickDownColor: t.downWick,
      priceLineVisible: false, lastValueVisible: true,
      visible: ct === 'candle',
      priceFormat: {
        type: 'price',
        precision: initialPrecision,
        minMove: initialMinMove,
      },
    });

    lineSeriesRef.current = chartRef.current.addSeries(LineSeries, {
      color: t.upBody,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      visible: ct === 'line',
      priceFormat: {
        type: 'price',
        precision: initialPrecision,
        minMove: initialMinMove,
      },
    });

    const resizeObserver = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect || !chartRef.current) return;
      chartRef.current.applyOptions({ width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) });
    });
    resizeObserver.observe(chartContainerRef.current);
    const timer = setTimeout(() => {
      try { chartRef.current.timeScale().fitContent(); } catch (e) {}
      window.dispatchEvent(new Event('resize'));
    }, 50);
    return () => { clearTimeout(timer); resizeObserver.disconnect(); setChartReady(false); chartRef.current.remove(); };
  }, []);

  // Update price format when the active symbol changes.
  // EURUSD shows five decimals (e.g. 1.11987), XAUUSD shows two (e.g. 4325.80).
  useEffect(() => {
    if (!seriesRef.current || !lineSeriesRef.current) return;
    const precision = getPricePrecision(symbol, useStore.getState().contractSpecs);
    const minMove = getPriceTickSize(symbol, useStore.getState().contractSpecs);
    try {
      seriesRef.current.applyOptions({
        priceFormat: { type: 'price', precision, minMove },
      });
      lineSeriesRef.current.applyOptions({
        priceFormat: { type: 'price', precision, minMove },
      });
    } catch (e) {}
  }, [symbol, contractSpecs]);

  useEffect(() => {
    if (!seriesRef.current || !lineSeriesRef.current) return;
    try {
      seriesRef.current.applyOptions({
        upColor: theme.upBody,
        downColor: theme.downBody,
        wickUpColor: theme.upWick,
        wickDownColor: theme.downWick,
      });
      lineSeriesRef.current.applyOptions({ color: theme.upBody });
    } catch (e) {}
  }, [theme]);

  useEffect(() => {
    const applyUiTheme = (event) => {
      const light = (event?.detail || document.documentElement.dataset.uiTheme) === 'light';
      try {
        chartRef.current?.applyOptions({
          layout: {
            background: { type: 'solid', color: light ? '#f8fafc' : (useStore.getState().theme?.background || '#131722') },
            textColor: light ? '#475467' : '#6b7280',
            panes: { separatorColor: light ? '#d0d5dd' : '#2a2e39', separatorHoverColor: '#3b82f6', enableResize: true },
          },
          grid: {
            vertLines: { visible: false },
            horzLines: { visible: false },
          },
        });
      } catch (e) {}
    };
    applyUiTheme();
    window.addEventListener('omaxfx-ui-theme-change', applyUiTheme);
    return () => window.removeEventListener('omaxfx-ui-theme-change', applyUiTheme);
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !lineSeriesRef.current) return;
    try {
      seriesRef.current.applyOptions({ visible: chartType === 'candle' });
      lineSeriesRef.current.applyOptions({ visible: chartType === 'line' });
    } catch (e) {}
  }, [chartType]);

  const timeToX = useCallback((time) => {
    const chart = chartRef.current;
    if (!chart) return null;
    const data = visibleDataRef.current;
    if (data.length < 2) return null;
    // A drawing is anchored to its original market timestamp, not to the
    // candle index/timeframe on which it was created. Interpolate against the
    // actual chart data so changing 1m -> 15m cannot shift it to an edge.
    // Resolve drawing timestamps through the chart's own time-scale points.
    // This keeps 1m drawings aligned when the visible series is re-aggregated
    // to 5m/15m and avoids logical-index offsets that can pin them to the edge.
    const timeScale = chart.timeScale();
    const firstTime = Number(data[0].time);
    const lastTime = Number(data[data.length - 1].time);
    let lo, hi;
    if (time <= firstTime) { lo = 0; hi = 1; }
    else if (time >= lastTime) { lo = data.length - 2; hi = data.length - 1; }
    else {
      lo = 0; hi = data.length - 1;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (Number(data[mid].time) < time) lo = mid; else hi = mid;
      }
    }
    try {
      const t1 = Number(data[lo].time), t2 = Number(data[hi].time);
      const x1 = timeScale.timeToCoordinate(t1);
      const x2 = timeScale.timeToCoordinate(t2);
      if (x1 == null || x2 == null || !Number.isFinite(x1) || !Number.isFinite(x2) || t2 === t1) return null;
      const x = x1 + (x2 - x1) * ((time - t1) / (t2 - t1));
      return Number.isFinite(x) ? x : null;
    } catch (e) { return null; }
  }, []);

  // Vertical drawings snap to the center of the displayed candle that
  // contains their original timestamp. Keep the stored timestamp unchanged,
  // so returning to the creation timeframe restores the exact original bar.
  const snapTimeToCandleX = useCallback((time) => {
    const chart = chartRef.current;
    const data = visibleDataRef.current;
    if (!chart || data.length === 0 || !Number.isFinite(Number(time))) return null;
    let lo = 0, hi = data.length - 1;
    if (Number(time) <= Number(data[0].time)) hi = lo = 0;
    else if (Number(time) >= Number(data[hi].time)) lo = hi;
    else {
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (Number(data[mid].time) <= Number(time)) lo = mid;
        else hi = mid;
      }
    }
    try {
      // timeToCoordinate returns the candle's center, not its left edge.
      const x = chart.timeScale().timeToCoordinate(Number(data[lo].time));
      return x == null || !Number.isFinite(x) ? null : x;
    } catch (e) { return null; }
  }, []);

  const pointToXY = useCallback((point) => {
    const series = seriesRef.current;
    if (!series) return null;
    const x = timeToX(point.time);
    if (x == null) return null;
    const y = series.priceToCoordinate(point.price);
    if (y == null) return null;
    return { x, y };
  }, [timeToX]);

  const verticalPointToXY = useCallback((point) => {
    const series = seriesRef.current;
    if (!series) return null;
    const x = snapTimeToCandleX(point.time);
    if (x == null) return null;
    const y = series.priceToCoordinate(point.price);
    if (y == null) return null;
    return { x, y };
  }, [snapTimeToCandleX]);

  const xyToPoint = useCallback((x, y) => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return null;
    const price = series.coordinateToPrice(y);
    if (price == null) return null;
    const data = visibleDataRef.current;
    if (data.length < 2) return null;
    const tf = useStore.getState().timeframe;
    const step = tf * 60;
    const logical = chart.timeScale().coordinateToLogical(x);
    if (logical == null) return null;
    const firstTime = data[0].time;
    const lastTime = data[data.length - 1].time;
    let time;
    if (logical <= 0) time = firstTime + logical * step;
    else if (logical >= data.length - 1) time = lastTime + (logical - (data.length - 1)) * step;
    else {
      const lo = Math.floor(logical);
      const hi = Math.min(lo + 1, data.length - 1);
      const frac = logical - lo;
      const t1 = data[lo].time;
      const t2 = data[hi].time;
      time = t1 + (t2 - t1) * frac;
    }
    return { time, price };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = chartContainerRef.current;
    if (!canvas || !container) return;
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resizeCanvas();
    let ro;

    const findClosestCandleTime = (targetTime) => {
      const data = visibleDataRef.current;
      if (data.length === 0) return targetTime;
      if (targetTime <= data[0].time) return data[0].time;
      if (targetTime >= data[data.length - 1].time) return data[data.length - 1].time;
      let lo = 0, hi = data.length - 1;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (data[mid].time < targetTime) lo = mid; else hi = mid;
      }
      return (targetTime - data[lo].time) < (data[hi].time - targetTime) ? data[lo].time : data[hi].time;
    };

    let rafId = null;
    let disposed = false;
    const draw = () => {
      rafId = null;
      if (disposed) return;
      const ctx = canvas.getContext('2d');
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      let paneW = rect.width, paneH = rect.height;
      if (chartRef.current) {
        try {
          const priceAxisW = chartRef.current.priceScale('right').width();
          const timeAxisH = chartRef.current.timeScale().height();
          if (priceAxisW > 0) paneW = rect.width - priceAxisW;
          if (timeAxisH > 0) paneH = rect.height - timeAxisH;
        } catch (e) {}
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, paneW, paneH);
      ctx.clip();
      const state = useStore.getState();

      // Draw Entry / SL / TP as full-width, directly draggable horizontal levels.
      // This is the classic chart-level interaction: users grab the price line
      // anywhere in the chart instead of trying to drag the filled risk box.
      const drawPositionLevels = (tool, target, prefix) => {
        if (!seriesRef.current) return;
        const entry = Number(target === 'draft' ? tool.entry : tool.entryPrice);
        if (!Number.isFinite(entry)) return;
        const long = tool.type === 'buy';
        const precision = getPricePrecision(state.symbol, state.contractSpecs);
        const levels = [
          { type: 'entry', price: entry, color: '#3b82f6', label: 'ENTRY' },
          { type: 'sl', price: tool.sl == null ? NaN : Number(tool.sl), color: '#ef5350', label: 'SL' },
          { type: 'tp', price: tool.tp == null ? NaN : Number(tool.tp), color: '#26a69a', label: 'TP' },
        ];
        levels.forEach(level => {
          if (!Number.isFinite(level.price)) return;
          const y = seriesRef.current.priceToCoordinate(level.price);
          if (y == null || !Number.isFinite(y) || y < -2 || y > paneH + 2) return;
          ctx.save();
          ctx.strokeStyle = level.color;
          ctx.lineWidth = level.type === 'entry' ? 1.5 : 1.25;
          // Once an order is filled and becomes an open position, show its
          // Entry / SL / TP guides as dashed lines to distinguish triggered trades.
          ctx.setLineDash(target === 'position' ? [6, 4] : []);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(paneW, y);
          ctx.stroke();
          const tag = (prefix || '') + level.label;
          ctx.font = '600 9px Arial';
          const tagWidth = ctx.measureText(tag).width + 12;
          ctx.fillStyle = level.color;
          ctx.fillRect(Math.max(0, paneW - tagWidth), y - 8, tagWidth, 16);
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(tag, Math.max(0, paneW - tagWidth / 2), y);
          ctx.restore();
        });
        const entryY = seriesRef.current.priceToCoordinate(entry);
        if (entryY != null && Number.isFinite(entryY)) {
          ctx.save();
          ctx.font = '600 10px Arial';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const rrr = calcRRR(entry, tool.sl, tool.tp);
          ctx.fillText((long ? 'Long' : 'Short') + ' · RRR ' + (rrr || '—'), 8, Math.max(10, Math.min(paneH - 10, entryY + (long ? 12 : -12))));
          ctx.restore();
        }
      };
      (state.pendingOrders || []).forEach(order => drawPositionLevels(order, 'pending', ''));
      (state.positions || []).forEach(position => drawPositionLevels(position, 'position', ''));
      // 1. Draw trade history (Entry/Exit boxes + SL area + TP area)
      const tradeHistory = state.tradeHistory || [];
      tradeHistory.forEach(trade => {
        const openTime = findClosestCandleTime(trade.openTime);
        const closeTime = findClosestCandleTime(trade.closeTime);

        const x1 = timeToX(openTime);
        const x2 = timeToX(closeTime);
        const yEntry = seriesRef.current?.priceToCoordinate(trade.entryPrice);
        const yExit = seriesRef.current?.priceToCoordinate(trade.exitPrice);
        const ySL = trade.sl != null ? seriesRef.current?.priceToCoordinate(trade.sl) : null;
        const yTP = trade.tp != null ? seriesRef.current?.priceToCoordinate(trade.tp) : null;

        if (x1 == null || x2 == null || yEntry == null || yExit == null) return;
        
        if (x1 > paneW && x2 > paneW) return;
        if (x1 < 0 && x2 < 0) return;

        const isWin = trade.pnl >= 0;
        const resultColor = isWin ? '#26a69a' : '#ef5350';
        const resultBgColor = isWin ? 'rgba(38, 166, 154, 0.25)' : 'rgba(239, 83, 80, 0.25)';
        const slBgColor = 'rgba(239, 83, 80, 0.15)';
        const tpBgColor = 'rgba(38, 166, 154, 0.15)';

        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const w = Math.max(2, maxX - minX);

        if (ySL != null) {
          const minY_SL = Math.min(yEntry, ySL);
          const maxY_SL = Math.max(yEntry, ySL);
          const h_SL = Math.max(2, maxY_SL - minY_SL);
          ctx.fillStyle = slBgColor;
          ctx.fillRect(minX, minY_SL, w, h_SL);
        }

        if (yTP != null) {
          const minY_TP = Math.min(yEntry, yTP);
          const maxY_TP = Math.max(yEntry, yTP);
          const h_TP = Math.max(2, maxY_TP - minY_TP);
          ctx.fillStyle = tpBgColor;
          ctx.fillRect(minX, minY_TP, w, h_TP);
        }

        const minY_Result = Math.min(yEntry, yExit);
        const maxY_Result = Math.max(yEntry, yExit);
        const h_Result = Math.max(2, maxY_Result - minY_Result);
        ctx.fillStyle = resultBgColor;
        ctx.fillRect(minX, minY_Result, w, h_Result);

        if (w > 40) {
          ctx.fillStyle = resultColor;
          ctx.font = 'bold 9px monospace';
          const pnlText = `${isWin ? '+' : ''}${trade.pnl.toFixed(1)}`;
          ctx.fillText(pnlText, minX + 5, minY_Result + 12);
        }
      });

      // Draw draft Entry / SL / TP as full-width horizontal draggable levels.
      if (state.draftPosition?.entry != null) {
        drawPositionLevels(state.draftPosition, 'draft', 'DRAFT ');
      }

      // 3. Draw user drawings
      const sel = selectedItemRef.current;
      const selectedId = sel?.type === 'drawing' ? sel.id : null;
      state.drawings.forEach(d => {
        if (d.symbol && d.symbol !== state.symbol) return;
        drawShape(ctx, d, d.type === 'vertical' ? verticalPointToXY : pointToXY, false, d.id === selectedId);
      });
      if (draftRef.current) drawShape(ctx, draftRef.current, pointToXY, true, false);

      // 3. Draw pencil strokes
      state.pencilStrokes.forEach(s => drawPencilStroke(ctx, s, pointToXY));
      if (currentPencilRef.current) drawPencilStroke(ctx, currentPencilRef.current, pointToXY);

      // Position levels are rendered as full-width horizontal draggable guides.

      ctx.restore();

      // Axis labels for user-placed price/time lines (TradingView-style tags).
      const precision = getPricePrecision(state.symbol, state.contractSpecs);
      (state.drawings || []).forEach(drawing => {
        if (drawing.symbol && drawing.symbol !== state.symbol) return;
        const point = drawing.points?.[0];
        if (!point) return;
        const color = drawing.borderColor || drawing.color || '#3b82f6';
        ctx.save();
        ctx.font = '500 9px Arial';
        ctx.textBaseline = 'middle';
        if (drawing.type === 'horizontal') {
          const y = seriesRef.current?.priceToCoordinate(Number(point.price));
          if (y != null && y >= 0 && y <= paneH) {
            const axisWidth = Math.max(0, rect.width - paneW);
            ctx.fillStyle = color;
            ctx.fillRect(paneW, y - 7, axisWidth, 14);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(Number(point.price).toFixed(precision), paneW + axisWidth / 2, y);
          }
        } else if (drawing.type === 'vertical') {
          const x = snapTimeToCandleX(Number(point.time));
          if (x != null && x >= 0 && x <= paneW) {
            const label = formatMarketDateTime(Number(point.time));
            const width = Math.ceil(ctx.measureText(label).width) + 8;
            const axisHeight = Math.max(18, rect.height - paneH);
            const left = Math.max(0, Math.min(paneW - width, x - width / 2));
            ctx.fillStyle = color;
            ctx.fillRect(left, paneH, width, axisHeight);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(label, left + width / 2, paneH + axisHeight / 2);
          }
        }
        ctx.restore();
      });
    };
    const scheduleDraw = () => {
      if (disposed || rafId !== null) return;
      rafId = requestAnimationFrame(draw);
    };
    scheduleDrawRef.current = scheduleDraw;
    ro = new ResizeObserver(() => { resizeCanvas(); scheduleDraw(); });
    ro.observe(container);
    const unsubscribeStore = useStore.subscribe((state, previous) => {
      if (state.drawings !== previous.drawings ||
          state.pencilStrokes !== previous.pencilStrokes ||
          state.tradeHistory !== previous.tradeHistory ||
          state.positions !== previous.positions ||
          state.pendingOrders !== previous.pendingOrders ||
          state.draftPosition !== previous.draftPosition ||
          state.timeframe !== previous.timeframe ||
          state.symbol !== previous.symbol ||
          state.currentIndex !== previous.currentIndex) scheduleDraw();
    });
    const timeScale = chartRef.current?.timeScale();
    const priceScale = chartRef.current?.priceScale('right');
    timeScale?.subscribeVisibleLogicalRangeChange(scheduleDraw);
    priceScale?.subscribeVisiblePriceRangeChange?.(scheduleDraw);
    chartRef.current?.subscribeSizeChange?.(scheduleDraw);
    window.addEventListener('pointermove', scheduleDraw, { passive: true });
    window.addEventListener('wheel', scheduleDraw, { passive: true });
    draw();
    return () => {
      disposed = true;
      scheduleDrawRef.current = () => {};
      if (rafId !== null) cancelAnimationFrame(rafId);
      unsubscribeStore();
      timeScale?.unsubscribeVisibleLogicalRangeChange(scheduleDraw);
      priceScale?.unsubscribeVisiblePriceRangeChange?.(scheduleDraw);
      chartRef.current?.unsubscribeSizeChange?.(scheduleDraw);
      window.removeEventListener('pointermove', scheduleDraw);
      window.removeEventListener('wheel', scheduleDraw);
      ro?.disconnect();
    };
  }, [pointToXY, timeToX, selectedItem]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    container.style.touchAction = 'none';

    const hitTestDrawings = (x, y) => {
      const state = useStore.getState();
      const HANDLE_TOL = 22;
      const BODY_TOL = 14;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      for (let i = state.drawings.length - 1; i >= 0; i--) {
        const d = state.drawings[i];
        if (d.symbol && d.symbol !== state.symbol) continue;
        const pts = d.points.map(p => (d.type === 'vertical' ? verticalPointToXY(p) : pointToXY(p))).filter(Boolean);
        if (pts.length === 0) continue;
        
        if (d.type === 'text' && pts[0]) {
          ctx.font = `${d.fontSize || 14}px ${d.fontFamily || 'sans-serif'}`;
          const metrics = ctx.measureText(d.text);
          const width = metrics.width;
          const height = d.fontSize || 14;
          const left = pts[0].x;
          const right = pts[0].x + width;
          const top = pts[0].y - height;
          const bottom = pts[0].y + 4;
          const padding = 12;
          if (x >= left - padding && x <= right + padding && y >= top - padding && y <= bottom + padding) {
            return { drawingId: d.id, mode: 'drag-body' };
          }
        }

        for (let j = 0; j < pts.length; j++) {
          if (Math.hypot(x - pts[j].x, y - pts[j].y) < HANDLE_TOL) {
            return { drawingId: d.id, mode: 'drag-point', pointIndex: j };
          }
        }
        if (d.type === 'horizontal' && pts[0]) {
          if (Math.abs(y - pts[0].y) < BODY_TOL) return { drawingId: d.id, mode: 'drag-body' };
        } else if (d.type === 'vertical' && pts[0]) {
          if (Math.abs(x - pts[0].x) < BODY_TOL) return { drawingId: d.id, mode: 'drag-body' };
        } else if (d.type === 'trendline' && pts.length === 2) {
          if (distToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) < BODY_TOL)
            return { drawingId: d.id, mode: 'drag-body' };
        } else if ((d.type === 'rectangle' || d.type === 'fibonacci') && pts.length === 2) {
          const x1 = Math.min(pts[0].x, pts[1].x), x2 = Math.max(pts[0].x, pts[1].x);
          const y1 = Math.min(pts[0].y, pts[1].y), y2 = Math.max(pts[0].y, pts[1].y);
          const onEdge =
            (Math.abs(y - y1) < BODY_TOL && x >= x1 - BODY_TOL && x <= x2 + BODY_TOL) ||
            (Math.abs(y - y2) < BODY_TOL && x >= x1 - BODY_TOL && x <= x2 + BODY_TOL) ||
            (Math.abs(x - x1) < BODY_TOL && y >= y1 - BODY_TOL && y <= y2 + BODY_TOL) ||
            (Math.abs(x - x2) < BODY_TOL && y >= y1 - BODY_TOL && y <= y2 + BODY_TOL);
          const inside = x >= x1 && x <= x2 && y >= y1 && y <= y2;
          if (onEdge || inside) return { drawingId: d.id, mode: 'drag-body' };
        }
      }
      return null;
    };

    const detectTradeHit = (x, y) => {
      if (!seriesRef.current) return null;
      const state = useStore.getState();
      const PIXEL_TOL = 14;
      const candidates = [];
      const addLevel = (tool, target, id, type, rawPrice) => {
        if (rawPrice == null) return;
        // Active position entries are fixed after triggering; only SL/TP move.
        const price = Number(rawPrice);
        const lineY = seriesRef.current.priceToCoordinate(price);
        if (!Number.isFinite(price) || lineY == null || !Number.isFinite(lineY)) return;
        candidates.push({
          target,
          ...(target === 'position' ? { positionId: id } : target === 'pending' ? { orderId: id } : {}),
          type, price, lineY,
        });
      };
      (state.positions || []).forEach(pos => {
        addLevel(pos, 'position', pos.id, 'sl', pos.sl);
        addLevel(pos, 'position', pos.id, 'tp', pos.tp);
      });
      (state.pendingOrders || []).forEach(order => {
        addLevel(order, 'pending', order.id, 'entry', order.entryPrice);
        addLevel(order, 'pending', order.id, 'sl', order.sl);
        addLevel(order, 'pending', order.id, 'tp', order.tp);
      });
      if (state.draftPosition) {
        const draft = state.draftPosition;
        addLevel(draft, 'draft', null, 'entry', draft.entry);
        addLevel(draft, 'draft', null, 'sl', draft.sl);
        addLevel(draft, 'draft', null, 'tp', draft.tp);
      }
      if (!candidates.length) return null;
      let closest = null;
      let closestDist = Infinity;
      for (const candidate of candidates) {
        const distance = Math.abs(y - candidate.lineY);
        if (distance < closestDist) {
          closestDist = distance;
          closest = candidate;
        }
      }
      return closestDist <= PIXEL_TOL ? closest : null;
    };

    const getLocalXY = (e) => {
      const rect = container.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const resetTapTimer = () => { lastTapRef.current = { time: 0, x: 0, y: 0 }; };
    const tradeKey = (t) => `${t.target}:${t.positionId ?? t.orderId}:${t.type}`;

    const handlePointerDown = (e) => {
      if (e.button === 2) return;
      activePointersRef.current.add(e.pointerId);

      if (activePointersRef.current.size > 1) {
        resetTapTimer();
        dragRef.current = null;
        return;
      }

      const state = useStore.getState();
      const { x, y } = getLocalXY(e);
      touchDownPosRef.current = { x, y };

      // Keep price-scale gestures native: clicking or dragging the Y-axis must never hit-select a drawing.
      const chartBounds = container.getBoundingClientRect();
      const priceScaleWidth = chartRef.current?.priceScale('right').width() || 0;
      if (priceScaleWidth > 0 && e.clientX >= chartBounds.right - priceScaleWidth - 2) {
        resetTapTimer();
        return;
      }

      if (state.isPencilMode) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        currentPencilRef.current = {
          color: state.pencilColor,
          points: [xyToPoint(x, y)].filter(Boolean),
          lastScreen: { x, y },
        };
        try { container.setPointerCapture(e.pointerId); } catch (error) {}
        scheduleDrawRef.current();
        return;
      }

      if (state.activeDrawingTool) {
        const point = xyToPoint(x, y);
        if (!point) return;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        const tool = state.activeDrawingTool;
        
        if (tool === 'text') {
          setTextInput({ x, y, time: point.time, price: point.price, value: '' });
          return;
        }

        if (tool === 'horizontal' || tool === 'vertical') {
          state.addDrawing({ type: tool, points: [point] });
          state.setActiveDrawingTool(null);
          return;
        }
        if (draftRef.current && !dragDrawRef.current) {
          state.addDrawing({
            type: draftRef.current.type,
            points: [draftRef.current.points[0], point],
          });
          draftRef.current = null;
          state.setActiveDrawingTool(null);
          return;
        }
        dragDrawRef.current = { tool, startPoint: point };
        draftRef.current = { type: tool, points: [point, point] };
        return;
      }

      if (state.isDrawingMode && seriesRef.current) {
        const price = seriesRef.current.coordinateToPrice(y);
        if (price != null) {
          const placingStop = state.drawingStep === 'sl';
          state.setDraftPrice(price);
          if (!placingStop) {
            state.updateDraftPosition({ entryTime: xyToPoint(x, y)?.time ?? null });
          } else {
            const updated = useStore.getState();
            const side = updated.drawingSide || updated.draftPosition?.type || 'buy';
            const entry = Number(updated.draftPosition?.entry);
            const stop = Number(updated.draftPosition?.sl);
            const market = Number(getExecutionCandle(updated.rawData, updated.displayData, updated.currentIndex, updated.timeframe)?.close);
            const isStop = Number.isFinite(entry) && Number.isFinite(market) && (side === 'buy' ? entry > market : entry < market);
            const risk = Math.abs(entry - stop);
            const target = side === 'buy' ? entry + risk * 2 : entry - risk * 2;
            useStore.setState({
              isDrawingMode: false,
              drawingStep: null,
              draftPosition: updated.draftPosition ? { ...updated.draftPosition, tp: target, orderType: isStop ? 'stop' : 'limit' } : null,
            });
          }
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        }
        return;
      }

      const now = Date.now();
      const last = lastTapRef.current;
      const isDoubleTap = (now - last.time) < DOUBLE_TAP_TIME 
                       && Math.hypot(x - last.x, y - last.y) < DOUBLE_TAP_DIST;

      const drawingHit = hitTestDrawings(x, y);
      const tradeHit = !drawingHit ? detectTradeHit(x, y) : null;
      const tradeBodyHit = null;
      const sel = selectedItemRef.current;
      const tradeTargetMatches = (item, hit) => !!item && item.type === 'trade' &&
        item.target === hit.target &&
        (hit.target === 'position' ? item.positionId === hit.positionId :
          hit.target === 'pending' ? item.orderId === hit.orderId : true);

      // Once the position box has been selected with a double-click, a single
      // click-drag on one of its levels edits that level. Entry is intentionally
      // absent from live-position hit testing, so it cannot move after trigger.
      if (tradeHit) {
        // A level grab always starts a drag, even if the user has not selected
        // the tool first. This avoids a dead first click and makes the colored
        // entry/SL/TP boundaries reliably editable.
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        const toolSelection = {
          type: 'trade',
          key: `${tradeHit.target}:${tradeHit.positionId ?? tradeHit.orderId ?? 'draft'}:tool`,
          target: tradeHit.target,
          positionId: tradeHit.positionId,
          orderId: tradeHit.orderId,
          lineType: tradeHit.type,
        };
        selectedItemRef.current = toolSelection;
        setSelectedItem(toolSelection);
        dragRef.current = { type: 'trade', data: tradeHit };
        lockChart(true);
        try { container.setPointerCapture(e.pointerId); } catch (error) {}
        return;
      }

      if (tradeBodyHit) {
        if (isDoubleTap) {
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
          resetTapTimer();
          const toolSelection = {
            type: 'trade',
            key: `${tradeBodyHit.target}:${tradeBodyHit.positionId ?? tradeBodyHit.orderId ?? 'draft'}:tool`,
            target: tradeBodyHit.target,
            positionId: tradeBodyHit.positionId,
            orderId: tradeBodyHit.orderId,
            lineType: 'tool',
          };
          selectedItemRef.current = toolSelection;
          setSelectedItem(toolSelection);
          lockChart(true);
        } else {
          lastTapRef.current = { time: now, x, y };
        }
        return;
      }

      if (sel) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

        if (isDoubleTap) {
          resetTapTimer();
          if (drawingHit && drawingHit.drawingId !== sel.id) {
            setSelectedItem({ type: 'drawing', id: drawingHit.drawingId });
            lockChart(true);
          } else if (tradeHit && sel.type !== 'trade') {
            setSelectedItem({
              type: 'trade',
              key: tradeKey(tradeHit),
              price: tradeHit.price,
              target: tradeHit.target,
              positionId: tradeHit.positionId,
              orderId: tradeHit.orderId,
              lineType: tradeHit.type,
            });
            lockChart(true);
          } else {
            setSelectedItem(null);
            lockChart(false);
          }
          return;
        }

        lastTapRef.current = { time: now, x, y };

        if (sel.type === 'drawing') {
          if (drawingHit && drawingHit.drawingId === sel.id) {
            const drawing = state.drawings.find(d => d.id === sel.id);
            const point = xyToPoint(x, y);
            if (drawing && point) {
              snapshotDrawings();
              dragRef.current = {
                type: 'drawing',
                ...drawingHit,
                startMouse: point,
                originalPoints: drawing.points.map(p => ({ ...p })),
              };
            }
          }
        } else if (sel.type === 'trade') {
          if (tradeHit && tradeKey(tradeHit) === sel.key) {
            dragRef.current = { type: 'trade', data: tradeHit };
          }
        }
        return;
      }

      // An unselected text label remains unselected on a single press so a
      // double-click can select it. Single-click dragging still works.
      if (drawingHit && !isDoubleTap) {
        const hitDrawing = state.drawings.find(d => d.id === drawingHit.drawingId);
        if (hitDrawing?.type === 'text') {
          const point = xyToPoint(x, y);
          if (point) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            snapshotDrawings();
            dragRef.current = {
              type: 'drawing',
              ...drawingHit,
              startMouse: point,
              originalPoints: hitDrawing.points.map(p => ({ ...p })),
            };
            lastTapRef.current = { time: now, x, y };
            return;
          }
        }
      }

      if (isDoubleTap) {
        resetTapTimer();

        if (drawingHit) {
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
          lockChart(true);
          setSelectedItem({ type: 'drawing', id: drawingHit.drawingId });
          return;
        }

        if (tradeHit) {
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
          lockChart(true);
          setSelectedItem({
            type: 'trade',
            key: tradeKey(tradeHit),
            price: tradeHit.price,
            target: tradeHit.target,
            positionId: tradeHit.positionId,
            orderId: tradeHit.orderId,
            lineType: tradeHit.type,
          });
          return;
        }
        return;
      }

      lastTapRef.current = { time: now, x, y };
    };

    const handlePointerMove = (e) => {
      const state = useStore.getState();
      const { x, y } = getLocalXY(e);

      const chartRect = container.getBoundingClientRect();
      const priceAxisWidth = chartRef.current?.priceScale('right').width() || 0;
      if (priceAxisWidth > 0 && e.clientX >= chartRect.right - priceAxisWidth - 8) {
        scheduleDrawRef.current();
      }
      if (state.isPencilMode && currentPencilRef.current) {
        e.preventDefault();
        const stroke = currentPencilRef.current;
        const samples = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
        for (const sample of samples) {
          const local = getLocalXY(sample);
          if (Math.hypot(local.x - stroke.lastScreen.x, local.y - stroke.lastScreen.y) < 1.25) continue;
          const marketPoint = xyToPoint(local.x, local.y);
          if (marketPoint) {
            stroke.points.push(marketPoint);
            stroke.lastScreen = local;
          }
        }
        scheduleDrawRef.current();
        return;
      }

      if (activePointersRef.current.size > 1) return;

      const dx = x - touchDownPosRef.current.x;
      const dy = y - touchDownPosRef.current.y;
      if (activePointersRef.current.size === 1 && Math.hypot(dx, dy) > 25) resetTapTimer();

      if (dragRef.current) {
        e.preventDefault();
        const drag = dragRef.current;
        if (drag.type === 'trade') {
          const price = seriesRef.current?.coordinateToPrice(y);
          if (price != null && Number.isFinite(price)) {
            const d = drag.data;
            if (d.target === 'position') {
              if (d.type === 'sl') state.updatePositionSl(d.positionId, price);
              else if (d.type === 'tp') state.updatePositionTp(d.positionId, price);
            } else if (d.target === 'pending') {
              state.updatePendingOrder(d.orderId, d.type, price);
            } else if (d.target === 'draft' && state.draftPosition) {
              if (d.type === 'entry') {
                const delta = price - Number(state.draftPosition.entry);
                state.updateDraftPosition({
                  entry: price,
                  sl: state.draftPosition.sl == null ? null : Number(state.draftPosition.sl) + delta,
                  tp: state.draftPosition.tp == null ? null : Number(state.draftPosition.tp) + delta,
                });
              } else {
                state.updateDraftPosition({ [d.type]: price });
              }
            }
          }
        } else if (drag.type === 'drawing') {
          const point = xyToPoint(x, y);
          if (point) {
            if (drag.mode === 'drag-point') {
              const newPoints = drag.originalPoints.map((p, i) => i === drag.pointIndex ? point : p);
              state.updateDrawing(drag.drawingId, newPoints);
            } else if (drag.mode === 'drag-body') {
              const dTime = point.time - drag.startMouse.time;
              const dPrice = point.price - drag.startMouse.price;
              const newPoints = drag.originalPoints.map(p => ({
                time: p.time + dTime,
                price: p.price + dPrice,
              }));
              state.updateDrawing(drag.drawingId, newPoints);
            }
          }
        }
        return;
      }

      if (dragDrawRef.current && draftRef.current) {
        const point = xyToPoint(x, y);
        if (point) {
          draftRef.current = {
            ...draftRef.current,
            points: [dragDrawRef.current.startPoint, point],
          };
          scheduleDrawRef.current();
        }
        container.style.cursor = 'crosshair';
        return;
      }

      if (state.activeDrawingTool || state.isDrawingMode || state.isPencilMode) {
        container.style.cursor = 'crosshair';
      }
    };

    const handlePointerUp = (e) => {
      const state = useStore.getState();
      activePointersRef.current.delete(e.pointerId);

      if (state.isPencilMode && currentPencilRef.current) {
        const stroke = currentPencilRef.current;
        const { x, y } = getLocalXY(e);
        if (Math.hypot(x - stroke.lastScreen.x, y - stroke.lastScreen.y) >= 1) {
          const finalPoint = xyToPoint(x, y);
          if (finalPoint) stroke.points.push(finalPoint);
        }
        currentPencilRef.current = null;
        if (stroke.points.length > 1) {
          delete stroke.lastScreen;
          useStore.getState().addPencilStroke(stroke);
        }
        scheduleDrawRef.current();
        return;
      }

      const completedTradeDrag = dragRef.current?.type === 'trade';
      dragRef.current = null;
      if (completedTradeDrag) {
        setSelectedItem(null);
        lockChart(false);
      }

      if (dragDrawRef.current && draftRef.current) {
        const pts = draftRef.current.points;
        const p1 = pointToXY(pts[0]);
        const p2 = pointToXY(pts[1]);
        const moved = p1 && p2 && Math.hypot(p1.x - p2.x, p1.y - p2.y) > 10;
        if (moved) {
          state.addDrawing({
            type: draftRef.current.type,
            points: draftRef.current.points,
          });
          draftRef.current = null;
          state.setActiveDrawingTool(null);
        }
        dragDrawRef.current = null;
      }
    };

    const handleTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      const state = useStore.getState();
      if (state.isPencilMode) return;
      if (selectedItemRef.current || textInput) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      }
    };

    const handleOverlayWheel = () => scheduleDrawRef.current();

    const handleContextMenu = (e) => {
      const state = useStore.getState();
      if (state.activeDrawingTool || state.isPencilMode) return;
      const { x, y } = getLocalXY(e);
      const hit = hitTestDrawings(x, y);
      if (hit) {
        e.preventDefault();
        state.removeDrawing(hit.drawingId);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { capture: true, passive: false });
    container.addEventListener('pointerdown', handlePointerDown, true);
    container.addEventListener('contextmenu', handleContextMenu);
    container.addEventListener('wheel', handleOverlayWheel, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart, { capture: true });
      container.removeEventListener('pointerdown', handlePointerDown, true);
      container.removeEventListener('contextmenu', handleContextMenu);
      container.removeEventListener('wheel', handleOverlayWheel);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [xyToPoint, pointToXY, lockChart, snapshotDrawings, timeToX, textInput]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))) return;
      const state = useStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        state.undoDrawings();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        state.redoDrawings();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItemRef.current?.type === 'drawing') {
        e.preventDefault();
        state.removeDrawing(selectedItemRef.current.id);
        setSelectedItem(null);
        lockChart(false);
        return;
      }
      if (e.key === 'Escape') {
        draftRef.current = null;
        dragDrawRef.current = null;
        setSelectedItem(null);
        setTextInput(null);
        lockChart(false);
        if (state.activeDrawingTool) state.setActiveDrawingTool(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lockChart]);

  useEffect(() => { draftRef.current = null; dragDrawRef.current = null; }, [activeDrawingTool]);

  const visibleData = useMemo(() => {
    if (!rawData[currentIndex]) return [];
    if (Number(timeframe) <= 1) return rawData.slice(0, currentIndex + 1);

    // Show all completed chart-timeframe candles plus the currently forming
    // candle aggregated only from 1m bars reached by the replay cursor.
    const currentBucket = getTimeframeBucketStart(rawData[currentIndex].time, timeframe);
    let lo = 0, hi = displayData.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (Number(displayData[mid].time) < currentBucket) lo = mid + 1;
      else hi = mid;
    }
    const completed = displayData.slice(0, lo);

    let firstInBucket = currentIndex;
    while (firstInBucket > 0 &&
      getTimeframeBucketStart(rawData[firstInBucket - 1].time, timeframe) === currentBucket) {
      firstInBucket--;
    }
    const forming = aggregateData(rawData.slice(firstInBucket, currentIndex + 1), timeframe);
    if (forming.length) completed.push(forming[forming.length - 1]);
    return completed;
  }, [displayData, rawData, currentIndex, timeframe]);

  useEffect(() => {
    if (!seriesRef.current || !lineSeriesRef.current || !chartRef.current) return;
    if (visibleData.length === 0) {
      try {
        seriesRef.current.setData([]);
        lineSeriesRef.current.setData([]);
      } catch (e) {}
      visibleDataRef.current = [];
      lastRenderedDataRef.current = [];
      return;
    }
    
    const timeScale = chartRef.current.timeScale();
    const tfChanged = lastTimeframeRef.current !== timeframe;
    const jumpChanged = lastRecenterRef.current !== recenterToken;
    
    visibleDataRef.current = visibleData;
    const previous = lastRenderedDataRef.current;
    const firstDataLoad = previous.length === 0;
    const canAppend = !tfChanged && !jumpChanged && previous.length > 0 &&
      visibleData.length >= previous.length &&
      visibleData[0]?.time === previous[0]?.time &&
      visibleData[previous.length - 1]?.time === previous[previous.length - 1]?.time;

    if (canAppend) {
      const start = Math.max(0, previous.length - 1);
      for (let i = start; i < visibleData.length; i++) {
        const candle = visibleData[i];
        seriesRef.current.update(candle);
        lineSeriesRef.current.update({ time: candle.time, value: candle.close });
      }
    } else {
      seriesRef.current.setData(visibleData);
      lineSeriesRef.current.setData(visibleData.map(d => ({ time: d.time, value: d.close })));
    }
    lastRenderedDataRef.current = visibleData;

    if (tfChanged || jumpChanged || firstDataLoad) {
      try {
        const container = chartContainerRef.current;
        const chartWidth = container ? container.clientWidth : 800;
        const priceAxisW = chartRef.current.priceScale('right').width();
        const paneWidth = Math.max(100, chartWidth - priceAxisW);
        const targetBarSpacing = 6;
        const visibleBars = Math.max(20, Math.floor(paneWidth / targetBarSpacing));
        const halfBars = Math.floor(visibleBars / 2);
        const len = visibleData.length;
        
        timeScale.applyOptions({ 
          barSpacing: targetBarSpacing,
          rightOffset: halfBars,
          fixLeftEdge: false,
          fixRightEdge: false,
        });
        
        const from = len - 1 - halfBars;
        const to = len - 1 + halfBars;
        timeScale.setVisibleLogicalRange({ from, to });
        
        chartRef.current.priceScale('right').applyOptions({ autoScale: true });
      } catch (e) {
        try { timeScale.fitContent(); } catch (e2) {}
      }
    }

    lastTimeframeRef.current = timeframe;
    lastRecenterRef.current = recenterToken;
  }, [visibleData, timeframe, recenterToken, chartReady]);

  useEffect(() => {
    if (!seriesRef.current) return;
    let rafId;
    const update = () => {
      if (seriesRef.current) {
        const pendPos = pendingOrders.map(o => ({ id: o.id, y: seriesRef.current.priceToCoordinate(o.entryPrice) }))
          .filter(p => p.y !== null && !isNaN(p.y));
        const posBtn = positions.map(p => ({ id: p.id, y: seriesRef.current.priceToCoordinate(p.entryPrice) }))
          .filter(p => p.y !== null && !isNaN(p.y));
        setPendingBtnPos(prev => {
          if (prev.length !== pendPos.length) return pendPos;
          for (let i = 0; i < prev.length; i++) {
            if (prev[i].id !== pendPos[i].id || Math.abs(prev[i].y - pendPos[i].y) > 0.5) return pendPos;
          }
          return prev;
        });
        setPositionBtnPos(prev => {
          if (prev.length !== posBtn.length) return posBtn;
          for (let i = 0; i < prev.length; i++) {
            if (prev[i].id !== posBtn[i].id || Math.abs(prev[i].y - posBtn[i].y) > 0.5) return posBtn;
          }
          return prev;
        });
      }
      rafId = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(rafId);
  }, [pendingOrders, positions]);

  // Entry, SL and TP are displayed only inside the position-tool box.
  // Do not create native price lines: they stretch across the entire chart.
  useEffect(() => {
    if (!seriesRef.current) return;
    linesRef.current.forEach(line => seriesRef.current.removePriceLine(line));
    linesRef.current = [];
  }, [positions, pendingOrders, draftPosition]);

  const commitText = () => {
    if (!textInput || cancelTextEditRef.current) { cancelTextEditRef.current = false; return; }
    const { time, price, value, id } = textInput;
    const state = useStore.getState();
    if (value.trim()) {
      if (id) {
        state.updateDrawing(id, { text: value.trim() });
      } else {
        state.addDrawing({
          type: 'text',
          points: [{ time, price }],
          text: value.trim(),
          fontSize: 14,
          color: '#ffffff',
          borderColor: '#ffffff',
        });
      }
    }
    setTextInput(null);
    state.setActiveDrawingTool(null);
  };

  const currentCandle = visibleData[visibleData.length - 1] || null;
  const candleClock = currentCandle ? toMarketDate(Number(currentCandle.time)) : null;
  const candleHour = candleClock ? candleClock.getUTCHours() : -1;
  const candleSession = candleHour >= 1 && candleHour < 11 ? 'Asian & Sydney' : candleHour >= 11 && candleHour < 16 ? 'London' : 'New York';
  const candleDate = currentCandle ? formatMarketDateTime(Number(currentCandle.time)) : '—';
  const candlePrice = value => Number.isFinite(Number(value)) ? Number(value).toFixed(3) : '—';

  const resetChartView = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || !visibleData.length) return;
    const timeScale = chart.timeScale();
    const width = chartContainerRef.current?.clientWidth || 800;
    const axisWidth = chart.priceScale('right').width();
    const paneWidth = Math.max(120, width - axisWidth);
    const halfBars = Math.max(20, Math.floor(paneWidth / 12));
    const last = visibleData.length - 1;
    const lastCandle = visibleData[last];
    const visiblePrices = visibleData.slice(Math.max(0, last - halfBars), last + 1);
    const high = Math.max(...visiblePrices.map(c => Number(c.high)));
    const low = Math.min(...visiblePrices.map(c => Number(c.low)));
    const center = Number(lastCandle.close);
    const span = Math.max(high - low, Math.abs(center) * 0.0005, 0.0001) * 1.25;
    timeScale.applyOptions({ barSpacing: 6, rightOffset: halfBars, fixLeftEdge: false, fixRightEdge: false });
    timeScale.setVisibleLogicalRange({ from: last - halfBars, to: last + halfBars });
    chart.priceScale('right').applyOptions({ autoScale: false });
    chart.priceScale('right').setVisibleRange({ from: center - span / 2, to: center + span / 2 });
    scheduleDrawRef.current?.();
  }, [visibleData]);

  useEffect(() => {
    const reset = () => resetChartView();
    window.addEventListener('omaxfx:reset-chart', reset);
    window.addEventListener(`omaxfx:reset-chart:${chartId}`, reset);
    return () => {
      window.removeEventListener('omaxfx:reset-chart', reset);
      window.removeEventListener(`omaxfx:reset-chart:${chartId}`, reset);
    };
  }, [resetChartView, chartId]);

  useEffect(() => {
    const chart = chartReady ? chartRef.current : null;
    const canvas = crosshairCanvasRef.current;
    const container = chartContainerRef.current;
    if (!chart || !canvas || !container) return undefined;
    let frame = 0;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    const drawCrosshair = (param) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        if (!param?.point || param.time == null || param.point.x < 0 || param.point.y < 0) return;
        let paneWidth = rect.width, paneHeight = rect.height;
        try {
          paneWidth -= chart.priceScale('right').width();
          paneHeight -= chart.timeScale().height();
        } catch {}
        const x = param.point.x, y = param.point.y;
        if (x > paneWidth || y > paneHeight) return;
        const candle = param.seriesData?.get(seriesRef.current) || param.seriesData?.get(lineSeriesRef.current);
        const price = Number(candle?.close ?? candle?.value);
        const precision = getPricePrecision(useStore.getState().symbol, useStore.getState().contractSpecs);
        const dateLabel = typeof param.time === 'number' ? formatMarketDateTime(param.time) : '';
        ctx.save();
        ctx.strokeStyle = 'rgba(190,198,210,0.78)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, paneHeight); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(paneWidth, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '500 9px Arial';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        if (Number.isFinite(price)) {
          const text = price.toFixed(precision);
          ctx.fillStyle = '#374151';
          ctx.fillRect(paneWidth, y - 7, rect.width - paneWidth, 14);
          ctx.fillStyle = '#f9fafb';
          ctx.fillText(text, paneWidth + (rect.width - paneWidth) / 2, y);
        }
        if (dateLabel) {
          const w = Math.ceil(ctx.measureText(dateLabel).width) + 8;
          const axisHeight = Math.max(18, rect.height - paneHeight);
          const left = Math.max(0, Math.min(paneWidth - w, x - w / 2));
          ctx.fillStyle = '#374151';
          ctx.fillRect(left, paneHeight, w, axisHeight);
          ctx.fillStyle = '#f9fafb';
          ctx.fillText(dateLabel, left + w / 2, paneHeight + axisHeight / 2);
        }
        ctx.restore();
      });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    chart.subscribeCrosshairMove(drawCrosshair);
    return () => {
      cancelAnimationFrame(frame);
      chart.unsubscribeCrosshairMove(drawCrosshair);
      observer.disconnect();
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [chartReady, timeframe, symbol]);

  return (
    <div className="chart-root relative w-full h-full" style={{ backgroundColor: uiTheme === 'light' ? '#f8fafc' : theme.background }}>
      <div ref={chartContainerRef} className="absolute inset-0 chart-no-touch" style={{ zIndex: 1, touchAction: 'none', cursor: isPencilMode ? 'crosshair' : 'default' }} />
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 2 }} />
      <canvas ref={crosshairCanvasRef} className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 25 }} aria-hidden="true" />

      {gameStarted && !chartUiPanelsHidden && <div className="live-information-panel absolute top-2 right-[72px] left-auto z-[10] w-[min(180px,calc(100%-5rem))] rounded-none border-0 p-0 text-[9px] leading-4 text-gray-300 shadow-none pointer-events-auto font-mono" style={{ backgroundColor: uiTheme === 'light' ? '#f8fafc' : theme.background }}>
        <button type="button" onClick={() => setDashboardCollapsed(value => !value)}
          aria-expanded={!dashboardCollapsed}
          className="mb-1 flex w-full items-center justify-between gap-2 rounded text-left hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500">
          <span className="font-sans text-[11px] font-bold tracking-wide text-gray-100">LIVE INFORMATION</span>
          <span className="flex items-center gap-2">
            <span className="font-sans text-[10px] text-blue-400">{{ 1: '1m', 5: '5m', 15: '15m', 30: '30m', 60: '1H', 240: '4H', 1440: '1D', 10080: '1W' }[timeframe] || `${timeframe}m`}</span>
            <ChevronDown size={12} className={dashboardCollapsed ? '' : 'rotate-180'} />
          </span>
        </button>
        {!dashboardCollapsed && <>
          <div className="grid grid-cols-[48px_1fr] gap-x-2 gap-y-0.5">
            <span className="text-gray-500">Open</span><span className="text-right text-white">{candlePrice(currentCandle?.open)}</span>
            <span className="text-gray-500">High</span><span className="text-right text-white">{candlePrice(currentCandle?.high)}</span>
            <span className="text-gray-500">Low</span><span className="text-right text-white">{candlePrice(currentCandle?.low)}</span>
            <span className="text-gray-500">Close</span><span className="text-right text-white">{candlePrice(currentCandle?.close)}</span>
            <span className="text-gray-500">Datetime</span><span className="text-right text-white">{candleDate}</span>
            <span className="text-gray-500">Session</span><span className="text-right text-white">{candleSession}</span>
          </div>
          {htfDashboard && <div className="mt-2 border-t border-[#2a2e39] pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-sans text-[11px] font-bold tracking-wide text-gray-100">{htfDashboard.label} CANDLE</span>
              <span className="font-sans text-[10px] text-blue-400">{htfDashboard.timeframe}</span>
            </div>
            <div className="flex items-center justify-between"><span className="text-gray-500">Range</span><span className="text-white">{htfDashboard.range}</span></div>
            <div className="mt-1 font-sans text-[11px] font-semibold text-green-400">{htfDashboard.countdown} left</div>
          </div>}
          {indicatorDashboard.length > 0 && <div className="mt-2 border-t border-[#2a2e39] pt-2">
            <div className="live-information-indicators-title mb-1 font-sans text-[11px] font-bold tracking-wide">INDICATORS</div>
            <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
              {indicatorDashboard.map(item => (
                <div key={item.key} className="contents">
                  <span className="truncate" style={{ color: item.color }}>{item.label}</span>
                  <span className="text-right text-white tabular-nums">{item.unit === 'pips' ? `${Number(item.value).toFixed(2)} pips` : Number(item.value).toFixed(Number.isInteger(item.decimals) ? item.decimals : 2)}</span>
                </div>
              ))}
            </div>
          </div>}
        </>}
      </div>}

      {isPencilMode && (
        <div 
          className="absolute top-2 right-2 z-30 flex flex-col gap-1.5 bg-[#1e222d]/95 backdrop-blur border border-[#2a2e39] rounded-lg shadow-2xl p-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wide text-center px-1">Pencil</div>
          <div className="grid grid-cols-2 gap-1">
            {PENCIL_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setPencilColor(c)}
                className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${
                  pencilColor === c ? 'border-white' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <div className="text-[8px] text-gray-500 text-center pt-1 border-t border-[#2a2e39]">
            Exit pencil to clear
          </div>
        </div>
      )}

      {selectedItem?.type === 'drawing' && !isPencilMode && (
        <StylePanel selectedId={selectedItem.id} onClose={() => { setSelectedItem(null); lockChart(false); }} />
      )}

      {selectedItem && selectedItem.type === 'drawing' && !isPencilMode && (
        <div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-[#1e222d]/95 backdrop-blur border border-white/20 rounded-lg shadow-2xl p-1 pointer-events-auto">
          <span className="text-[10px] text-white/80 font-bold px-2">✦ Selected</span>
          {useStore.getState().drawings.find(d => d.id === selectedItem.id)?.type === 'text' && (
            <button onClick={() => {
              const drawing = useStore.getState().drawings.find(d => d.id === selectedItem.id);
              const point = drawing?.points?.[0];
              if (!drawing || !point) return;
              const x = timeToX(point.time);
              const y = seriesRef.current?.priceToCoordinate(point.price);
              if (x == null || y == null) return;
              setTextInput({ x, y, time: point.time, price: point.price, value: drawing.text || '', id: drawing.id });
              setSelectedItem(null); lockChart(true);
            }} className="w-7 h-7 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold" title="Edit text">T</button>
          )}
          <button
            onClick={() => { removeDrawing(selectedItem.id); setSelectedItem(null); lockChart(false); }}
            className="w-7 h-7 rounded bg-red-600 hover:bg-red-500 text-white flex items-center justify-center"
            title="Delete drawing"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={() => { setSelectedItem(null); lockChart(false); }}
            className="w-7 h-7 rounded bg-[#2a2e39] hover:bg-[#3a3e49] text-white flex items-center justify-center"
            title="Deselect"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {selectedItem && !isPencilMode && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-[#1e222d]/90 backdrop-blur border border-white/20 px-3 py-1 rounded-full text-[10px] text-white font-bold pointer-events-none shadow-lg">
          <Lock size={10} />
          <span>Locked — double-tap chart to unlock</span>
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
        <div className="pointer-events-auto">
          <DrawingToolbar />
          {!chartUiPanelsHidden && <IndicatorsPanel onHtfDashboard={setHtfDashboard} onIndicatorDashboard={setIndicatorDashboard} chartRef={chartRef} chartReady={chartReady} visibleData={visibleData} displayData={displayData} timeframe={timeframe} priceSeriesRef={seriesRef} liveCandle={rawData[currentIndex] || null} rawData={rawData} currentIndex={currentIndex} />}
        </div>

        {pendingBtnPos.map(p => (
          <button key={`p-${p.id}`} onClick={() => cancelPendingOrder(p.id)}
            style={{ top: p.y, right: X_BUTTON_OFFSET_FROM_RIGHT }}
            className="absolute pointer-events-auto -translate-y-1/2 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-900/50 border border-red-400"
            title="Cancel this order">
            <X size={12} strokeWidth={3.5} />
          </button>
        ))}

        {positionBtnPos.map(p => (
          <button key={`pos-${p.id}`} onClick={() => closePosition(p.id)}
            style={{ top: p.y, right: X_BUTTON_OFFSET_FROM_RIGHT }}
            className="absolute pointer-events-auto -translate-y-1/2 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-900/50 border border-red-400"
            title="Close this position">
            <X size={12} strokeWidth={3.5} />
          </button>
        ))}
      </div>

      {textInput && (
        <div style={{ position: 'absolute', top: textInput.y, left: textInput.x, zIndex: 100 }}>
          <input
            autoFocus
            type="text"
            value={textInput.value}
            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
              if (e.key === 'Escape') { cancelTextEditRef.current = true; e.currentTarget.blur(); setTextInput(null); }
            }}
            onBlur={commitText}
            className="bg-[#1e222d] border-2 border-blue-500 text-white px-2 py-1 text-sm outline-none rounded shadow-xl min-w-[150px]"
            placeholder="Type note..."
          />
        </div>
      )}

    </div>
  );
}