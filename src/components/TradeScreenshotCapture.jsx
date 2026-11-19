import { useEffect } from 'react';
import { useStore } from '../store';
import { captureChartScreenshot, saveTradeScreenshot } from '../utils/tradeScreenshots';

// Watches the trade journal for newly closed trades and stores a chart snapshot
// in IndexedDB so large images never inflate the localStorage session payload.
export default function TradeScreenshotCapture() {
  useEffect(() => {
    const unsubscribe = useStore.subscribe((state, previous) => {
      if (state.tradeHistory === previous.tradeHistory) return;
      const previousIds = new Set((previous.tradeHistory || []).map(trade => String(trade.id)));
      const closed = (state.tradeHistory || []).filter(trade => !previousIds.has(String(trade.id)));
      if (!closed.length) return;

      requestAnimationFrame(() => requestAnimationFrame(async () => {
        const image = captureChartScreenshot();
        if (!image) return;
        await Promise.all(closed.map(trade => saveTradeScreenshot(trade.id, image).catch(() => false)));
      }));
    });
    return unsubscribe;
  }, []);
  return null;
}
