import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { useStore } from '../store';
import { X, Play, Pause, SkipForward } from 'lucide-react';
import DrawingToolbar from './DrawingToolbar';

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

const computeVolumeProfile = (drawing) => {
  const [p1, p2] = drawing.points;
  const timeMin = Math.min(p1.time, p2.time);
  const timeMax = Math.max(p1.time, p2.time);
  const priceMin = Math.min(p1.price, p2.price);
  const priceMax = Math.max(p1.price, p2.price);
  if (priceMax <= priceMin) return null;
  const BUCKETS = 40;
  const bucketSize = (priceMax - priceMin) / BUCKETS;
  const buckets = new Array(BUCKETS).fill(0);
  const data = useStore.getState().displayData;
  for (const c of data) {
    if (c.time < timeMin || c.time > timeMax) continue;
    const candleRange = c.high - c.low;
    const vol = c.volume || 0;
    if (vol <= 0) continue;
    if (candleRange <= 0) {
      const idx = Math.max(0, Math.min(BUCKETS - 1, Math.floor((c.close - priceMin) / bucketSize)));
      buckets[idx] += vol;
      continue;
    }
    for (let i = 0; i < BUCKETS; i++) {
      const bLow = priceMin + i * bucketSize;
      const bHigh = bLow + bucketSize;
      const overlap = Math.max(0, Math.min(c.high, bHigh) - Math.max(c.low, bLow));
      if (overlap > 0) buckets[i] += vol * (overlap / candleRange);
    }
  }
  const maxVol = Math.max(...buckets, 1);
  const pocIdx = buckets.indexOf(maxVol);
  return { buckets, maxVol, priceMin, priceMax, bucketSize, BUCKETS, pocIdx };
};

const drawShape = (ctx, drawing, pointToXY, isDraft, profileCache) => {
  const color = drawing.color || '#f59e0b';
  const pts = drawing.points.map(p => pointToXY(p)).filter(Boolean);
  if (pts.length === 0) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = isDraft ? 1.5 : 2;
  ctx.setLineDash(isDraft ? [5, 5] : []);
  const canvasW = ctx.canvas.width;

  if (drawing.type === 'horizontal') {
    const { y } = pts[0];
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  } else if (drawing.type === 'trendline' && pts.length === 2) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
  } else if (drawing.type === 'rectangle' && pts.length === 2) {
    const x = Math.min(pts[0].x, pts[1].x);
    const y = Math.min(pts[0].y, pts[1].y);
    const w = Math.abs(pts[1].x - pts[0].x);
    const h = Math.abs(pts[1].y - pts[0].y);
    ctx.fillStyle = color + '33';
    ctx.fillRect(x, y, w, h);
  } else if (drawing.type === 'fibonacci' && pts.length === 2) {
    const levels = [0, 0.5, 0.618, 0.764, 1];
    const y1 = pts[0].y, y2 = pts[1].y;
    const x1 = pts[0].x, x2 = pts[1].x;
    const xMin = Math.min(x1, x2);
    const xMax = Math.max(x1, x2);
    ctx.fillStyle = color + '10';
    ctx.fillRect(xMin, Math.min(y1, y2), xMax - xMin, Math.abs(y2 - y1));
    levels.forEach(level => {
      const y = y1 + (y2 - y1) * level;
      const isKey = level === 0.5 || level === 0.618;
      ctx.beginPath();
      ctx.strokeStyle = isKey ? color : color + 'aa';
      ctx.setLineDash(isKey ? [] : [3, 3]);
      ctx.moveTo(xMin, y);
      ctx.lineTo(xMax, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = 'bold 10px monospace';
      const pct = (level * 100).toFixed(1);
      const price = drawing.points[0].price + (drawing.points[1].price - drawing.points[0].price) * level;
      ctx.fillText(`${pct}%  ${price.toFixed(2)}`, xMax + 4, y + 3);
    });
  } else if (drawing.type === 'volumeProfile' && pts.length === 2) {
    const x1 = Math.min(pts[0].x, pts[1].x);
    const x2 = Math.max(pts[0].x, pts[1].x);
    const profile = profileCache.get(drawing);
    if (profile) {
      const { buckets, maxVol, priceMin, bucketSize, BUCKETS, pocIdx } = profile;
      const width = x2 - x1;
      for (let i = 0; i < BUCKETS; i++) {
        const vol = buckets[i];
        if (vol === 0) continue;
        const ratio = vol / maxVol;
        const barWidth = ratio * width;
        const bucketLowPrice = priceMin + i * bucketSize;
        const bucketHighPrice = bucketLowPrice + bucketSize;
        const yLow = pointToXY({ time: drawing.points[0].time, price: bucketLowPrice })?.y;
        const yHigh = pointToXY({ time: drawing.points[0].time, price: bucketHighPrice })?.y;
        if (yLow == null || yHigh == null) continue;
        const barTop = Math.min(yLow, yHigh);
        const barBottom = Math.max(yLow, yHigh);
        if (i === pocIdx) ctx.fillStyle = 'rgba(239, 68, 68, 0.75)';
        else {
          const intensity = 0.25 + ratio * 0.65;
          ctx.fillStyle = `rgba(245, 158, 11, ${intensity})`;
        }
        ctx.fillRect(x1, barTop, barWidth, barBottom - barTop);
      }
      const pocPrice = priceMin + (pocIdx + 0.5) * bucketSize;
      const pocY = pointToXY({ time: drawing.points[0].time, price: pocPrice })?.y;
      if (pocY != null) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, pocY);
        ctx.lineTo(x2, pocY);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('POC', x1 + 4, pocY - 3);
      }
    }
  }
};

export default function Chart() {
  const chartContainerRef = useRef();
  const canvasRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const linesRef = useRef([]);
  const tradeDragRef = useRef(null);
  const drawingDragRef = useRef(null);
  const draftRef = useRef(null);
  const dragDrawRef = useRef(null);
  const profileCacheRef = useRef(new Map());
  const visibleDataRef = useRef([]);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const activePointersRef = useRef(new Set());
  const isUnlockedRef = useRef(false);
  const unlockedDragRef = useRef(null);
  const lastTimeframeRef = useRef(1);

  const [pendingBtnPos, setPendingBtnPos] = useState([]);
  const [positionBtnPos, setPositionBtnPos] = useState([]);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const { 
    rawData, displayData, currentIndex, positions, pendingOrders, 
    draftPosition, timeframe, cancelPendingOrder, closePosition, activeDrawingTool,
    isDrawingMode, isPlaying, togglePlay, stepForward
  } = useStore();

  useEffect(() => {
    if (!chartRef.current) return;
    const isDrawing = !!activeDrawingTool || !!isDrawingMode;
    try {
      chartRef.current.applyOptions({
        handleScroll: !isDrawing,
        handleScale: !isDrawing,
      });
    } catch (e) {}
  }, [activeDrawingTool, isDrawingMode]);

  const timeToX = useCallback((time) => {
    const chart = chartRef.current;
    if (!chart) return null;
    try {
      const x = chart.timeScale().timeToCoordinate(time);
      if (x !== null && Number.isFinite(x)) return x;
    } catch (e) {}
    const data = visibleDataRef.current;
    if (data.length === 0) return null;
    const firstTime = data[0].time;
    const lastTime = data[data.length - 1].time;
    let logical;
    if (time <= firstTime) {
      const step = data.length > 1 ? (data[1].time - data[0].time) : 60;
      logical = (time - firstTime) / (step || 60);
    } else {
      const step = data.length > 1 ? (data[data.length - 1].time - data[data.length - 2].time) : 60;
      logical = (data.length - 1) + (time - lastTime) / (step || 60);
    }
    try { return chart.timeScale().logicalToCoordinate(logical); } catch (e) { return null; }
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
    if (data.length === 0) return null;
    const logical = chart.timeScale().coordinateToLogical(x);
    if (logical == null) return null;
    const firstTime = data[0].time;
    const lastTime = data[data.length - 1].time;
    let time;
    if (logical <= 0) {
      const step = data.length > 1 ? (data[1].time - data[0].time) : 60;
      time = firstTime + logical * (step || 60);
    } else if (logical >= data.length - 1) {
      const step = data.length > 1 ? (data[data.length - 1].time - data[data.length - 2].time) : 60;
      time = lastTime + (logical - (data.length - 1)) * (step || 60);
    } else {
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
    if (!chartContainerRef.current) return;
    chartRef.current = createChart(chartContainerRef.current, {
      layout: { 
        background: { type: 'solid', color: 'transparent' }, 
        textColor: '#d1d4dc',
        fontSize: 9,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      timeScale: { 
        timeVisible: true, 
        secondsVisible: false,
        borderVisible: false,
        barSpacing: 6,
      },
      rightPriceScale: { borderVisible: false },
    });
    seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
      upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      priceLineVisible: false,
      lastValueVisible: true,
    });
    const t = setTimeout(() => {
      try { chartRef.current.timeScale().fitContent(); } catch (e) {}
      window.dispatchEvent(new Event('resize'));
    }, 50);
    return () => { clearTimeout(t); chartRef.current.remove(); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = chartContainerRef.current;
    if (!canvas || !container) return;
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(container);

    let rafId;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let paneW = canvas.width, paneH = canvas.height;
      if (chartRef.current) {
        try {
          const priceAxisW = chartRef.current.priceScale('right').width();
          const timeAxisH = chartRef.current.timeScale().height();
          if (priceAxisW > 0) paneW = canvas.width - priceAxisW;
          if (timeAxisH > 0) paneH = canvas.height - timeAxisH;
        } catch (e) {}
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, paneW, paneH);
      ctx.clip();
      const state = useStore.getState();
      const cache = profileCacheRef.current;
      const alive = new Set(state.drawings);
      for (const key of cache.keys()) if (!alive.has(key)) cache.delete(key);
      state.drawings.forEach(d => {
        if (d.type === 'volumeProfile' && !cache.has(d)) cache.set(d, computeVolumeProfile(d));
        drawShape(ctx, d, pointToXY, false, cache);
      });
      if (draftRef.current) drawShape(ctx, draftRef.current, pointToXY, true, cache);
      ctx.restore();
      rafId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [pointToXY]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    container.style.touchAction = 'none';

    // Hit test for drawing ENDPOINTS only (most precise)
    const hitTestEndpoints = (x, y) => {
      const state = useStore.getState();
      const HANDLE_TOL = 22;
      for (let i = state.drawings.length - 1; i >= 0; i--) {
        const d = state.drawings[i];
        const pts = d.points.map(p => pointToXY(p)).filter(Boolean);
        if (pts.length === 0) continue;
        for (let j = 0; j < pts.length; j++) {
          if (Math.hypot(x - pts[j].x, y - pts[j].y) < HANDLE_TOL) {
            return { drawingId: d.id, mode: 'drag-point', pointIndex: j };
          }
        }
      }
      return null;
    };

    // Hit test for drawing BODIES (lines / rectangle areas)
    const hitTestBodies = (x, y) => {
      const state = useStore.getState();
      const TOL = 14;
      for (let i = state.drawings.length - 1; i >= 0; i--) {
        const d = state.drawings[i];
        const pts = d.points.map(p => pointToXY(p)).filter(Boolean);
        if (pts.length === 0) continue;
        if (d.type === 'horizontal' && pts[0]) {
          if (Math.abs(y - pts[0].y) < TOL) return { drawingId: d.id, mode: 'drag-body' };
        } else if (d.type === 'trendline' && pts.length === 2) {
          if (distToSegment(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) < TOL)
            return { drawingId: d.id, mode: 'drag-body' };
        } else if ((d.type === 'rectangle' || d.type === 'volumeProfile' || d.type === 'fibonacci') && pts.length === 2) {
          const x1 = Math.min(pts[0].x, pts[1].x), x2 = Math.max(pts[0].x, pts[1].x);
          const y1 = Math.min(pts[0].y, pts[1].y), y2 = Math.max(pts[0].y, pts[1].y);
          const onEdge =
            (Math.abs(y - y1) < TOL && x >= x1 - TOL && x <= x2 + TOL) ||
            (Math.abs(y - y2) < TOL && x >= x1 - TOL && x <= x2 + TOL) ||
            (Math.abs(x - x1) < TOL && y >= y1 - TOL && y <= y2 + TOL) ||
            (Math.abs(x - x2) < TOL && y >= y1 - TOL && y <= y2 + TOL);
          const inside = x >= x1 && x <= x2 && y >= y1 && y <= y2;
          if (onEdge || inside) return { drawingId: d.id, mode: 'drag-body' };
        }
      }
      return null;
    };

    const getTol = () => {
      if (!seriesRef.current) return 0;
      const p1 = seriesRef.current.coordinateToPrice(0);
      const p2 = seriesRef.current.coordinateToPrice(15);
      return Math.abs(p1 - p2);
    };

    const detectTradeHit = (price) => {
      const state = useStore.getState();
      const cands = [];
      state.positions.forEach(pos => {
        if (pos.sl != null) cands.push({ target: 'position', positionId: pos.id, type: 'sl', price: pos.sl });
        if (pos.tp != null) cands.push({ target: 'position', positionId: pos.id, type: 'tp', price: pos.tp });
      });
      state.pendingOrders.forEach(order => {
        if (order.entryPrice != null) cands.push({ target: 'pending', orderId: order.id, type: 'entry', price: order.entryPrice });
        if (order.sl != null) cands.push({ target: 'pending', orderId: order.id, type: 'sl', price: order.sl });
        if (order.tp != null) cands.push({ target: 'pending', orderId: order.id, type: 'tp', price: order.tp });
      });
      if (cands.length === 0) return null;
      let closest = cands[0];
      let dist = Math.abs(price - closest.price);
      for (const c of cands) {
        const d = Math.abs(price - c.price);
        if (d < dist) { dist = d; closest = c; }
      }
      return dist > getTol() ? null : closest;
    };

    const getLocalXY = (e) => {
      const rect = container.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const cancelLongPress = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    // ============================================================
    // FIXED: Prioritize drawings (endpoints > trades > bodies)
    // ============================================================
    const tryStartDrag = (x, y) => {
      const state = useStore.getState();
      
      // 1. Drawing ENDPOINTS first
      const endpoint = hitTestEndpoints(x, y);
      if (endpoint) {
        const drawing = state.drawings.find(d => d.id === endpoint.drawingId);
        const point = xyToPoint(x, y);
        if (drawing && point) {
          unlockedDragRef.current = {
            type: 'drawing',
            data: {
              ...endpoint,
              startMouse: point,
              originalPoints: drawing.points.map(p => ({ ...p })),
            },
          };
          return true;
        }
      }

      // 2. Trade lines
      const price = seriesRef.current?.coordinateToPrice(y);
      if (price != null) {
        const tradeHit = detectTradeHit(price);
        if (tradeHit) {
          unlockedDragRef.current = { type: 'trade', data: tradeHit };
          return true;
        }
      }

      // 3. Drawing BODIES last
      const body = hitTestBodies(x, y);
      if (body) {
        const drawing = state.drawings.find(d => d.id === body.drawingId);
        const point = xyToPoint(x, y);
        if (drawing && point) {
          unlockedDragRef.current = {
            type: 'drawing',
            data: {
              ...body,
              startMouse: point,
              originalPoints: drawing.points.map(p => ({ ...p })),
            },
          };
          return true;
        }
      }

      return false;
    };

    const handlePointerDown = (e) => {
      if (e.button === 2) return;
      activePointersRef.current.add(e.pointerId);

      if (activePointersRef.current.size > 1) {
        cancelLongPress();
        isUnlockedRef.current = false;
        setIsUnlocked(false);
        unlockedDragRef.current = null;
        return;
      }

      const state = useStore.getState();
      const { x, y } = getLocalXY(e);
      startPosRef.current = { x, y };
      longPressTriggeredRef.current = false;

      // 1. Drawing tool active
      if (state.activeDrawingTool) {
        const point = xyToPoint(x, y);
        if (!point) return;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

        const tool = state.activeDrawingTool;
        if (tool === 'horizontal') {
          state.addDrawing({ type: 'horizontal', points: [point], color: '#f59e0b' });
          state.setActiveDrawingTool(null);
          return;
        }
        if (draftRef.current && !dragDrawRef.current) {
          state.addDrawing({
            type: draftRef.current.type,
            points: [draftRef.current.points[0], point],
            color: '#f59e0b',
          });
          draftRef.current = null;
          state.setActiveDrawingTool(null);
          return;
        }
        dragDrawRef.current = { tool, startPoint: point };
        draftRef.current = { type: tool, points: [point, point], color: '#f59e0b' };
        return;
      }

      // 2. Long/Short position drawing
      if (state.isDrawingMode && seriesRef.current) {
        const price = seriesRef.current.coordinateToPrice(y);
        if (price != null) {
          state.setDraftPrice(price);
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        }
        return;
      }

      // 3. Already unlocked → immediate drag
      if (isUnlockedRef.current) {
        tryStartDrag(x, y);
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        return;
      }

      // 4. Start long-press timer to unlock
      longPressTimerRef.current = setTimeout(() => {
        isUnlockedRef.current = true;
        setIsUnlocked(true);
        longPressTriggeredRef.current = true;
        tryStartDrag(startPosRef.current.x, startPosRef.current.y);
      }, 600);
    };

    const handlePointerMove = (e) => {
      const { x, y } = getLocalXY(e);

      if (longPressTimerRef.current) {
        const dx = x - startPosRef.current.x;
        const dy = y - startPosRef.current.y;
        if (Math.hypot(dx, dy) > 10) cancelLongPress();
      }

      if (isUnlockedRef.current) {
        e.preventDefault();
        const state = useStore.getState();
        const drag = unlockedDragRef.current;
        if (drag) {
          if (drag.type === 'trade') {
            const price = seriesRef.current?.coordinateToPrice(y);
            if (price != null) {
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
              const inter = drag.data;
              if (inter.mode === 'drag-point') {
                const newPoints = inter.originalPoints.map((p, i) => i === inter.pointIndex ? point : p);
                state.updateDrawing(inter.drawingId, newPoints);
              } else if (inter.mode === 'drag-body') {
                const dTime = point.time - inter.startMouse.time;
                const dPrice = point.price - inter.startMouse.price;
                const newPoints = inter.originalPoints.map(p => ({
                  time: p.time + dTime,
                  price: p.price + dPrice,
                }));
                state.updateDrawing(inter.drawingId, newPoints);
              }
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
        }
        container.style.cursor = 'crosshair';
        return;
      }

      if (state.activeDrawingTool || state.isDrawingMode) {
        container.style.cursor = 'crosshair';
        return;
      }
      const state = useStore.getState();
      const hit = hitTestEndpoints(x, y) || hitTestBodies(x, y);
      if (hit && isUnlockedRef.current) {
        container.style.cursor = hit.mode === 'drag-point' ? 'grab' : 'move';
      } else {
        const p = seriesRef.current?.coordinateToPrice(y);
        const tradeHit = p != null ? detectTradeHit(p) : null;
        container.style.cursor = (tradeHit && isUnlockedRef.current) ? 'ns-resize' : 'default';
      }
    };

    const handlePointerUp = (e) => {
      activePointersRef.current.delete(e.pointerId);
      cancelLongPress();
      isUnlockedRef.current = false;
      setIsUnlocked(false);
      unlockedDragRef.current = null;
      drawingDragRef.current = null;
      tradeDragRef.current = null;

      if (dragDrawRef.current && draftRef.current) {
        const state = useStore.getState();
        const pts = draftRef.current.points;
        const p1 = pointToXY(pts[0]);
        const p2 = pointToXY(pts[1]);
        const moved = p1 && p2 && Math.hypot(p1.x - p2.x, p1.y - p2.y) > 10;
        if (moved) {
          state.addDrawing({
            type: draftRef.current.type,
            points: draftRef.current.points,
            color: '#f59e0b',
          });
          draftRef.current = null;
          state.setActiveDrawingTool(null);
        }
        dragDrawRef.current = null;
      }

      const state = useStore.getState();
      container.style.cursor = (state.activeDrawingTool || state.isDrawingMode) ? 'crosshair' : 'default';
    };

    const handleContextMenu = (e) => {
      const state = useStore.getState();
      if (state.activeDrawingTool) return;
      const { x, y } = getLocalXY(e);
      const hit = hitTestEndpoints(x, y) || hitTestBodies(x, y);
      if (hit) {
        e.preventDefault();
        state.removeDrawing(hit.drawingId);
      }
    };

    container.addEventListener('pointerdown', handlePointerDown, true);
    container.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      cancelLongPress();
      container.removeEventListener('pointerdown', handlePointerDown, true);
      container.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [xyToPoint, pointToXY]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        const state = useStore.getState();
        draftRef.current = null;
        dragDrawRef.current = null;
        isUnlockedRef.current = false;
        setIsUnlocked(false);
        if (state.activeDrawingTool) state.setActiveDrawingTool(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { draftRef.current = null; dragDrawRef.current = null; }, [activeDrawingTool]);

  const visibleData = useMemo(() => {
    if (!rawData[currentIndex] || displayData.length === 0) return [];
    const currentRawTime = rawData[currentIndex].time;
    const currentRawClose = rawData[currentIndex].close;
    let filtered = displayData.filter(c => c.time <= currentRawTime);

    if (timeframe > 1 && filtered.length > 0) {
      const last = filtered[filtered.length - 1];
      const blockEnd = last.time + timeframe * 60;
      if (currentRawTime < blockEnd) {
        const rawInBlock = [];
        for (let i = currentIndex; i >= 0; i--) {
          if (rawData[i].time < last.time) break;
          rawInBlock.unshift(rawData[i]);
        }
        if (rawInBlock.length > 0) {
          filtered = filtered.slice(0, -1);
          filtered.push({
            time: last.time,
            open: rawInBlock[0].open,
            high: Math.max(...rawInBlock.map(c => c.high)),
            low: Math.min(...rawInBlock.map(c => c.low)),
            close: currentRawClose,
            volume: rawInBlock.reduce((s, c) => s + (c.volume || 0), 0),
          });
        }
      }
    }
    return filtered;
  }, [displayData, rawData, currentIndex, timeframe]);

  // ============================================================
  // FIXED: On TF switch, reset zoom to show last ~150 candles
  // at consistent width. Prevents candles from becoming huge.
  // ============================================================
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    if (visibleData.length === 0) return;

    const timeScale = chartRef.current.timeScale();
    const tfChanged = lastTimeframeRef.current !== timeframe;

    visibleDataRef.current = visibleData;
    seriesRef.current.setData(visibleData);

    if (tfChanged) {
      const len = visibleData.length;
      const windowSize = Math.min(150, len);
      const from = Math.max(0, len - windowSize);
      const to = len - 1;
      try {
        timeScale.setVisibleLogicalRange({ from, to });
        // Reset bar spacing to keep candles readable
        timeScale.applyOptions({ barSpacing: 6 });
      } catch (e) {
        try { timeScale.fitContent(); } catch (e2) {}
      }
    }

    lastTimeframeRef.current = timeframe;
  }, [visibleData, timeframe]);

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
      addLine(order.entryPrice, '#facc15', label, 3, 2);
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

  return (
    <div 
      className="relative w-full h-full"
      style={{ backgroundColor: '#0b0e11' }}
    >
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 pointer-events-none"
        style={{ width: '100%', height: '100%', zIndex: 0 }}
      />

      <div 
        ref={chartContainerRef} 
        className="absolute inset-0 chart-no-touch"
        style={{ 
          zIndex: 1, 
          touchAction: 'none',
          boxShadow: isUnlocked ? 'inset 0 0 0 2px rgba(59, 130, 246, 0.7)' : 'none',
          transition: 'box-shadow 0.15s ease',
        }}
      />

      {isUnlocked && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-blue-600/90 backdrop-blur px-2 py-0.5 rounded text-[10px] text-white font-bold pointer-events-none">
          🔓 Move Mode
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
        <div className="pointer-events-auto">
          <DrawingToolbar />
        </div>

        {pendingBtnPos.map(p => (
          <button
            key={`p-${p.id}`}
            onClick={() => cancelPendingOrder(p.id)}
            style={{ top: p.y, right: 60 }}
            className="absolute pointer-events-auto -translate-y-1/2 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-900/50 border border-red-400"
            title="Cancel this order"
          >
            <X size={12} strokeWidth={3.5} />
          </button>
        ))}

        {positionBtnPos.map(p => (
          <button
            key={`pos-${p.id}`}
            onClick={() => closePosition(p.id)}
            style={{ top: p.y, right: 60 }}
            className="absolute pointer-events-auto -translate-y-1/2 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-900/50 border border-red-400"
            title="Close this position"
          >
            <X size={12} strokeWidth={3.5} />
          </button>
        ))}
      </div>

      <div className="absolute bottom-3 right-3 z-30 flex items-end gap-2 pointer-events-auto">
        <button 
          onClick={togglePlay}
          className="w-12 h-12 rounded-full bg-[#1e222d] hover:bg-[#2a2e39] border-2 border-[#2a2e39] text-white flex items-center justify-center shadow-2xl shadow-black/60 active:scale-95 transition-transform"
          title={isPlaying ? 'Pause' : 'Auto-play'}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button 
          onClick={stepForward}
          className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-2xl shadow-blue-900/60 active:scale-95 transition-transform border-2 border-blue-500"
          title="Step forward"
        >
          <SkipForward size={30} />
        </button>
      </div>
    </div>
  );
}