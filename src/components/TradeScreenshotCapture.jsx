import { useEffect } from 'react';
import { useStore } from '../store';
import {
  getTradeScreenshot,
  getTradeScreenshotKey,
  renderTradeScreenshot,
  saveTradeScreenshot,
} from '../utils/tradeScreenshots';

// Render a separate historical chart for each newly closed trade. Session
// restores are intentionally skipped here; the journal lazily rebuilds missing
// images for the selected day instead of rendering hundreds on startup.
export default function TradeScreenshotCapture() {
  useEffect(() => {
    const inFlight = new Map();

    const captureTrade = (trade, candles, timeframe, sessionId) => {
      const key = getTradeScreenshotKey(trade.id, sessionId);
      if (!key || inFlight.has(key)) return inFlight.get(key);
      const task = (async () => {
        const image = renderTradeScreenshot(trade, candles, timeframe);
        if (image) await saveTradeScreenshot(trade.id, image, sessionId);
        else console.warn('[TradeScreenshotCapture] Historical chart unavailable for trade', trade.id);
      })().catch(error => {
        console.warn('[TradeScreenshotCapture] Could not save screenshot for trade', trade.id, error);
      }).finally(() => inFlight.delete(key));
      inFlight.set(key, task);
      return task;
    };

    const unsubscribe = useStore.subscribe((state, previous) => {
      if (state.tradeHistory === previous.tradeHistory && state.sessionId === previous.sessionId) return;

      // If a trade closed before autosave assigned its session ID, wait for its
      // first write to finish before copying it into the permanent session key.
      if (state.sessionId !== previous.sessionId) {
        if (!previous.sessionId && state.sessionId) {
          (state.tradeHistory || []).forEach(async trade => {
            const pending = inFlight.get(getTradeScreenshotKey(trade.id, 'unsaved-session'));
            if (pending) await pending;
            const image = await getTradeScreenshot(trade.id, 'unsaved-session');
            if (image) await saveTradeScreenshot(trade.id, image, state.sessionId).catch(() => false);
          });
        }
        return;
      }

      if (state.tradeHistory === previous.tradeHistory) return;
      const previousIds = new Set((previous.tradeHistory || []).map(trade => String(trade.id)));
      const newlyClosed = (state.tradeHistory || []).filter(trade =>
        trade?.id != null && !previousIds.has(String(trade.id))
      );
      if (!newlyClosed.length) return;

      const candles = state.rawData || [];
      const timeframe = state.timeframe || 1;
      const sessionId = state.sessionId || 'unsaved-session';
      newlyClosed.forEach(trade => captureTrade(trade, candles, timeframe, sessionId));
    });

    return unsubscribe;
  }, []);

  return null;
}
