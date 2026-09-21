import { useStore } from '../store';
import { X, Play, TrendingUp, Pencil, Target, Sparkles, Smartphone, Share2 } from 'lucide-react';

export default function InfoModal() {
  const { isInfoOpen, closeInfo } = useStore();
  if (!isInfoOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur flex items-center justify-center z-[70] p-2" onClick={closeInfo}>
      <div 
        className="bg-[#131722] rounded-xl w-full max-w-md border border-[#2a2e39] overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-3 py-2 border-b border-[#2a2e39] flex-shrink-0">
          <h2 className="text-base font-bold">
            <span className="text-blue-500">Omax</span>
            <span className="text-white">FX Game</span>
            <span className="text-gray-400 text-xs ml-2">Quick Guide</span>
          </h2>
          <button onClick={closeInfo} className="p-1 hover:bg-[#2a2e39] rounded">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-3 space-y-3 text-[11px] text-gray-300 leading-relaxed">
          
          <Section icon={<Sparkles size={12}/>} title="What is this?">
            A replay trading simulator. Trade historical XAUUSD data with realistic rules,
            limit/stop orders, SL/TP, drawings, and a scored challenge mode.
          </Section>

          <Section icon={<Play size={12}/>} title="Playback">
            <ul className="list-disc pl-4 space-y-0.5">
              <li><b>▶ Play</b> — auto-advance the market (one candle per 0.5s)</li>
              <li><b>⏭ Step</b> — jump forward one candle at a time</li>
              <li><b>1m / 5m / 15m / 1h ...</b> — change the timeframe (candles resize, drawings stay)</li>
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
              <li>Click the red <b>✕</b> next to a line to cancel that order / close that position</li>
            </ul>
          </Section>

          <Section icon={<Pencil size={12}/>} title="Drawing tools (left side)">
            <ul className="list-disc pl-4 space-y-0.5">
              <li><b>Cursor</b> — navigate & drag drawings</li>
              <li><b>—</b> Horizontal line — click once</li>
              <li><b>↗</b> Trendline — tap-tap or drag from A to B</li>
              <li><b>▢</b> Rectangle — tap-tap or drag corner to corner</li>
              <li><b>≡</b> Fibonacci — draw from high to low (or vice versa)</li>
              <li><b>▥</b> Volume Profile — drag over a range to see POC</li>
              <li><b>🗑</b> Clear all drawings</li>
              <li><b>Long-press</b> (0.6s) any drawing to delete it individually</li>
            </ul>
          </Section>

          <Section icon={<Target size={12}/>} title="Rules & Scoring">
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Game ends if you hit <b>Daily Loss</b>, <b>Max Drawdown</b>, or the <b>Countdown</b> ends</li>
              <li><b>History</b> shows every closed trade</li>
              <li><b>Equity</b> shows your balance curve</li>
              <li>Tap <b>Share</b> to send a PNG of your performance</li>
            </ul>
          </Section>

          <Section icon={<Share2 size={12}/>} title="Multiplayer (solo version)">
            <ul className="list-disc pl-4 space-y-0.5">
              <li>All players install the app from the same URL</li>
              <li>Agree on the same <b>preset + period</b> in the lobby</li>
              <li>Say <b>“3-2-1-GO!”</b> and everyone taps Start together</li>
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

          <div className="text-center text-[10px] text-gray-500 pt-2 border-t border-[#2a2e39]">
            Version 1.0 • Made with ❤️ for traders
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