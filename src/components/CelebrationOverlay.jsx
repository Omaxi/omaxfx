import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useStore } from '../store';

const TP_COLORS = ['#26a69a', '#22c55e', '#4ade80', '#86efac', '#fbbf24', '#f59e0b', '#fde047'];

const fireTPCelebration = () => {
  // Stage 1: Main central burst
  confetti({
    particleCount: 120,
    spread: 90,
    origin: { x: 0.5, y: 0.5 },
    colors: TP_COLORS,
    startVelocity: 45,
    scalar: 1.1,
    ticks: 220,
    disableForReducedMotion: true,
  });

  // Stage 2: Side cannons after a beat
  setTimeout(() => {
    confetti({
      particleCount: 60,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.7 },
      colors: TP_COLORS,
      startVelocity: 55,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 60,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.7 },
      colors: TP_COLORS,
      startVelocity: 55,
      disableForReducedMotion: true,
    });
  }, 180);

  // Stage 3: Final sparkle shower from above
  setTimeout(() => {
    confetti({
      particleCount: 90,
      spread: 140,
      origin: { x: 0.5, y: 0.35 },
      colors: TP_COLORS,
      startVelocity: 30,
      scalar: 0.9,
      ticks: 180,
      gravity: 0.9,
      disableForReducedMotion: true,
    });
  }, 380);
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