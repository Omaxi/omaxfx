import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import ToolbarSeparator from './ToolbarSeparator';
import { X, ChevronDown, Check, Sunrise, Sun, Sunset, ArrowUpDown, CandlestickChart, AlertTriangle, Play, Pause, SkipForward } from 'lucide-react';

const TIMEFRAMES = [
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '4 hours', value: 240 },
  { label: 'Daily', value: 1440 },
  { label: 'Weekly', value: 10080 },
];

const CHART_TYPES = [
  { label: 'Candles', value: 'candle' },
  { label: 'Line', value: 'line' },
];

// =========================================================================
// SYMBOLS LIST
// Set `available: true` when the CSV file(s) are present in /public/data/.
// =========================================================================
const SESSIONS = [
  { key: 'asian',   label: 'Asia', icon: Sunrise, color: 'text-orange-400' },
  { key: 'london',  label: 'London',   icon: Sun,     color: 'text-blue-400' },
  { key: 'newyork', label: 'New York', icon: Sunset,  color: 'text-purple-400' },
];

export default function ControlPanel() {
  const { 
    setTimeframe, timeframe, openOrderModal, isPlaying, togglePlay, stepForward,
    startDrawing, isDrawingMode, drawingStep, draftPosition, clearDraft,
    symbol, timezone,
    sessionTimes, sessionEndTimes, setSessionTime, setSessionEndTime, jumpToSession, sessionJumpNotice, clearSessionJumpNotice,
    chartType, setChartType, replaySpeed, setReplaySpeed
  } = useStore();

  const [tfOpen, setTfOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [ctOpen, setCtOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [marketOrderWarning, setMarketOrderWarning] = useState('');

  const tfButtonRef = useRef(null);
  const jumpButtonRef = useRef(null);
  const ctButtonRef = useRef(null);
  const speedButtonRef = useRef(null);
  const [tfLeft, setTfLeft] = useState(0);
  const [jumpLeft, setJumpLeft] = useState(0);
  const [ctLeft, setCtLeft] = useState(0);
  const [speedLeft, setSpeedLeft] = useState(0);

  useEffect(() => {
    if (!marketOrderWarning) return undefined;
    const timer = window.setTimeout(() => setMarketOrderWarning(''), 4000);
    return () => window.clearTimeout(timer);
  }, [marketOrderWarning]);

  useEffect(() => {
    if (!sessionJumpNotice) return undefined;
    const timer = window.setTimeout(() => clearSessionJumpNotice(), 5000);
    return () => window.clearTimeout(timer);
  }, [sessionJumpNotice, clearSessionJumpNotice]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setTfOpen(false); setJumpOpen(false); setCtOpen(false); setSpeedOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeAll = () => { 
    setTfOpen(false); setJumpOpen(false); setCtOpen(false); setSpeedOpen(false);
  };

  const handleMarketOrder = (side) => {
    const { draftPosition: draft, isDrawingMode: drawing } = useStore.getState();
    const hasCompletedMatchingTool = draft?.type === side && !drawing &&
      ['entry', 'sl', 'tp'].every(key =>
        draft[key] != null && Number.isFinite(Number(draft[key])) && Number(draft[key]) > 0
      );

    if (!hasCompletedMatchingTool) {
      setMarketOrderWarning(side === 'buy'
        ? 'Before buying please place the long position tool on the chart'
        : 'Before selling please place the short position tool on the chart');
      return;
    }

    setMarketOrderWarning('');
    openOrderModal(side);
  };
  const toggleTf = () => {
    const o = !tfOpen;
    if (o && tfButtonRef.current) {
      const rect = tfButtonRef.current.getBoundingClientRect();
      setTfLeft(Math.max(8, rect.left));
    }
    closeAll();
    setTfOpen(o);
  };

  const toggleJump = () => {
    const o = !jumpOpen;
    if (o && jumpButtonRef.current) {
      const rect = jumpButtonRef.current.getBoundingClientRect();
      setJumpLeft(Math.max(8, rect.left));
    }
    closeAll();
    setJumpOpen(o);
  };

  const toggleCt = () => {
    const o = !ctOpen;
    if (o && ctButtonRef.current) {
      const rect = ctButtonRef.current.getBoundingClientRect();
      setCtLeft(Math.max(8, rect.left));
    }
    closeAll();
    setCtOpen(o);
  };

  const toggleSpeed = () => {
    const o = !speedOpen;
    if (o && speedButtonRef.current) {
      const rect = speedButtonRef.current.getBoundingClientRect();
      setSpeedLeft(Math.max(8, rect.left));
    }
    closeAll();
    setSpeedOpen(o);
  };

  const tfLabel = TIMEFRAMES.find(t => t.value === timeframe)?.label || '1 min';

  const TimeframeDropdown = () => (
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={closeAll} />
      <div className="theme-menu-surface fixed bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[140px] overflow-hidden" style={{ zIndex: 9999, left: tfLeft, bottom: 52 }}>
        <div className="px-3 py-1.5 border-b border-[#2a2e39] text-[9px] font-bold uppercase text-gray-500 tracking-wide">Timeframe</div>
        {TIMEFRAMES.map(tf => {
          const isSelected = timeframe === tf.value;
          return (
            <button key={tf.value}
              onClick={() => { setTimeframe(tf.value); closeAll(); }}
              aria-pressed={isSelected} className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left text-white hover:bg-[#2a2e39] cursor-pointer ${isSelected ? 'bg-blue-600/15' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="w-3 flex items-center justify-center">
                  {isSelected && <Check size={10} className="text-blue-400" />}
                </span>
                <span className={isSelected ? 'font-bold' : ''}>{tf.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );

  const SpeedDropdown = () => (
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={closeAll} />
      <div className="fixed bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[140px] overflow-hidden" style={{ zIndex: 9999, left: speedLeft, bottom: 52 }}>
        <div className="px-3 py-1.5 border-b border-[#2a2e39] text-[9px] font-bold uppercase text-gray-500 tracking-wide">Replay speed</div>
        {[1, 5, 10, 50, 100, 500].map(speed => (
          <button key={speed} onClick={() => { setReplaySpeed(speed); closeAll(); }}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left text-white hover:bg-[#2a2e39] cursor-pointer ${replaySpeed === speed ? 'bg-blue-600/15' : ''}`}>
            <span className={replaySpeed === speed ? 'font-bold' : ''}>{speed} bar/s</span>
            {replaySpeed === speed && <Check size={10} className="text-blue-400" />}
          </button>
        ))}
      </div>
    </>
  );

  const ChartTypeDropdown = () => (
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={closeAll} />
      <div className="theme-menu-surface fixed bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[130px] overflow-hidden" style={{ zIndex: 9999, left: ctLeft, bottom: 52 }}>
        <div className="px-3 py-1.5 border-b border-[#2a2e39] text-[9px] font-bold uppercase text-gray-500 tracking-wide">Chart</div>
        {CHART_TYPES.map(ct => {
          const isSelected = chartType === ct.value;
          return (
            <button key={ct.value}
              onClick={() => { setChartType(ct.value); closeAll(); }}
              aria-pressed={isSelected} className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left text-white hover:bg-[#2a2e39] cursor-pointer ${isSelected ? 'bg-blue-600/15' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="w-3 flex items-center justify-center">
                  {isSelected && <Check size={10} className="text-blue-400" />}
                </span>
                <span className={isSelected ? 'font-bold' : ''}>{ct.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );

  const JumpDropdown = () => (
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={closeAll} />
      <div className="theme-menu-surface jump-session-menu fixed bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[390px] max-w-[calc(100vw-16px)]" style={{ zIndex: 9999, left: jumpLeft, bottom: 52 }}>
        <div className="px-3 py-1.5 border-b border-[#2a2e39] text-[9px] font-bold uppercase text-gray-500 tracking-wide flex justify-between items-center">
          <span>Jump to Session</span>
          <span className="text-[8px] text-gray-600 normal-case">UTC+3</span>
        </div>
        {SESSIONS.map(s => {
          const Icon = s.icon;
          const hour = Number(sessionTimes[s.key] ?? ({ asian: 3, london: 11, newyork: 16 }[s.key]));
          const endHour = Number(sessionEndTimes[s.key] ?? ({ asian: 8, london: 13, newyork: 18 }[s.key]));
          return (
            <div key={s.key} className="flex items-center gap-2 px-3 py-2 hover:bg-[#2a2e39]/40">
              <Icon size={12} className={s.color} />
              <span className="text-xs text-white font-bold w-24">{s.label}</span>
              <input
                type="number"
                min="0"
                max="23"
                value={hour}
                onChange={(e) => setSessionTime(s.key, e.target.value)}
                className="w-10 bg-[#131722] text-white text-[11px] font-mono px-1 py-0.5 rounded border border-[#2a2e39] outline-none text-center focus:border-blue-500"
                title="Session start hour (0-23)"
                aria-label={`${s.label} start hour`}
              />
              <span className="text-[10px] text-gray-500 font-mono">to</span>
              <input
                type="number"
                min="1"
                max="24"
                value={endHour}
                onChange={(e) => setSessionEndTime(s.key, e.target.value)}
                className="w-10 bg-[#131722] text-white text-[11px] font-mono px-1 py-0.5 rounded border border-[#2a2e39] outline-none text-center focus:border-blue-500"
                title="Session end hour (0-24)"
                aria-label={`${s.label} end hour`}
              />
              <span className="text-[10px] text-gray-500 font-mono">:00</span>
              <div className="flex-1" />
              <button
                onClick={() => { jumpToSession(s.key); closeAll(); }}
                className="jump-session-action px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded"
              >
                Jump
              </button>
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="relative flex-shrink-0 bg-[#131722] border-t border-[#2a2e39]">
      {marketOrderWarning && (
        <div role="alert" aria-live="assertive" className="absolute bottom-full left-1/2 z-[12000] mb-2 flex max-w-[min(92vw,520px)] -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-500/50 bg-[#1e222d] px-4 py-3 text-xs font-semibold text-amber-200 shadow-2xl">
          <AlertTriangle size={15} className="shrink-0 text-amber-400" />
          <span>{marketOrderWarning}</span>
        </div>
      )}
      {sessionJumpNotice && (
        <div role="status" aria-live="polite" className="absolute bottom-full left-1/2 z-[12000] mb-2 flex max-w-[min(92vw,560px)] -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-500/50 bg-[#1e222d] px-4 py-3 text-xs font-semibold text-amber-200 shadow-2xl">
          <AlertTriangle size={15} className="shrink-0 text-amber-400" />
          <span>{sessionJumpNotice}</span>
        </div>
      )}
      <div className="tradepast-bottom-toolbar flex items-center justify-between gap-3 px-4 py-1.5">
        <div className="bottom-market-meta flex items-center gap-4 flex-shrink-0" aria-label="Market and timezone">
          <div className="flex h-9 items-center gap-1.5 text-white text-[11px] font-bold flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
            <span>{symbol}</span>
          </div>
          <ToolbarSeparator />
          <div className="flex h-9 items-center text-white text-[11px] font-bold flex-shrink-0">
            <span>{timezone}</span>
          </div>
        </div>
        <div className="bottom-replay-controls flex items-center justify-center gap-3 flex-1 min-w-0">
          <button ref={speedButtonRef} onClick={toggleSpeed} className="toolbar-plain-button flex h-9 items-center gap-2 px-2 text-white text-[11px] font-bold flex-shrink-0" title="Auto-play speed in underlying 1-minute candles per second">
            <span className="text-gray-400">Speed</span><span>{replaySpeed}x</span><ChevronDown size={11} className={`transition-transform ${speedOpen ? 'rotate-180' : ''}`} />
          </button>
          <ToolbarSeparator />
          <button type="button" onClick={togglePlay} aria-label={isPlaying ? 'Pause replay' : 'Play replay'} className="toolbar-plain-button h-9 w-9 flex items-center justify-center text-gray-300 hover:text-white">{isPlaying ? <Pause size={17}/> : <Play size={17}/>}</button>
          <button type="button" onClick={() => stepForward()} aria-label="Next bar" className="toolbar-plain-button h-9 w-9 flex items-center justify-center text-gray-300 hover:text-white"><SkipForward size={17}/></button>
          <ToolbarSeparator />
          <button ref={jumpButtonRef} onClick={toggleJump} className="toolbar-plain-button flex h-9 items-center gap-1.5 px-2 text-white text-[11px] font-bold flex-shrink-0" title="Jump to trading session">
            <ArrowUpDown size={12}/><span>Jump</span><ChevronDown size={11} className={`transition-transform ${jumpOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <div className="bottom-trade-actions flex items-center justify-end gap-1.5 flex-shrink-0">
          {!isDrawingMode && !draftPosition ? <>
            <button onClick={() => startDrawing('buy')} className="theme-action-contrast h-9 px-3 bg-[#477fc9] hover:bg-[#3d70b3] text-white rounded font-bold text-[11px] whitespace-nowrap">Long position</button>
            <button onClick={() => startDrawing('sell')} className="theme-action-contrast h-9 px-3 bg-[#d16b70] hover:bg-[#bd5d63] text-white rounded font-bold text-[11px] whitespace-nowrap">Short position</button>
          </> : <div className="position-ready-status flex h-9 min-h-9 items-center gap-2 px-3 rounded-md flex-shrink-0">
            <span className="position-ready-label text-[10px] font-bold whitespace-nowrap">{isDrawingMode ? drawingStep?.toUpperCase() : 'POSITION READY'}</span>
            <button onClick={clearDraft} className="flex h-6 w-6 items-center justify-center text-red-400" title="Cancel position tool"><X size={11}/></button>
          </div>}
          <button onClick={() => handleMarketOrder('buy')} className="theme-action-contrast h-9 px-4 bg-[#29966b] hover:bg-[#23835e] text-white rounded font-bold text-[11px] transition-colors">BUY</button>
          <button onClick={() => handleMarketOrder('sell')} className="theme-action-contrast h-9 px-4 bg-[#d16b70] hover:bg-[#bd5d63] text-white rounded font-bold text-[11px] transition-colors">SELL</button>
        </div>
      </div>

      {jumpOpen && <JumpDropdown />}
      {speedOpen && <SpeedDropdown />}
    </div>
  );
}