import { useEffect, useRef, useState } from 'react';
import { Minus, MoveVertical, Square, Type, Layers, Undo2, Trash2 } from 'lucide-react';
import { useStore } from '../store';

const EMPTY_DRAWINGS = [];

const TOOLS = [
  { key: 'horizontal', title: 'Horizontal line', Icon: Minus },
  { key: 'vertical', title: 'Vertical line', Icon: MoveVertical },
  { key: 'trendline', title: 'Trendline', Icon: null },
  { key: 'rectangle', title: 'Rectangle', Icon: Square },
  { key: 'fibonacci', title: 'Fibonacci', Icon: Layers },
  { key: 'text', title: 'Text note', Icon: Type },
];

export default function MiniChartDrawingLayer({ chartRef, seriesRef, chartReady, chartId, candles = EMPTY_DRAWINGS, timeframe = 1 }) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [tool, setTool] = useState(null);
  const drawings = useStore(state => state.chartDrawings?.[chartId] ?? EMPTY_DRAWINGS);
  const drawingStyles = useStore(state => state.drawingStyles);
  const setDrawings = update => {
    const current = useStore.getState().chartDrawings?.[chartId] || [];
    useStore.getState().setChartDrawings(chartId, typeof update === 'function' ? update(current) : update);
  };
  const [draft, setDraft] = useState(null);

  // Convert through logical bar coordinates rather than coordinateToTime().
  // coordinateToTime() returns null in the blank/future area to the right of
  // the latest candle, which previously made drawings impossible there.
  const toPoint = (x, y) => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const data = candles || [];
    if (!chart || !series || data.length === 0) return null;
    const logical = chart.timeScale().coordinateToLogical(x);
    const price = series.coordinateToPrice(y);
    if (logical == null || price == null || !Number.isFinite(Number(price))) return null;
    const step = Math.max(1, Number(timeframe) || 1) * 60;
    const firstTime = Number(data[0].time);
    const lastTime = Number(data[data.length - 1].time);
    let time;
    if (logical <= 0) {
      time = firstTime + logical * step;
    } else if (logical >= data.length - 1) {
      time = lastTime + (logical - (data.length - 1)) * step;
    } else {
      const lo = Math.floor(logical);
      const hi = Math.min(lo + 1, data.length - 1);
      const fraction = logical - lo;
      time = Number(data[lo].time) + (Number(data[hi].time) - Number(data[lo].time)) * fraction;
    }
    return Number.isFinite(time) ? { time, price: Number(price) } : null;
  };

  const toXY = point => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const data = candles || [];
    if (!chart || !series || data.length === 0) return null;
    const timeScale = chart.timeScale();
    const step = Math.max(1, Number(timeframe) || 1) * 60;
    const targetTime = Number(point.time);
    let logical;
    if (data.length === 1) {
      logical = (targetTime - Number(data[0].time)) / step;
    } else {
      let lo = 0, hi = data.length - 1;
      if (targetTime <= Number(data[0].time)) {
        logical = (targetTime - Number(data[0].time)) / step;
      } else if (targetTime >= Number(data[hi].time)) {
        logical = hi + (targetTime - Number(data[hi].time)) / step;
      } else {
        while (hi - lo > 1) {
          const mid = Math.floor((lo + hi) / 2);
          if (Number(data[mid].time) < targetTime) lo = mid;
          else hi = mid;
        }
        const t1 = Number(data[lo].time), t2 = Number(data[hi].time);
        logical = lo + (hi - lo) * ((targetTime - t1) / (t2 - t1));
      }
    }
    const x = timeScale.logicalToCoordinate(logical);
    const y = series.priceToCoordinate(Number(point.price));
    return x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y) ? null : { x, y };
  };

  useEffect(() => {
    if (!chartReady || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const paint = (drawing, isDraft = false) => {
        const pts = drawing.points.map(toXY).filter(Boolean);
        if (!pts.length) return;
        ctx.save();
        const defaultStyle = drawingStyles?.[drawing.type] || {};
        ctx.strokeStyle = drawing.color || defaultStyle.color || '#f59e0b';
        ctx.fillStyle = drawing.fillColor || drawing.fill || '#f59e0b33';
        const showBorder = drawing.showBorder === true;
        // Match the main chart's crisp 1px drawing strokes.
        ctx.lineWidth = Math.max(1, Number(drawing.lineWidth ?? 1));
        ctx.setLineDash(isDraft ? [5, 4] : []);
        if (drawing.type === 'horizontal') {
          ctx.beginPath(); ctx.moveTo(0, pts[0].y); ctx.lineTo(rect.width, pts[0].y); ctx.stroke();
        } else if (drawing.type === 'vertical') {
          ctx.beginPath(); ctx.moveTo(pts[0].x, 0); ctx.lineTo(pts[0].x, rect.height); ctx.stroke();
        } else if (drawing.type === 'text') {
          ctx.fillStyle = drawing.color || '#f59e0b';
          ctx.font = '14px sans-serif'; ctx.textBaseline = 'bottom';
          ctx.fillText(drawing.text || '', pts[0].x, pts[0].y);
        } else if (pts.length === 2 && drawing.type === 'trendline') {
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
        } else if (pts.length === 2 && drawing.type === 'rectangle') {
          const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
          ctx.fillRect(x, y, Math.abs(pts[1].x - pts[0].x), Math.abs(pts[1].y - pts[0].y));
          if (showBorder) ctx.strokeRect(x, y, Math.abs(pts[1].x - pts[0].x), Math.abs(pts[1].y - pts[0].y));
        } else if (pts.length === 2 && drawing.type === 'fibonacci') {
          [0, .5, .618, .764, 1].filter(() => showBorder).forEach(level => {
            const y = pts[0].y + (pts[1].y - pts[0].y) * level;
            ctx.beginPath(); ctx.moveTo(Math.min(pts[0].x, pts[1].x), y); ctx.lineTo(Math.max(pts[0].x, pts[1].x), y); ctx.stroke();
            ctx.fillStyle = drawing.color || '#f59e0b'; ctx.font = '10px sans-serif';
            ctx.fillText(`${(level * 100).toFixed(1)}%`, Math.max(pts[0].x, pts[1].x) + 4, y - 2);
          });
        }
        ctx.restore();
      };
      drawings.forEach(d => paint(d));
      if (draft) paint(draft, true);
    };
    draw();
    const timeScale = chartRef.current?.timeScale();
    const onRange = () => draw();
    const priceScale = chartRef.current?.priceScale('right');
    timeScale?.subscribeVisibleLogicalRangeChange(onRange);
    priceScale?.subscribeVisiblePriceRangeChange?.(onRange);
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => {
      timeScale?.unsubscribeVisibleLogicalRangeChange(onRange);
      priceScale?.unsubscribeVisiblePriceRangeChange?.(onRange);
      observer.disconnect();
    };
  }, [chartReady, chartRef, seriesRef, drawings, draft, chartId, candles, timeframe, drawingStyles]);

  const handlePointerDown = event => {
    if (!tool || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const point = toPoint(event.clientX - rect.left, event.clientY - rect.top);
    if (!point) return;
    if (tool === 'text') {
      const value = window.prompt('Enter chart note:');
      if (value?.trim()) setDrawings(items => [...items, { id: Date.now(), type: 'text', points: [point], text: value.trim(), color: '#f59e0b', lineWidth: 1 }]);
      setTool(null);
      return;
    }
    if (tool === 'horizontal' || tool === 'vertical') {
      const style = drawingStyles?.[tool] || {};
      setDrawings(items => [...items, { id: Date.now(), type: tool, points: [point], color: style.color || '#f59e0b', lineWidth: style.lineWidth ?? 1, showBorder: false }]);
      setTool(null);
      return;
    }
    dragRef.current = { type: tool, start: point };
    setDraft({ type: tool, points: [point, point], color: '#f59e0b', lineWidth: 1, showBorder: false, fillColor: '#f59e0b33' });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
  };
  const handlePointerMove = event => {
    if (!dragRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const point = toPoint(event.clientX - rect.left, event.clientY - rect.top);
    if (point) setDraft({ type: dragRef.current.type, points: [dragRef.current.start, point] });
  };
  const handlePointerUp = () => {
    if (!dragRef.current) return;
    const completed = draft;
    setDraft(null);
    if (completed?.points?.length === 2) setDrawings(items => [...items, { id: Date.now(), ...completed, lineWidth: 1, showBorder: false }]);
    dragRef.current = null;
    setTool(null);
  };

  return (
    <>
      <div className="absolute left-0 top-0 z-[100] flex flex-col gap-0.5 rounded-r-md bg-[#131722]/95 p-1 shadow-none pointer-events-auto" onPointerDown={event => event.stopPropagation()}>
        {TOOLS.map(({ key, title, Icon }) => (
          <button key={key} type="button" title={title} aria-label={title} aria-pressed={tool === key}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => { event.preventDefault(); event.stopPropagation(); setTool(value => value === key ? null : key); }}
            className={`flex h-7 w-7 items-center justify-center rounded pointer-events-auto ${tool === key ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#2a2e39]'}`}>
            {Icon ? <Icon size={14}/> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20 20 4M14 4h6v6"/></svg>}
          </button>
        ))}
        <div className="my-0.5 border-t border-[#2a2e39]"/>
        <button type="button" title="Undo this chart's last drawing" aria-label="Undo drawing" disabled={!drawings.length}
          onClick={() => setDrawings(items => items.slice(0, -1))} className="flex h-7 w-7 items-center justify-center rounded text-gray-300 hover:bg-[#2a2e39] disabled:opacity-30"><Undo2 size={14}/></button>
        <button type="button" title="Clear this chart's drawings" aria-label="Clear this chart's drawings" disabled={!drawings.length}
          onClick={() => setDrawings([])} className="flex h-7 w-7 items-center justify-center rounded text-red-400 hover:bg-red-900/30 disabled:opacity-30"><Trash2 size={14}/></button>
      </div>
      <canvas ref={canvasRef} className="absolute inset-0 z-[90]" style={{ width: '100%', height: '100%', pointerEvents: tool ? 'auto' : 'none', touchAction: 'none', cursor: tool ? 'crosshair' : 'default' }}
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}/>
    </>
  );
}
