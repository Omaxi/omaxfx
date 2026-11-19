import { useEffect } from 'react';
import { useStore } from '../store';
import {
  getTradeScreenshot,
  getTradeScreenshotKey,
  renderTradeScreenshot,
  saveTradeScreenshot,
} from '../utils/tradeScreenshots';

// Every journal image is rendered from the trade's own historical candle window.
// The v2 database is session-scoped, so legacy shared screenshots cannot leak
// into a different trade or a different saved session.
export default function TradeScreenshotCapture() {
  useEffect(() => {
    const inFlight = new Set();

    const captureMissingScreenshots = async (state) => {
      const trades = state.tradeHistory || [];
      const candles = state.rawData || [];
      const timeframe = state.timeframe || 1;
      const sessionId = state.sessionId || 'unsaved-session';

      for (const trade of trades) {
        if (trade?.id == null) continue;
        const key = getTradeScreenshotKey(trade.id, sessionId);
        if (!key || inFlight.has(key)) continue;
        inFlight.add(key);
        try {
          const existing = await getTradeScreenshot(trade.id, sessionId);
          if (existing) continue;
          const image = renderTradeScreenshot(trade, candles, timeframe);
          if (image) await saveTradeScreenshot(trade.id, image, sessionId);
          else console.warn('[TradeScreenshotCapture] Historical chart unavailable for trade', trade.id);
        } catch (error) {
          console.warn('[TradeScreenshotCapture] Could not save screenshot for trade', trade.id, error);
        } finally {
          inFlight.delete(key);
        }
      }
    };

    // Capture already-closed trades on restore as well as newly closed trades.
    captureMissingScreenshots(useStore.getState());
    const unsubscribe = useStore.subscribe((state, previous) => {
      if (
        state.tradeHistory !== previous.tradeHistory ||
        state.sessionId !== previous.sessionId ||
        state.rawData !== previous.rawData
      ) captureMissingScreenshots(state);
    });
    return unsubscribe;
  }, []);

  return null;
}
