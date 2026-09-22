import { useStore } from '../store';
import { X, Play, TrendingUp, Pencil, Target, Sparkles, Smartphone, Share2, Award } from 'lucide-react';

export default function InfoModal() {
  const { isInfoOpen, closeInfo } = useStore();
  if (!isInfoOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur flex items-center justify-center z-[70] p-2" onClick={closeInfo}>
      <div 
        className="bg-[#131722] rounded-xl w-full max-w-md border border-[#2a2e39] overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-[#2a2e39] flex-shrink-0">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold">
                <span className="text-blue-500">Omax</span>
                <span className="text-white">FX Simulator</span>
              </h2>
              <p className="text-[10px] text-gray-500 italic">Trading Replay Engine</p>
            </div>
            <button onClick={closeInfo} className="p-1 hover:bg-[#2a2e39] rounded">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-3 space-y-3 text-[11px] text-gray-300 leading-relaxed">
          
          <Section icon={<Sparkles size={12}/>} title="What is this?">
            A professional replay and trading simulator for XAUUSD. Replay historical
            markets, place trades with realistic rules, test strategies, and analyze performance.
          </Section>

          <Section icon={<Play size={12}/>} title="Playback">
            <ul className="list-disc pl-4 space-y-0.5">
              <li><b>▶ Play</b> (floating button, bottom-right) — auto-advance the market (2× speed)</li>
              <li><b>⏭ Step</b> (big blue button) — advance one candle at a time</li>
              <li><b>1m / 5m / 15m / 1h ...</b> — change the timeframe. Candles resize; drawings stay anchored to real market time and price.</li>
            </ul>
          </Section>

          <Section icon={<TrendingUp size={12}/>} title="Trading">
            <ul className="list-disc pl-4 space-y-0.5">
              <li><b>BUY</b> / <b>SELL</b> — opens the order window</li>
              <li>Choose <b>Market</b>, <b>Limit</b>, or <b>Stop</b> order</li>
              <li>Set risk % (0.5 – 3%), SL, and TP</li>
              <li>Position size is auto-calculated from risk amount</li>
              <li><b>Long/Short position</b> — click 3 times on the chart to draw entry → SL → TP</li>
              <li>Drag SL / TP lines on the chart to adjust them</li>
              <li>Tap the red <b>✕</b> next to a line to cancel that order / close that position</li>
            </ul>
          </Section>

          <Section icon={<Pencil size={12}/>} title="Drawing tools (left side)">
            <ul className="list-disc pl-4 space-y-0.5">
              <li><b>Cursor</b> — navigate & drag drawings</li>
              <li><b>—</b> Horizontal line — tap once</li>
              <li><b>↗</b> Trendline — tap-tap or drag from A to B</li>
              <li><b>▢</b> Rectangle — tap-tap or drag corner to corner</li>
              <li><b>≡</b> Fibonacci — draw from swing high to low (levels 0, 0.5, 0.618, 0.764, 1)</li>
              <li><b>▥</b> Volume Profile — drag over a range to see POC</li>
              <li><b>🗑</b> Clear all drawings</li>
              <li><b>Long-press</b> (0.6s) any drawing to delete it individually</li>
            </ul>
          </Section>

          <Section icon={<Target size={12}/>} title="Rules & Analysis">
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Session ends if you hit <b>Daily Loss</b>, <b>Max Drawdown</b>, or the <b>Countdown</b> ends</li>
              <li><b>History</b> shows every closed trade including <b>Risk per trade</b></li>
              <li><b>Equity</b> shows your balance curve, preset, and period</li>
              <li>Tap <b>Share</b> to send a professional PNG report</li>
            </ul>
          </Section>

          <Section icon={<Share2 size={12}/>} title="Practice Mode">
            <ul className="list-disc pl-4 space-y-0.5">
              <li>All traders install from the same URL</li>
              <li>Agree on the same <b>preset + period</b> in the lobby</li>
              <li>Say <b>“3-2-1-GO!”</b> and everyone starts together</li>
              <li>First to finish yells <b>“DONE!”</b></li>
              <li>Everyone shares their equity screenshot to compare</li>
            </ul>
          </Section>

          <Section icon={<Smartphone size={12}/>} title="Tips">
            <ul className="list-disc pl-4 space-y-0.5">
              <li><b>Rotate to landscape</b> for a bigger chart</li>
              <li>Works <b>fully offline</b> after the first load</li>
              <li>Use smaller timeframes for scalping, bigger for swings</li>
              <li>Always set SL before TP — protect your capital first</li>
            </ul>
          </Section>

          <Section icon={<Award size={12}/>} title="Credits">
            <ul className="list-disc pl-4 space-y-0.5">
              <li><b>Created by Omar Mohamed Yonis</b></li>
              <li>Historical data: <b>Dukascopy</b> — industry-standard, high-quality tick data trusted by professional traders worldwide</li>
              <li>Charting engine: TradingView Lightweight Charts</li>
              <li>Built with React + Vite + Capacitor for offline PWA</li>
            </ul>
          </Section>

          <div className="text-center text-[10px] text-gray-500 pt-2 border-t border-[#2a2e39]">
            OmaxFX Simulator • v1.0
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold text-blue-400 uppercase tracking-wide mb-1">
        {icon} {title}
      </h3>
      <div className="text-gray-300">{children}</div>
    </div>
  );
}