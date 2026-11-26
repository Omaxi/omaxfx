import { useEffect, useLayoutEffect, useRef, useMemo, useState, useCallback } from 'react';
import { createChart, CandlestickSeries, LineSeries, LineStyle } from 'lightweight-charts';
import { useStore } from '../store';
import { getPricePrecision, getPriceTickSize, getPnlMultiplier } from '../utils/instrument';
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
  ctx.setLineDash(isDraft ? [5, 5] : drawing.lineStyle === 'dashed' ? [7, 5] : drawing.lineStyle === 'dotted' ? [2, 4] : []);
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
  } else if (drawing.type === 'arrow' && pts.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    const end = pts[pts.length - 1];
    const before = pts[pts.length - 2];
    const angle = Math.atan2(end.y - before.y, end.x - before.x);
    const headLength = 13;
    const headAngle = Math.PI / 7;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headLength * Math.cos(angle - headAngle), end.y - headLength * Math.sin(angle - headAngle));
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headLength * Math.cos(angle + headAngle), end.y - headLength * Math.sin(angle + headAngle));
    ctx.stroke();
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
    } else if ((drawing.type === 'trendline' || drawing.type === 'arrow') && pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    } else if (pts.length === 2) {
      const x1 = Math.min(pts[0].x, pts[1].x);
      const x2 = Math.max(pts[0].x, pts[1].x);
      const y1 = Math.min(pts[0].y, pts[1].y);
      const y2 = Math.max(pts[0].y, pts[1].y);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      // Selected rectangle resize controls are rendered as DOM buttons above
      // the chart so they stay crisp, white, and reliably pointer-interactive.
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
  const lastCrosshairParamRef = useRef(null);

  const [pendingBtnPos, setPendingBtnPos] = useState([]);
  const [positionBtnPos, setPositionBtnPos] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [drawingHandleTick, setDrawingHandleTick] = useState(0);
  const [chartReady, setChartReady] = useState(false);
  const [startupViewReady, setStartupViewReady] = useState(false);
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
    theme, uiTheme, snapshotDrawings, recenterToken, drawings,
    isPencilMode, pencilColor, setPencilColor,
    chartType, symbol, contractSpecs, sessionTimes, sessionEndTimes, chartOptions
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
        background: { type: 'solid', color: t.background || '#171a27' },
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
      grid: { vertLines: { visible: useStore.getState().chartOptions?.gridVisible ?? true, color: '#202433' }, horzLines: { visible: useStore.getState().chartOptions?.gridVisible ?? true, color: '#202433' } },
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
    // Do not call fitContent here: it briefly pins the first candle to the
    // left before the replay viewport is centered. The data effect and startup
    // layout observer apply the final centered logical range after measurement.
    return () => { resizeObserver.disconnect(); setChartReady(false); chartRef.current.remove(); };
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
    if (!chartRef.current) return;
    try {
      chartRef.current.applyOptions({
        grid: {
          vertLines: { visible: chartOptions?.gridVisible ?? true, color: '#202433' },
          horzLines: { visible: chartOptions?.gridVisible ?? true, color: '#202433' },
        },
      });
    } catch (e) {}
  }, [chartOptions?.gridVisible]);

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
            background: { type: 'solid', color: light ? '#f8fafc' : (useStore.getState().theme?.background || '#171a27') },
            textColor: light ? '#475467' : '#6b7280',
            panes: { separatorColor: light ? '#d0d5dd' : '#2a2e39', separatorHoverColor: '#3b82f6', enableResize: true },
          },
          grid: {
            vertLines: { visible: useStore.getState().chartOptions?.gridVisible ?? true, color: '#202433' },
            horzLines: { visible: useStore.getState().chartOptions?.gridVisible ?? true, color: '#202433' },
          },
        });
      } catch (e) {}
    };
    applyUiTheme();
    window.addEventListener('omaxfx-ui-theme-change', applyUiTheme);
    return () => window.removeEventListener('omaxfx-ui-theme-change', applyUiTheme);
  }, [theme.background]);

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

      // Session shading is rendered only by the Sessions indicator canvas.
      // Keeping one renderer prevents duplicate bands/boxes and color mismatches.

      // Draw Entry / SL / TP as full-width, directly draggable horizontal levels.
      // This is the classic chart-level interaction: users grab the price line
      // anywhere in the chart instead of trying to drag the filled risk box.
      const drawPositionLevels = (tool, target, prefix) => {
        if (!seriesRef.current) return;
        const entry = Number(target === 'draft' ? tool.entry : tool.entryPrice);
        if (!Number.isFinite(entry)) return;
        const long = tool.type === 'buy';
        const precision = getPricePrecision(state.symbol, state.contractSpecs);
        const entryY = seriesRef.current.priceToCoordinate(entry);
        const slY = tool.sl == null ? null : seriesRef.current.priceToCoordinate(Number(tool.sl));
        const tpY = tool.tp == null ? null : seriesRef.current.priceToCoordinate(Number(tool.tp));
        const startTime = Number(tool.startTime ?? tool.openTime ?? state.rawData?.[state.currentIndex]?.time);
        const latestCandle = visibleDataRef.current[visibleDataRef.current.length - 1] ?? state.rawData?.[state.currentIndex];
        const latestTime = Number(latestCandle?.time);
        const livePrice = Number(latestCandle?.close ?? latestCandle?.value);
        const startX = Number.isFinite(startTime) ? timeToX(startTime) : null;
        const endX = Number.isFinite(latestTime) ? timeToX(latestTime) : null;
        if (startX != null && endX != null && Number.isFinite(entryY) && endX > startX) {
          const left = Math.max(0, Math.min(paneW, startX));
          const right = Math.max(0, Math.min(paneW, endX));
          if (right > left) {
            // Keep the TradingView-style risk/reward blocks very subtle at rest.
            // As the live trade moves toward TP or SL, only the relevant zone
            // gains a little opacity so progress is visible without a solid fill.
            const favorableMove = long ? livePrice - entry : entry - livePrice;
            const isLivePosition = target === 'position' && Number.isFinite(livePrice);
            // Base risk/reward zones stay softly visible across the full marker.
            // A second, slightly stronger layer tracks only the live move from
            // entry to the latest candle, using the matching profit/loss color.
            const baseAlpha = 0.10;
            const greenAlpha = baseAlpha;
            const redAlpha = baseAlpha;
            ctx.save();
            if (Number.isFinite(slY)) {
              ctx.fillStyle = `rgba(239, 83, 80, ${redAlpha.toFixed(3)})`;
              ctx.fillRect(left, Math.min(entryY, slY), right - left, Math.max(1, Math.abs(slY - entryY)));
            }
            if (Number.isFinite(tpY)) {
              ctx.fillStyle = `rgba(38, 166, 154, ${greenAlpha.toFixed(3)})`;
              ctx.fillRect(left, Math.min(entryY, tpY), right - left, Math.max(1, Math.abs(tpY - entryY)));
            }
            if (isLivePosition && Number.isFinite(livePrice)) {
              const liveY = seriesRef.current.priceToCoordinate(livePrice);
              if (Number.isFinite(liveY) && Math.abs(liveY - entryY) > 0.5) {
                const inProfit = favorableMove > 0;
                ctx.fillStyle = inProfit
                  ? 'rgba(38, 166, 154, 0.19)'
                  : 'rgba(239, 83, 80, 0.19)';
                ctx.fillRect(left, Math.min(entryY, liveY), right - left, Math.max(1, Math.abs(liveY - entryY)));
              }
            }
            ctx.restore();
          }
        }
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
          ctx.lineWidth = 1;
          // Keep every trade level crisp and unobtrusive, matching the dotted
          // Entry / SL / TP guides in the reference position tool.
          ctx.setLineDash([2, 3]);
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
        // Keep the current unrealized PnL outside the filled position marker.
        if (target === 'position' && Number.isFinite(livePrice) && Number.isFinite(entryY)) {
          const multiplier = Number(getPnlMultiplier(tool.symbol || state.symbol, state.contractSpecs)) || 1;
          const size = Number(tool.size) || 0;
          const unrealizedPnl = (long ? livePrice - entry : entry - livePrice) * multiplier * size + (Number(tool.realizedPnl) || 0);
          const markerTop = Math.min(entryY, Number.isFinite(slY) ? slY : entryY, Number.isFinite(tpY) ? tpY : entryY);
          const markerBottom = Math.max(entryY, Number.isFinite(slY) ? slY : entryY, Number.isFinite(tpY) ? tpY : entryY);
          const pnlY = unrealizedPnl >= 0 ? markerTop - 10 : markerBottom + 10;
          ctx.save();
          ctx.font = 'bold 11px Arial';
          ctx.fillStyle = unrealizedPnl >= 0 ? '#26a69a' : '#ef5350';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
          ctx.shadowBlur = 3;
          const pnlText = `${unrealizedPnl >= 0 ? '+' : '-'}${Math.abs(unrealizedPnl).toFixed(2)}`;
          ctx.fillText(pnlText, Math.max(4, Math.min(paneW - ctx.measureText(pnlText).width - 4, (startX ?? 4) + 4)), Math.max(10, Math.min(paneH - 10, pnlY)));
          ctx.restore();
        }
        // Keep the compact direction / RRR hint at entry, outside the colored zones.
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
        const tradeRisk = Math.abs(Number(trade.entryPrice) - Number(trade.sl));
        const realizedMove = Math.abs(Number(trade.exitPrice) - Number(trade.entryPrice));
        const outcomeProgress = Number.isFinite(tradeRisk) && tradeRisk > 0 && Number.isFinite(realizedMove)
          ? Math.max(0, Math.min(1, realizedMove / tradeRisk)) : 0;
        const resultAlpha = 0.08 + 0.08 * outcomeProgress;
        const resultBgColor = isWin
          ? `rgba(38, 166, 154, ${resultAlpha.toFixed(3)})`
          : `rgba(239, 83, 80, ${resultAlpha.toFixed(3)})`;
        const slBgColor = 'rgba(239, 83, 80, 0.08)';
        const tpBgColor = 'rgba(38, 166, 154, 0.08)';

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

        if (w > 12) {
          ctx.save();
          ctx.fillStyle = resultColor;
          ctx.font = 'bold 10px monospace';
          ctx.textBaseline = 'middle';
          const pnlText = `${trade.pnl >= 0 ? '+' : '-'}${Math.abs(Number(trade.pnl) || 0).toFixed(2)}`;
          const labelY = trade.pnl >= 0 ? minY_Result - 10 : maxY_Result + 10;
          ctx.fillText(pnlText, minX + 5, Math.max(10, Math.min(paneH - 10, labelY)));
          ctx.restore();
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
          state.currentIndex !== previous.currentIndex ||
          state.sessionTimes !== previous.sessionTimes ||
          state.sessionEndTimes !== previous.sessionEndTimes ||
          state.sessionColors !== previous.sessionColors) scheduleDraw();
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

        // A selected rectangle has four visible corner grips. Each grip
        // edits the appropriate time and price anchors independently, so the
        // diagonally opposite corner remains stationary.
        const selectedDrawingId = selectedItemRef.current?.type === 'drawing'
          ? selectedItemRef.current.id : null;
        if (d.type === 'rectangle' && pts.length === 2 && selectedDrawingId === d.id) {
          const leftIndex = pts[0].x <= pts[1].x ? 0 : 1;
          const rightIndex = 1 - leftIndex;
          const topIndex = pts[0].y <= pts[1].y ? 0 : 1;
          const bottomIndex = 1 - topIndex;
          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;
          const handles = [
            { mode: 'resize-corner', corner: 'top-left', x: pts[leftIndex].x, y: pts[topIndex].y, timeIndex: leftIndex, priceIndex: topIndex },
            { mode: 'resize-edge', edge: 'top', x: midX, y: pts[topIndex].y, priceIndex: topIndex },
            { mode: 'resize-corner', corner: 'top-right', x: pts[rightIndex].x, y: pts[topIndex].y, timeIndex: rightIndex, priceIndex: topIndex },
            { mode: 'resize-edge', edge: 'right', x: pts[rightIndex].x, y: midY, timeIndex: rightIndex },
            { mode: 'resize-corner', corner: 'bottom-right', x: pts[rightIndex].x, y: pts[bottomIndex].y, timeIndex: rightIndex, priceIndex: bottomIndex },
            { mode: 'resize-edge', edge: 'bottom', x: midX, y: pts[bottomIndex].y, priceIndex: bottomIndex },
            { mode: 'resize-corner', corner: 'bottom-left', x: pts[leftIndex].x, y: pts[bottomIndex].y, timeIndex: leftIndex, priceIndex: bottomIndex },
            { mode: 'resize-edge', edge: 'left', x: pts[leftIndex].x, y: midY, timeIndex: leftIndex },
          ];
          for (const handle of handles) {
            if (Math.hypot(x - handle.x, y - handle.y) <= 14) {
              return { drawingId: d.id, ...handle };
            }
          }
        }

        if (d.type !== 'rectangle' || selectedDrawingId !== d.id) {
          for (let j = 0; j < pts.length; j++) {
            if (Math.hypot(x - pts[j].x, y - pts[j].y) < HANDLE_TOL) {
              return { drawingId: d.id, mode: 'drag-point', pointIndex: j };
            }
          }
        }
        if (d.type === 'horizontal' && pts[0]) {
          if (Math.abs(y - pts[0].y) < BODY_TOL) return { drawingId: d.id, mode: 'drag-body' };
        } else if (d.type === 'vertical' && pts[0]) {
          if (Math.abs(x - pts[0].x) < BODY_TOL) return { drawingId: d.id, mode: 'drag-body' };
        } else if ((d.type === 'trendline' && pts.length === 2) || (d.type === 'arrow' && pts.length >= 2)) {
          for (let j = 1; j < pts.length; j++) {
            if (distToSegment(x, y, pts[j - 1].x, pts[j - 1].y, pts[j].x, pts[j].y) < BODY_TOL)
              return { drawingId: d.id, mode: 'drag-body' };
          }
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

        if (tool === 'arrow') {
          const now = Date.now();
          const previousTap = lastTapRef.current;
          const isArrowDoubleClick = previousTap.time > 0 &&
            now - previousTap.time <= 400 &&
            Math.hypot(x - previousTap.x, y - previousTap.y) <= 14;
          const fixedPoints = draftRef.current?.fixedPoints || [];
          if (!fixedPoints.length) {
            draftRef.current = { type: 'arrow', fixedPoints: [point], points: [point, point] };
            lastTapRef.current = { time: now, x, y };
          } else if (isArrowDoubleClick) {
            const finalPoints = [...fixedPoints];
            const last = finalPoints[finalPoints.length - 1];
            if (Math.hypot(x - lastTapRef.current.x, y - lastTapRef.current.y) > 3) finalPoints.push(point);
            if (finalPoints.length >= 2) state.addDrawing({ type: 'arrow', points: finalPoints });
            draftRef.current = null;
            lastTapRef.current = { time: 0, x: 0, y: 0 };
            state.setActiveDrawingTool(null);
          } else {
            const last = fixedPoints[fixedPoints.length - 1];
            if (Math.hypot(x - lastTapRef.current.x, y - lastTapRef.current.y) > 3) fixedPoints.push(point);
            draftRef.current = { type: 'arrow', fixedPoints, points: [...fixedPoints, point] };
            lastTapRef.current = { time: now, x, y };
          }
          scheduleDrawRef.current();
          return;
        }

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

      // Rectangles can be moved directly from their filled interior with a
      // single click-drag. Corner hits on an already-selected rectangle are
      // still handled by the selected-item path below as resize-corner.
      if (drawingHit?.mode === 'drag-body') {
        const hitDrawing = state.drawings.find(d => d.id === drawingHit.drawingId);
        if (hitDrawing?.type === 'rectangle') {
          const point = xyToPoint(x, y);
          if (point) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            snapshotDrawings();
            const drawingSelection = { type: 'drawing', id: hitDrawing.id };
            selectedItemRef.current = drawingSelection;
            setSelectedItem(drawingSelection);
            dragRef.current = {
              type: 'drawing',
              drawingType: hitDrawing.type,
              ...drawingHit,
              startMouse: point,
              startScreen: { x, y },
              originalPoints: hitDrawing.points.map(p => ({ ...p })),
            };
            lockChart(true);
            try { container.setPointerCapture(e.pointerId); } catch (error) {}
            lastTapRef.current = { time: now, x, y };
            return;
          }
        }
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
                drawingType: drawing.type,
                ...drawingHit,
                startMouse: point,
                startScreen: { x, y },
                originalPoints: drawing.points.map(p => ({ ...p })),
              };
              try { container.setPointerCapture(e.pointerId); } catch (error) {}
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

      if (state.activeDrawingTool === 'arrow' && draftRef.current?.fixedPoints?.length) {
        const point = xyToPoint(x, y);
        if (point) {
          draftRef.current = {
            ...draftRef.current,
            points: [...draftRef.current.fixedPoints, point],
          };
          scheduleDrawRef.current();
        }
        container.style.cursor = 'crosshair';
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
          let point = xyToPoint(x, y);
          if (point) {
            const shiftSnap = e.shiftKey && drag.drawingType === 'trendline';
            if (drag.mode === 'drag-point') {
              if (shiftSnap && drag.originalPoints.length === 2) {
                // Shift constrains a trendline endpoint to the nearest chart axis:
                // horizontal (same price) or vertical (same timestamp).
                const anchorIndex = drag.pointIndex === 0 ? 1 : 0;
                const anchor = drag.originalPoints[anchorIndex];
                const anchorXY = pointToXY(anchor);
                if (anchorXY) {
                  const dx = x - anchorXY.x;
                  const dy = y - anchorXY.y;
                  point = xyToPoint(Math.abs(dx) >= Math.abs(dy) ? x : anchorXY.x,
                                    Math.abs(dx) >= Math.abs(dy) ? anchorXY.y : y) || point;
                }
              }
              const newPoints = drag.originalPoints.map((p, i) => i === drag.pointIndex ? point : p);
              state.updateDrawing(drag.drawingId, newPoints);
            } else if (drag.mode === 'resize-corner' && drag.drawingType === 'rectangle' &&
                       drag.originalPoints.length === 2) {
              const newPoints = drag.originalPoints.map(p => ({ ...p }));
              newPoints[drag.timeIndex] = { ...newPoints[drag.timeIndex], time: point.time };
              newPoints[drag.priceIndex] = { ...newPoints[drag.priceIndex], price: point.price };
              state.updateDrawing(drag.drawingId, newPoints);
            } else if (drag.mode === 'resize-edge' && drag.drawingType === 'rectangle' &&
                       drag.originalPoints.length === 2) {
              const newPoints = drag.originalPoints.map(p => ({ ...p }));
              if (drag.edge === 'top' || drag.edge === 'bottom') {
                newPoints[drag.priceIndex] = { ...newPoints[drag.priceIndex], price: point.price };
              } else if (drag.edge === 'left' || drag.edge === 'right') {
                newPoints[drag.timeIndex] = { ...newPoints[drag.timeIndex], time: point.time };
              }
              state.updateDrawing(drag.drawingId, newPoints);
            } else if (drag.mode === 'drag-body') {
              let dTime = point.time - drag.startMouse.time;
              let dPrice = point.price - drag.startMouse.price;
              if (shiftSnap && drag.startScreen) {
                // For whole-line moves, Shift locks the translation to X or Y.
                const dx = x - drag.startScreen.x;
                const dy = y - drag.startScreen.y;
                if (Math.abs(dx) >= Math.abs(dy)) dPrice = 0;
                else dTime = 0;
              }
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
        let point = xyToPoint(x, y);
        if (point && e.shiftKey && dragDrawRef.current.tool === 'trendline') {
          const anchor = dragDrawRef.current.startPoint;
          const anchorXY = pointToXY(anchor);
          if (anchorXY) {
            const dx = x - anchorXY.x;
            const dy = y - anchorXY.y;
            point = xyToPoint(Math.abs(dx) >= Math.abs(dy) ? x : anchorXY.x,
                              Math.abs(dx) >= Math.abs(dy) ? anchorXY.y : y) || point;
          }
        }
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

      const selected = selectedItemRef.current;
      if (selected?.type === 'drawing') {
        const selectedDrawing = state.drawings.find(d => d.id === selected.id);
        if (selectedDrawing?.type === 'rectangle') {
          const hit = hitTestDrawings(x, y);
          if (hit?.drawingId === selected.id && hit.mode === 'resize-corner') {
            container.style.cursor = hit.corner === 'top-left' || hit.corner === 'bottom-right'
              ? 'nwse-resize' : 'nesw-resize';
          } else if (hit?.drawingId === selected.id && hit.mode === 'resize-edge') {
            container.style.cursor = hit.edge === 'top' || hit.edge === 'bottom'
              ? 'ns-resize' : 'ew-resize';
          } else if (hit?.drawingId === selected.id) {
            container.style.cursor = 'move';
          } else {
            container.style.cursor = 'default';
          }
        }
      } else if (state.activeDrawingTool || state.isDrawingMode || state.isPencilMode) {
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
        lastTapRef.current = { time: 0, x: 0, y: 0 };
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

  // A new replay session / explicit recenter must be hidden until its
  // measured viewport has been centered. useLayoutEffect prevents one paint
  // with the previous session's left-pinned range.
  useLayoutEffect(() => {
    setStartupViewReady(false);
  }, [recenterToken]);

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

  // Use the exact final candle from the data rendered on the chart. Reading
  // visibleDataRef here caused a one-render lag because that ref is updated by
  // the data effect below, so the dotted last-price line could keep the prior
  // candle's color when the latest candle changed direction.
  useEffect(() => {
    const candle = visibleData[visibleData.length - 1];
    const isUp = candle ? Number(candle.close) >= Number(candle.open) : true;
    const currentColor = isUp ? theme.upBody : theme.downBody;
    const options = {
      priceLineVisible: chartOptions?.lastPriceLineVisible !== false,
      priceLineColor: currentColor,
      priceLineStyle: LineStyle.Dotted,
      priceLineWidth: 1,
      lastValueVisible: true,
    };
    try {
      seriesRef.current?.applyOptions(options);
      lineSeriesRef.current?.applyOptions({ ...options, priceLineColor: currentColor });
    } catch (e) {}
  }, [chartOptions?.lastPriceLineVisible, visibleData, theme]);

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
  const candleSession = (() => {
    const sessions = [
      { key: 'asian', label: 'Asia' },
      { key: 'london', label: 'London' },
      { key: 'newyork', label: 'New York' },
    ];
    return sessions.find(session => candleHour >= Number(sessionTimes?.[session.key] ?? 0) && candleHour < Number(sessionEndTimes?.[session.key] ?? 0))?.label || 'Outside Sessions';
  })();
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

  // Keep the chart hidden during startup until its container has completed
  // its first real measurement. Then apply the exact Reset Chart viewport
  // before revealing it, so users never see the temporary left-pinned frame.
  useEffect(() => {
    if (!chartReady || visibleData.length === 0 || startupViewReady) return undefined;
    const container = chartContainerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return undefined;

    let disposed = false;
    let frameOne = 0;
    let frameTwo = 0;
    const finishInitialLayout = () => {
      if (disposed || startupViewReady) return;
      const rect = container.getBoundingClientRect();
      const timeScaleWidth = chart.timeScale().width();
      if (rect.width < 100 || rect.height < 100 || timeScaleWidth < 100) return;

      frameOne = requestAnimationFrame(() => {
        if (disposed) return;
        // Re-check after the browser has committed the measured chart size.
        const latest = container.getBoundingClientRect();
        if (latest.width < 100 || latest.height < 100) return;
        resetChartView();
        frameTwo = requestAnimationFrame(() => {
          if (!disposed) setStartupViewReady(true);
        });
      });
    };

    const observer = new ResizeObserver(finishInitialLayout);
    observer.observe(container);
    finishInitialLayout();

    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frameOne);
      cancelAnimationFrame(frameTwo);
    };
  }, [chartReady, visibleData.length, startupViewReady, resetChartView, recenterToken]);

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
      lastCrosshairParamRef.current = param;
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
        const crosshairOptions = useStore.getState().chartOptions || {};
        if (crosshairOptions.crosshairVerticalVisible) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, paneHeight); ctx.stroke();
        }
        if (crosshairOptions.crosshairHorizontalVisible) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(paneWidth, y); ctx.stroke();
        }
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
    if (lastCrosshairParamRef.current) drawCrosshair(lastCrosshairParamRef.current);
    return () => {
      cancelAnimationFrame(frame);
      chart.unsubscribeCrosshairMove(drawCrosshair);
      observer.disconnect();
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [chartReady, timeframe, symbol, chartOptions?.crosshairVerticalVisible, chartOptions?.crosshairHorizontalVisible]);

  const selectedRectangleDrawing = selectedItem?.type === 'drawing'
    ? drawings.find(d => d.id === selectedItem.id && d.type === 'rectangle' && d.points?.length === 2)
    : null;

  useEffect(() => {
    if (!selectedRectangleDrawing || !chartRef.current) return;
    const refreshHandles = () => setDrawingHandleTick(value => value + 1);
    const timeScale = chartRef.current.timeScale();
    const priceScale = chartRef.current.priceScale('right');
    timeScale?.subscribeVisibleLogicalRangeChange(refreshHandles);
    priceScale?.subscribeVisiblePriceRangeChange?.(refreshHandles);
    chartRef.current.subscribeSizeChange?.(refreshHandles);
    window.addEventListener('resize', refreshHandles);
    return () => {
      timeScale?.unsubscribeVisibleLogicalRangeChange(refreshHandles);
      priceScale?.unsubscribeVisiblePriceRangeChange?.(refreshHandles);
      chartRef.current?.unsubscribeSizeChange?.(refreshHandles);
      window.removeEventListener('resize', refreshHandles);
    };
  }, [selectedRectangleDrawing?.id, chartReady]);

  return (
    <div className="chart-root relative w-full h-full" style={{ backgroundColor: uiTheme === 'light' ? '#f8fafc' : theme.background, visibility: startupViewReady ? 'visible' : 'hidden' }}>
      <div ref={chartContainerRef} className="absolute inset-0 chart-no-touch" style={{ zIndex: 1, touchAction: 'none', cursor: isPencilMode ? 'crosshair' : 'default' }} />
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 2 }} />
      <canvas ref={crosshairCanvasRef} className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 25 }} aria-hidden="true" />

      {selectedRectangleDrawing && !isPencilMode && (() => {
        const pts = selectedRectangleDrawing.points.map(pointToXY);
        if (pts.some(point => !point)) return null;
        const leftIndex = pts[0].x <= pts[1].x ? 0 : 1;
        const rightIndex = 1 - leftIndex;
        const topIndex = pts[0].y <= pts[1].y ? 0 : 1;
        const bottomIndex = 1 - topIndex;
        const handles = [
          { key: 'top-left', x: pts[leftIndex].x, y: pts[topIndex].y, mode: 'resize-corner', corner: 'top-left', timeIndex: leftIndex, priceIndex: topIndex, cursor: 'nwse-resize' },
          { key: 'top', x: (pts[0].x + pts[1].x) / 2, y: pts[topIndex].y, mode: 'resize-edge', edge: 'top', priceIndex: topIndex, cursor: 'ns-resize' },
          { key: 'top-right', x: pts[rightIndex].x, y: pts[topIndex].y, mode: 'resize-corner', corner: 'top-right', timeIndex: rightIndex, priceIndex: topIndex, cursor: 'nesw-resize' },
          { key: 'right', x: pts[rightIndex].x, y: (pts[0].y + pts[1].y) / 2, mode: 'resize-edge', edge: 'right', timeIndex: rightIndex, cursor: 'ew-resize' },
          { key: 'bottom-right', x: pts[rightIndex].x, y: pts[bottomIndex].y, mode: 'resize-corner', corner: 'bottom-right', timeIndex: rightIndex, priceIndex: bottomIndex, cursor: 'nwse-resize' },
          { key: 'bottom', x: (pts[0].x + pts[1].x) / 2, y: pts[bottomIndex].y, mode: 'resize-edge', edge: 'bottom', priceIndex: bottomIndex, cursor: 'ns-resize' },
          { key: 'bottom-left', x: pts[leftIndex].x, y: pts[bottomIndex].y, mode: 'resize-corner', corner: 'bottom-left', timeIndex: leftIndex, priceIndex: bottomIndex, cursor: 'nesw-resize' },
          { key: 'left', x: pts[leftIndex].x, y: (pts[0].y + pts[1].y) / 2, mode: 'resize-edge', edge: 'left', timeIndex: leftIndex, cursor: 'ew-resize' },
        ];
        return handles.map(handle => (
          <button
            key={handle.key}
            type="button"
            aria-label={`Resize rectangle ${handle.key}`}
            title={`Drag to extend rectangle ${handle.key}`}
            onPointerDown={e => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              const rect = chartContainerRef.current?.getBoundingClientRect();
              if (!rect) return;
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const point = xyToPoint(x, y);
              if (!point) return;
              snapshotDrawings();
              const selection = { type: 'drawing', id: selectedRectangleDrawing.id };
              selectedItemRef.current = selection;
              setSelectedItem(selection);
              lockChart(true);
              dragRef.current = {
                type: 'drawing',
                drawingType: 'rectangle',
                drawingId: selectedRectangleDrawing.id,
                mode: handle.mode,
                edge: handle.edge,
                corner: handle.corner,
                timeIndex: handle.timeIndex,
                priceIndex: handle.priceIndex,
                startMouse: point,
                startScreen: { x, y },
                originalPoints: selectedRectangleDrawing.points.map(p => ({ ...p })),
              };
              try { chartContainerRef.current?.setPointerCapture(e.pointerId); } catch (error) {}
            }}
            style={{
              position: 'absolute',
              left: handle.x,
              top: handle.y,
              width: handle.mode === 'resize-corner' ? 13 : 12,
              height: handle.mode === 'resize-corner' ? 13 : 12,
              transform: 'translate(-50%, -50%)',
              zIndex: 28,
              cursor: handle.cursor,
              background: '#ffffff',
              border: '2px solid #2563eb',
              borderRadius: 3,
              boxShadow: '0 1px 5px rgba(0,0,0,.9)',
              padding: 0,
              touchAction: 'none',
            }}
          />
        ));
      })()}

      {gameStarted && !chartUiPanelsHidden && <div className="live-information-panel absolute top-2 right-[72px] left-auto z-[10] w-[min(230px,calc(100%-5rem))] rounded-lg border border-[#343b49] p-3 text-[9px] leading-4 text-gray-300 shadow-lg pointer-events-auto font-mono" style={{ backgroundColor: uiTheme === 'light' ? '#f8fafc' : theme.background }}>
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
            className="absolute pointer-events-auto -translate-y-1/2 w-5 h-5 rounded-full bg-red-600/30 hover:bg-red-600/40 active:bg-red-600/50 text-red-400 flex items-center justify-center border border-red-500/30 transition-colors"
            title="Cancel this order">
            <X size={12} strokeWidth={2.5} />
          </button>
        ))}

        {positionBtnPos.map(p => (
          <button key={`pos-${p.id}`} onClick={() => closePosition(p.id)}
            style={{ top: p.y, right: X_BUTTON_OFFSET_FROM_RIGHT }}
            className="absolute pointer-events-auto -translate-y-1/2 w-5 h-5 rounded-full bg-red-600/30 hover:bg-red-600/40 active:bg-red-600/50 text-red-400 flex items-center justify-center border border-red-500/30 transition-colors"
            title="Close this position">
            <X size={12} strokeWidth={2.5} />
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