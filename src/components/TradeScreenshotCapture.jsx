import { useEffect } from 'react';
import { useStore } from '../store';
import {
  getTradeScreenshotKey,
  renderTradeScreenshot,
  saveTradeScreenshot,
} from '../utils/tradeScreenshots';

// Render a separate historical chart for each newly closed trade. Session
// restores are intentionally skipped here; the journal lazily rebuilds missing
// images for the selected day instead of rendering hundreds on startup.
export default function TradeScreenshotCapture() {
  useEffect(() => {
    const inFlight = new Set();

    const unsubscribe = useStore.subscribe((state, previous) => {
      if (state.tradeHistory === previous.tradeHistory) return;
      // A session switch/restore is not a new batch of closed trades.
      if (state.sessionId !== previous.sessionId) return;

      const previousIds = new Set((previous.tradeHistory || []).map(trade => String(trade.id)));
      const newlyClosed = (state.tradeHistory || []).filter(trade =>
        trade?.id != null && !previousIds.has(String(trade.id))
      );
      if (!newlyClosed.length) return;

      const candles = state.rawData || [];
      const timeframe = state.timeframe || 1;
      const sessionId = state.sessionId || 'unsaved-session';

      newlyClosed.forEach(async trade => {
        const key = getTradeScreenshotKey(trade.id, sessionId);
        if (!key || inFlight.has(key)) return;
        inFlight.add(key);
        try {
          const image = renderTradeScreenshot(trade, candles, timeframe);
          if (image) await saveTradeScreenshot(trade.id, image, sessionId);
          else console.warn('[TradeScreenshotCapture] Historical chart unavailable for trade', trade.id);
        } catch (error) {
          console.warn('[TradeScreenshotCapture] Could not save screenshot for trade', trade.id, error);
        } finally {
          inFlight.delete(key);
        }
      });
    });

    return unsubscribe;
  }, []);

  return null;
}
