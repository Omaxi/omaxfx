import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { useStore } from '../store';
import { X, Play, Pause, SkipForward, Trash2, Lock, Maximize2 } from 'lucide-react';
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
  const borderColor = drawing.borderColor || drawing.color || '#f59e0b';
  const fillColor = drawing.fillColor || (borderColor + '33');
  const lineWidth = drawing.lineWidth ?? 1;
  const showBorder = drawing.showBorder !== false;
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
    if (showBorder) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasW, y);
      ctx.stroke();
    }
  } else if (drawing.type === 'vertical') {
    const { x } = pts[0];
    if (showBorder) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasH);
      ctx.stroke();
    }
  } else if (drawing.type === 'trendline' && pts.length === 2) {
    if (showBorder) {
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
      ctx.fillText(`${pct}%  ${price.toFixed(2)}`, xMax + 4, y + 3);
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
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
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

export default function Chart() {
  const chartContainerRef = useRef();
  const canvasRef = useRef();
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
  const cancelTextEditRef = useRef(false);

  const { 
    rawData, displayData, currentIndex, positions, pendingOrders, 
    draftPosition, timeframe, cancelPendingOrder, closePosition, activeDrawingTool,
    isDrawingMode, isPlaying, togglePlay, stepForward, removeDrawing, gameStarted,
    theme, snapshotDrawings, recenterToken,
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
    
    chartRef.current = createChart(chartContainerRef.current, {
      layout: { 
        background: { type: 'solid', color: 'transparent' },
        textColor: '#d1d4dc',
        fontSize: 9,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      timeScale: { 
        timeVisible: true, secondsVisible: false,
        borderVisible: false, barSpacing: 6, rightOffset: 60,
      },
      rightPriceScale: { borderVisible: false },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(128,128,128,0.5)', width: 1, style: 3, visible: true,
          labelVisible: true, labelBackgroundColor: 'rgba(128,128,128,0.5)',
        },
        horzLine: {
          color: 'rgba(128,128,128,0.5)', width: 1, style: 3, visible: true,
          labelVisible: true, labelBackgroundColor: 'rgba(128,128,128,0.5)',
        },
      },
    });

    setChartReady(true);

    // Per-symbol price format at init: EURUSD gets 4 decimals, others get 2.
    const initialState = useStore.getState();
    const initialSpec = initialState.contractSpecs?.[initialState.symbol];
    const initialPrecision = initialSpec?.precision ?? (initialState.symbol === 'EURUSD' ? 4 : 2);
    const initialMinMove = initialSpec?.tickSize ?? (initialState.symbol === 'EURUSD' ? 0.0001 : 0.01);

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

    const timer = setTimeout(() => {
      try { chartRef.current.timeScale().fitContent(); } catch (e) {}
      window.dispatchEvent(new Event('resize'));
    }, 50);
    return () => { clearTimeout(timer); setChartReady(false); chartRef.current.remove(); };
  }, []);

  // Update price format when the active symbol changes.
  // EURUSD shows 4 decimals (e.g. 1.1212), XAUUSD shows 2 (e.g. 1916.62).
  useEffect(() => {
    if (!seriesRef.current || !lineSeriesRef.current) return;
    const spec = useStore.getState().contractSpecs?.[symbol];
    const precision = spec?.precision ?? (symbol === 'EURUSD' ? 4 : 2);
    const minMove = spec?.tickSize ?? (symbol === 'EURUSD' ? 0.0001 : 0.01);
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
    const tf = useStore.getState().timeframe;
    const step = tf * 60;
    const firstTime = data[0].time;
    const lastTime = data[data.length - 1].time;
    let logical;
    if (time <= firstTime) logical = (time - firstTime) / step;
    else if (time >= lastTime) logical = (data.length - 1) + (time - lastTime) / step;
    else {
      let lo = 0, hi = data.length - 1;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (data[mid].time < time) lo = mid; else hi = mid;
      }
      const t1 = data[lo].time, t2 = data[hi].time;
      const frac = t2 !== t1 ? (time - t1) / (t2 - t1) : 0;
      logical = lo + frac;
    }
    try {
      const x = chart.timeScale().logicalToCoordinate(logical);
      return (x === null || !Number.isFinite(x)) ? null : x;
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

      // 2. Draw user drawings
      const sel = selectedItemRef.current;
      const selectedId = sel?.type === 'drawing' ? sel.id : null;
      state.drawings.forEach(d => {
        if (d.symbol && d.symbol !== state.symbol) return;
        drawShape(ctx, d, pointToXY, false, d.id === selectedId);
      });
      if (draftRef.current) drawShape(ctx, draftRef.current, pointToXY, true, false);

      // 3. Draw pencil strokes
      state.pencilStrokes.forEach(s => drawPencilStroke(ctx, s, pointToXY));
      if (currentPencilRef.current) drawPencilStroke(ctx, currentPencilRef.current, pointToXY);

      // 4. Draw selected trade line indicator
      if (sel?.type === 'trade' && seriesRef.current) {
        let livePrice = null;
        if (sel.target === 'position') {
          const pos = state.positions.find(p => p.id === sel.positionId);
          if (pos) {
            if (sel.lineType === 'sl') livePrice = pos.sl;
            else if (sel.lineType === 'tp') livePrice = pos.tp;
          }
        } else if (sel.target === 'pending') {
          const order = state.pendingOrders.find(o => o.id === sel.orderId);
          if (order) {
            if (sel.lineType === 'entry') livePrice = order.entryPrice;
            else if (sel.lineType === 'sl') livePrice = order.sl;
            else if (sel.lineType === 'tp') livePrice = order.tp;
          }
        }
        if (livePrice != null) {
          const y = seriesRef.current.priceToCoordinate(livePrice);
          if (y != null && Number.isFinite(y)) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(paneW, y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      ctx.restore();
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
          state.timeframe !== previous.timeframe ||
          state.symbol !== previous.symbol ||
          state.currentIndex !== previous.currentIndex) scheduleDraw();
    });
    const timeScale = chartRef.current?.timeScale();
    timeScale?.subscribeVisibleLogicalRangeChange(scheduleDraw);
    draw();
    return () => {
      disposed = true;
      scheduleDrawRef.current = () => {};
      if (rafId !== null) cancelAnimationFrame(rafId);
      unsubscribeStore();
      timeScale?.unsubscribeVisibleLogicalRangeChange(scheduleDraw);
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
        const pts = d.points.map(p => pointToXY(p)).filter(Boolean);
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
      const PIXEL_TOL = 28;
      const candidates = [];
      state.positions.forEach(pos => {
        if (pos.sl != null) {
          const lineY = seriesRef.current.priceToCoordinate(pos.sl);
          if (lineY != null && Number.isFinite(lineY)) candidates.push({ target: 'position', positionId: pos.id, type: 'sl', price: pos.sl, lineY });
        }
        if (pos.tp != null) {
          const lineY = seriesRef.current.priceToCoordinate(pos.tp);
          if (lineY != null && Number.isFinite(lineY)) candidates.push({ target: 'position', positionId: pos.id, type: 'tp', price: pos.tp, lineY });
        }
      });
      state.pendingOrders.forEach(order => {
        if (order.entryPrice != null) {
          const lineY = seriesRef.current.priceToCoordinate(order.entryPrice);
          if (lineY != null && Number.isFinite(lineY)) candidates.push({ target: 'pending', orderId: order.id, type: 'entry', price: order.entryPrice, lineY });
        }
        if (order.sl != null) {
          const lineY = seriesRef.current.priceToCoordinate(order.sl);
          if (lineY != null && Number.isFinite(lineY)) candidates.push({ target: 'pending', orderId: order.id, type: 'sl', price: order.sl, lineY });
        }
        if (order.tp != null) {
          const lineY = seriesRef.current.priceToCoordinate(order.tp);
          if (lineY != null && Number.isFinite(lineY)) candidates.push({ target: 'pending', orderId: order.id, type: 'tp', price: order.tp, lineY });
        }
      });
      if (candidates.length === 0) return null;
      let closest = null, closestDist = Infinity;
      for (const c of candidates) {
        const d = Math.abs(y - c.lineY);
        if (d < closestDist) { closestDist = d; closest = c; }
      }
      if (closestDist > PIXEL_TOL) return null;
      return closest;
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
          state.setDraftPrice(price);
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

      const sel = selectedItemRef.current;

      if (sel) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

        if (isDoubleTap) {
          resetTapTimer();
          setSelectedItem(null);
          lockChart(false);
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

      if (drawingHit && !sel) {
        const hitDrawing = state.drawings.find(d => d.id === drawingHit.drawingId);
        if (hitDrawing) {
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
          lockChart(true);
          setSelectedItem({ type: 'drawing', id: hitDrawing.id });
          lastTapRef.current = { time: now, x, y };
          return;
        }
      }

      if (isDoubleTap) {
        resetTapTimer();

        if (drawingHit) {
          const drawing = state.drawings.find(d => d.id === drawingHit.drawingId);
          if (drawing && drawing.type === 'text') {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            const point = drawing.points[0];
            const x = timeToX(point.time);
            const y = seriesRef.current?.priceToCoordinate(point.price);
            if (x != null && y != null) {
              lockChart(true);
              setTextInput({ x, y, time: point.time, price: point.price, value: drawing.text, id: drawing.id });
              setSelectedItem(null);
              return;
            }
          }
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

      dragRef.current = null;

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
    if (!rawData[currentIndex] || displayData.length === 0) return [];
    const currentRawTime = rawData[currentIndex].time;
    let filtered = displayData.filter(c => c.time <= currentRawTime);

    if (timeframe > 1 && filtered.length > 0) {
      const last = filtered[filtered.length - 1];
      const blockEnd = last.time + timeframe * 60;
      if (currentRawTime < blockEnd) {
        filtered = filtered.slice(0, -1);
      }
    }
    return filtered;
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

    if (tfChanged || jumpChanged) {
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
  }, [visibleData, timeframe, recenterToken]);

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

  useEffect(() => {
    if (!seriesRef.current) return;
    linesRef.current.forEach(line => seriesRef.current.removePriceLine(line));
    linesRef.current = [];
    const addLine = (price, color, title, lineStyle = 2, lineWidth = 2) => {
      if (price == null) return;
      const line = seriesRef.current.createPriceLine({
        price: Number(price), color, lineWidth, lineStyle, axisLabelVisible: true, title,
      });
      linesRef.current.push(line);
    };
    positions.forEach(pos => {
      const rrr = calcRRR(pos.entryPrice, pos.sl, pos.tp);
      const dirLabel = pos.type === 'buy' ? 'BUY' : 'SELL';
      addLine(pos.entryPrice, pos.type === 'buy' ? '#4ade80' : '#f87171', `${dirLabel} · RRR ${rrr || '-'}`, 0, 1);
      addLine(pos.sl, '#ef5350', 'SL', 2, 2);
      addLine(pos.tp, '#26a69a', 'TP', 2, 2);
    });
    pendingOrders.forEach(order => {
      const rrr = calcRRR(order.entryPrice, order.sl, order.tp);
      const label = `${order.type === 'buy' ? 'Buy' : 'Sell'} ${order.orderType}${rrr ? ` · RRR ${rrr}` : ''}`;
      addLine(order.entryPrice, '#facc15', label, 3, 1);
      addLine(order.sl, '#ef5350', 'SL', 2, 1);
      addLine(order.tp, '#26a69a', 'TP', 2, 1);
    });
    if (draftPosition) {
      const rrr = calcRRR(draftPosition.entry, draftPosition.sl, draftPosition.tp);
      addLine(draftPosition.entry, '#3b82f6', `DRAFT${rrr ? ` · RRR ${rrr}` : ''}`, 1, 2);
      addLine(draftPosition.sl, '#ef5350', 'DRAFT SL', 1, 2);
      addLine(draftPosition.tp, '#26a69a', 'DRAFT TP', 1, 2);
    }
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

  return (
    <div className="relative w-full h-full" style={{ backgroundColor: theme.background }}>
      <div ref={chartContainerRef} className="absolute inset-0 chart-no-touch" style={{ zIndex: 1, touchAction: 'none', cursor: isPencilMode ? 'crosshair' : 'default' }} />
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 2 }} />

      <button onClick={() => {
        const chart = chartRef.current;
        if (!chart || !visibleData.length) return;
        const timeScale = chart.timeScale();
        const width = chartContainerRef.current?.clientWidth || 800;
        const axisWidth = chart.priceScale('right').width();
        const halfBars = Math.max(25, Math.floor(Math.max(100, width - axisWidth) / 12));
        const last = visibleData.length - 1;
        timeScale.applyOptions({ barSpacing: 6, rightOffset: 60 });
        timeScale.setVisibleLogicalRange({ from: Math.max(0, last - halfBars), to: last + halfBars });
        chart.priceScale('right').applyOptions({ autoScale: true });
        scheduleDrawRef.current();
      }} title="Reset chart zoom and candle size" className="absolute top-2 right-2 z-30 flex h-7 w-7 items-center justify-center rounded-md border border-[#2a2e39] bg-[#131722]/90 text-gray-300 shadow hover:bg-[#2a2e39] hover:text-white"><Maximize2 size={13}/></button>

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
          <IndicatorsPanel chartRef={chartRef} chartReady={chartReady} visibleData={visibleData} timeframe={timeframe} />
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

      <div className="absolute bottom-3 right-3 z-30 flex items-end gap-2 pointer-events-auto">
        <button onClick={togglePlay}
          className="w-12 h-12 rounded-full bg-[#1e222d] hover:bg-[#2a2e39] border-2 border-[#2a2e39] text-white flex items-center justify-center shadow-2xl shadow-black/60 active:scale-95 transition-transform">
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button onClick={stepForward}
          className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-2xl shadow-blue-900/60 active:scale-95 transition-transform border-2 border-blue-500">
          <SkipForward size={30} />
        </button>
      </div>
    </div>
  );
}