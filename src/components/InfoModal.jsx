import { useStore } from '../store';
import {
  X, Play, Pause, SkipForward, ChartCandlestick, SlidersHorizontal,
  TrendingUp, Pencil, Target, Activity, CalendarDays, FileText,
  Settings2, Keyboard, Upload, Layers3, BarChart3, Clock3
} from 'lucide-react';

export default function InfoModal() {
  const { isInfoOpen, closeInfo } = useStore();
  if (!isInfoOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur flex items-center justify-center z-[70] p-2 sm:p-4" onClick={closeInfo}>
      <div
        className="bg-[#131722] rounded-xl w-full max-w-5xl border border-[#2a2e39] overflow-hidden flex flex-col max-h-[94vh] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 sm:px-6 py-3 border-b border-[#2a2e39] flex-shrink-0 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold tracking-tight">
                <span className="text-blue-500">Trade</span><span className="text-white">Past</span>
              </h2>
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-300">User guide</span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">Historical market replay, trade execution and performance review</p>
          </div>
          <button type="button" onClick={closeInfo} aria-label="Close user guide" className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-[#2a2e39] hover:text-white">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mb-5 rounded-xl border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-transparent p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">Platform overview</p>
            <p className="mt-1 text-sm leading-6 text-gray-200">
              TradePast is a historical trading simulator for practising strategies on past market data.
              Load a market dataset, choose a replay period, move through price action one bar at a time or
              automatically, place and manage simulated trades, then review the results with trade history
              and performance analytics. It supports forex, metals, indices and other instruments represented
              by compatible market data.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Section icon={<Upload size={15}/>} title="01 · Market data & backtest setup">
              <ul>
                <li>Import a CSV file from your computer using the data import option.</li>
                <li>The importer analyses common CSV heading and timestamp formats, validates candle rows, and reports detected format, data range and skipped or duplicate rows.</li>
                <li>The instrument can be detected from the filename or entered manually. Advanced contract settings let you adjust contract size, tick size, price precision, quote currency and conversion rate.</li>
                <li>After import, choose the historical period and backtest rules before starting the replay.</li>
                <li>Use <b>New Backtest</b> to start a fresh run with a new period or dataset.</li>
              </ul>
            </Section>

            <Section icon={<Play size={15}/>} title="02 · Market replay & navigation">
              <ul>
                <li><b>Play / Pause:</b> automatically advance through historical candles.</li>
                <li><b>Step:</b> advance the replay by one candle at a time.</li>
                <li><b>Replay speed:</b> choose how many bars are processed per second, from slow review to fast replay.</li>
                <li><b>Timeframe:</b> switch between 1m, 5m, 15m, 30m, 1h, 4h, daily and weekly views.</li>
                <li><b>Jump:</b> navigate to the Asia, London or New York session. Session start and end hours can be adjusted.</li>
                <li>The chart supports candlestick and line views, plus single-, two- and three-chart layouts where available.</li>
              </ul>
            </Section>

            <Section icon={<SlidersHorizontal size={15}/>} title="03 · Indicators & market context">
              <p>Open <b>Indicators</b> on the chart to add or configure technical tools:</p>
              <ul>
                <li><b>Moving Average:</b> configure moving-average instances, periods, methods and colors.</li>
                <li><b>Bollinger Bands:</b> configure period, deviation multiplier and line color.</li>
                <li><b>RSI, ATR and ADX:</b> monitor momentum, volatility and trend strength.</li>
                <li><b>VWAP:</b> display the session VWAP and optionally enable deviation bands; configure line colors.</li>
                <li><b>Fractals:</b> mark confirmed swing highs and swing lows, with adjustable left/right bars and marker colors.</li>
                <li><b>Sessions:</b> display market-session context; <b>FVG:</b> display fair value gaps; <b>HTF Candle Viewer:</b> inspect a higher-timeframe candle; <b>Previous Daily High/Low:</b> show selected prior-day reference levels.</li>
              </ul>
            </Section>

            <Section icon={<ChartCandlestick size={15}/>} title="04 · Chart tools & appearance">
              <ul>
                <li>Use the left drawing toolbar for freehand pencil, horizontal and vertical lines, trendlines, continuous arrows, rectangles, Fibonacci levels and text notes.</li>
                <li>Select and reposition drawings on the chart; use the style controls to adjust supported drawing properties.</li>
                <li>Undo and redo drawing changes, or clear chart drawings when needed.</li>
                <li>Chart settings control background and candle colors, grid visibility, last-price line and horizontal/vertical crosshair guides.</li>
                <li>Drawings are positioned against market time and price so they remain associated with the same chart location when the view changes.</li>
              </ul>
            </Section>

            <Section icon={<Target size={15}/>} title="05 · Orders, positions & risk">
              <ul>
                <li>Choose <b>Long position</b> or <b>Short position</b>, then mark entry, stop-loss and take-profit levels on the chart.</li>
                <li>Use <b>BUY</b> or <b>SELL</b> to open the order ticket. Select Market, Limit or Stop execution where appropriate.</li>
                <li>Set risk percentage, stop loss and risk/reward target. Position size and estimated loss/profit are calculated from the order parameters and instrument specifications.</li>
                <li>Manage multiple open positions and pending orders. Adjust supported stop-loss and take-profit levels directly on the chart, or use the close/cancel control beside the relevant trade level.</li>
                <li>Optional trade management includes moving stop loss to breakeven at a chosen R multiple and taking a configurable partial profit before the final target.</li>
                <li>Backtest rules can apply limits such as maximum risk per trade, daily loss, drawdown and a session countdown.</li>
              </ul>
            </Section>

            <Section icon={<Activity size={15}/>} title="06 · Live information dashboard">
              <ul>
                <li>The chart dashboard displays the active candle's open, high, low and close, its market date/time and current session.</li>
                <li>It also reports the number of open positions and pending orders.</li>
                <li>When supported indicators are active, their current readings can appear in the dashboard.</li>
                <li>Use the dashboard header to collapse or expand the information panel.</li>
              </ul>
            </Section>

            <Section icon={<Clock3 size={15}/>} title="07 · Trade history & review">
              <ul>
                <li><b>History</b> lists completed trades and their recorded outcomes, including entry/exit information and risk details.</li>
                <li>Trade chart snapshots preserve the market context and drawings associated with the trade for later review.</li>
                <li>Open a trade's day or detail view to inspect that day's activity and individual trade information.</li>
              </ul>
            </Section>

            <Section icon={<BarChart3 size={15}/>} title="08 · Analytics & reporting">
              <ul>
                <li>Review the equity curve, net P&amp;L, return, win rate, profit factor, average win/loss, average R, drawdown, streaks and long/short breakdown.</li>
                <li>Use the performance calendar to compare daily and monthly results and open the trades recorded on a selected day.</li>
                <li>Export a detailed analytics report as a PDF, including performance metrics, calendar results, trade details and trade chart screenshots.</li>
              </ul>
            </Section>

            <Section icon={<Settings2 size={15}/>} title="09 · Settings & controls">
              <ul>
                <li>Use <b>Settings</b> to customise chart background, bullish/bearish candle bodies and wicks, grid, last-price line and crosshair guides.</li>
                <li><b>Reset Chart</b> restores the chart view to its default framing.</li>
                <li>Sound effects and background music can be controlled independently from the header. Fireworks can also be toggled.</li>
                <li>The market symbol and chart timezone are shown in the lower information bar.</li>
              </ul>
            </Section>

            <Section icon={<Keyboard size={15}/>} title="10 · Keyboard shortcuts">
              <ul>
                <li><kbd>Space</kbd> — play or pause replay.</li>
                <li><kbd>→</kbd> — advance one step.</li>
                <li><kbd>M</kbd> — toggle background music.</li>
              </ul>
            </Section>
          </div>

          <footer className="mt-6 border-t border-[#2a2e39] pt-4 text-center">
            <p className="text-xs font-semibold text-gray-300">TradePast · Trading Replay Engine</p>
            <p className="mt-1 text-[10px] text-gray-500">For strategy practice and historical simulation. Trades are simulated and are not sent to a broker.</p>
            <p className="mt-2 text-[10px] text-gray-500">Copyright © 2026 · <a href="mailto:omarmohamedyonis@gmail.com" className="text-blue-400 transition-colors hover:text-blue-300">omarmohamedyonis@gmail.com</a></p>
          </footer>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-400">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">{icon}</span>
        {title}
      </h3>
      <div className="space-y-1.5 pl-9 text-[11px] leading-[1.65] text-gray-300 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-4 [&_li]:pl-0.5 [&_b]:font-semibold [&_b]:text-gray-100 [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-[#3a4050] [&_kbd]:bg-[#1e222d] [&_kbd]:px-1.5 [&_kbd]:py-0.5 [&_kbd]:font-mono [&_kbd]:text-[10px] [&_kbd]:text-blue-200">
        {children}
      </div>
    </section>
  );
}
