import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useStore } from '../store';

const TP_COLORS = ['#26a69a', '#22c55e', '#4ade80', '#86efac', '#fbbf24', '#f59e0b', '#fde047'];

const fireTPCelebration = () => {
  // Single, centered burst only
  confetti({
    particleCount: 180,
    spread: 360,
    origin: { x: 0.5, y: 0.5 },
    colors: TP_COLORS,
    startVelocity: 45,
    scalar: 1.1,
    ticks: 220,
    disableForReducedMotion: true,
  });
};

export default function CelebrationOverlay() {
  const tradeCountRef = useRef(0);
  const lastFireRef = useRef(0);

  useEffect(() => {
    // Seed with current trade count so we don't fire on mount
    tradeCountRef.current = useStore.getState().tradeHistory.length;

    const unsubscribe = useStore.subscribe((state) => {
      const len = state.tradeHistory.length;

      // Session was reset (Restart / Load) — reset our counter silently
      if (len < tradeCountRef.current) {
        tradeCountRef.current = len;
        return;
      }

      // New trade(s) closed
      if (len > tradeCountRef.current) {
        const newTrades = state.tradeHistory.slice(tradeCountRef.current);
        tradeCountRef.current = len;

        const hasTp = newTrades.some(t => t.reason === 'TP');
        if (hasTp) {
          const now = Date.now();
          // Throttle — avoid stacking bursts if multiple TPs hit within one auto-play tick
          if (now - lastFireRef.current > 600) {
            lastFireRef.current = now;
            fireTPCelebration();
          }
        }
      }
    });

    return unsubscribe;
  }, []);

  return null;
}