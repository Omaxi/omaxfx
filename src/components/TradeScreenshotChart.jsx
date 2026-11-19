import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { getTradeCandleWindow } from '../utils/tradeScreenshots';

// Interactive journal preview: the saved JPEG remains available for download,
// while this chart supports normal Lightweight Charts zoom, pan and axis scaling.
export default function TradeScreenshotChart({ trade, candles, timeframe = 1 }) {
  const hostRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const windowData = getTradeCandleWindow(trade, candles, timeframe);
    if (!windowData?.data?.length) return undefined;

    const chart = createChart(host, {
      width: host.clientWidth || 600,
      height: host.clientHeight || 260,
      layout: {
        background: { type: 'solid', color: '#0d1117' },
        textColor: '#9aa4b2',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.06)' },
        horzLines: { color: 'rgba(148,163,184,0.10)' },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { timeVisible: true, secondsVisible: false, borderVisible: false, rightOffset: 3 },
      crosshair: { mode: 1 },
      handleScroll: true,
      handleScale: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceLineVisible: false,
    });
    series.setData(windowData.data.map(c => ({
      time: c.time,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    })));

    const canvas = overlayRef.current;
    const drawOverlay = () => {
      if (!canvas || !host) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = host.clientWidth;
      const height = host.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const entry = Number(trade.entryPrice);
      const sl = Number(trade.sl);
      const tp = Number(trade.tp);
      const openBar = windowData.data[windowData.entryIndex];
      const closeBar = windowData.data[windowData.exitIndex];
      if (!openBar || !closeBar || !Number.isFinite(entry)) return;
      const x1 = chart.timeScale().timeToCoordinate(openBar.time);
      const x2 = chart.timeScale().timeToCoordinate(closeBar.time);
      const yEntry = series.priceToCoordinate(entry);
      if ([x1, x2, yEntry].some(v => v == null || !Number.isFinite(v))) return;
      const left = Math.max(0, Math.min(x1, x2));
      const right = Math.min(width, Math.max(x1, x2));
      const drawZone = (price, color) => {
        if (!Number.isFinite(price)) return;
        const yPrice = series.priceToCoordinate(price);
        if (yPrice == null || !Number.isFinite(yPrice)) return;
        const top = Math.max(0, Math.min(yEntry, yPrice));
        const bottom = Math.min(height, Math.max(yEntry, yPrice));
        if (right > left && bottom > top) {
          ctx.fillStyle = color;
          ctx.fillRect(left, top, right - left, bottom - top);
        }
      };
      // Position-tool risk/reward zones only; no entry/exit guide lines.
      drawZone(sl, 'rgba(239,83,80,0.18)');
      drawZone(tp, 'rgba(38,166,154,0.18)');
    };

    chart.timeScale().fitContent();
    const schedule = () => requestAnimationFrame(drawOverlay);
    const range = chart.timeScale();
    range.subscribeVisibleLogicalRangeChange(schedule);
    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: host.clientWidth, height: host.clientHeight });
      schedule();
    });
    resizeObserver.observe(host);
    host.addEventListener('wheel', schedule, { passive: true });
    host.addEventListener('pointermove', schedule, { passive: true });
    drawOverlay();

    return () => {
      resizeObserver.disconnect();
      range.unsubscribeVisibleLogicalRangeChange(schedule);
      host.removeEventListener('wheel', schedule);
      host.removeEventListener('pointermove', schedule);
      chart.remove();
    };
  }, [trade, candles, timeframe]);

  return (
    <div ref={hostRef} className="relative h-full min-h-[220px] w-full">
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 z-10"/>
    </div>
  );
}
