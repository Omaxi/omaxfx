import { useEffect } from 'react';
import { useStore } from '../store';
import { renderTradeScreenshot, saveTradeScreenshot } from '../utils/tradeScreenshots';

// Each closed trade gets its own deterministic image rendered from the
// historical candles spanning that trade. Never reuse the live chart canvas:
// multiple trades can close in one store update while the chart is already
// showing a later candle, which previously assigned one identical image to all.
export default function TradeScreenshotCapture() {
  useEffect(() => {
    const captureClosedTrades = (state, previous) => {
      if (state.tradeHistory === previous.tradeHistory) return;
      const previousIds = new Set((previous.tradeHistory || []).map(trade => String(trade.id)));
      const closed = (state.tradeHistory || []).filter(trade => !previousIds.has(String(trade.id)));
      if (!closed.length) return;

      const candles = state.rawData || [];
      const timeframe = state.timeframe || 1;
      closed.forEach(trade => {
        const image = renderTradeScreenshot(trade, candles, timeframe);
        if (!image) {
          console.warn('[TradeScreenshotCapture] Could not render screenshot for trade', trade.id);
          return;
        }
        saveTradeScreenshot(trade.id, image).catch(error => {
          console.warn('[TradeScreenshotCapture] Could not save screenshot for trade', trade.id, error);
        });
      });
    };

    // Zustand subscribe receives both snapshots synchronously. This also
    // regenerates old screenshots when a saved session is restored, replacing
    // legacy duplicate images with trade-specific captures.
    const unsubscribe = useStore.subscribe(captureClosedTrades);
    return unsubscribe;
  }, []);
  return null;
}
