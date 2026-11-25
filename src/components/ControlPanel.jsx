import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { X, ChevronDown, Check, Sunrise, Sun, Sunset, ArrowUpDown, CandlestickChart, AlertTriangle } from 'lucide-react';

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
const SYMBOLS = [
  { code: 'XAUUSD', source: 'Dukascopy', available: true },
  { code: 'EURUSD', source: 'Dukascopy', available: true },
  { code: 'CHFJPY', source: 'Dukascopy', available: false },
  { code: 'GBPAUD', source: 'Dukascopy', available: false },
];

const TIMEZONES = [
  { code: 'UTC+3', label: 'UTC+3 (project data timezone)' },
];

const SESSIONS = [
  { key: 'asian',   label: 'Asia', icon: Sunrise, color: 'text-orange-400' },
  { key: 'london',  label: 'London',   icon: Sun,     color: 'text-blue-400' },
  { key: 'newyork', label: 'New York', icon: Sunset,  color: 'text-purple-400' },
];

export default function ControlPanel() {
  const { 
    positions, setTimeframe, timeframe, closeAllPositions, openOrderModal,
    pendingOrders, startDrawing, isDrawingMode, drawingStep, draftPosition, clearDraft,
    symbol, setSymbol, timezone, setTimezone,
    sessionTimes, sessionEndTimes, setSessionTime, setSessionEndTime, jumpToSession,
    chartType, setChartType, allRawDataBySymbol, replaySpeed, setReplaySpeed
  } = useStore();

  const [symbolOpen, setSymbolOpen] = useState(false);
  const [tzOpen, setTzOpen] = useState(false);
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
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSymbolOpen(false); setTzOpen(false); setTfOpen(false); setJumpOpen(false); setCtOpen(false); setSpeedOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeAll = () => { 
    setSymbolOpen(false); setTzOpen(false); setTfOpen(false); setJumpOpen(false); setCtOpen(false); setSpeedOpen(false);
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
  const toggleSymbol = () => { const o = !symbolOpen; closeAll(); setSymbolOpen(o); };
  const toggleTz = () => { const o = !tzOpen; closeAll(); setTzOpen(o); };
  
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
  const symbolChoices = [...SYMBOLS.filter(s => allRawDataBySymbol[s.code]?.length), ...Object.keys(allRawDataBySymbol).filter(code => !SYMBOLS.some(s => s.code === code)).map(code => ({ code, source: 'Imported', available: true }))];

  const SymbolDropdown = () => (
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={closeAll} />
      <div className="fixed bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[240px] overflow-hidden" style={{ zIndex: 9999, left: 8, bottom: 52 }}>
        <div className="px-3 py-1.5 border-b border-[#2a2e39] text-[9px] font-bold uppercase text-gray-500 tracking-wide flex justify-between items-center">
          <span>Choose Symbol</span>
          <span className="text-[8px] text-gray-600 normal-case">green = data loaded</span>
        </div>
        {symbolChoices.map(s => {
          const isSelected = symbol === s.code;
          const isAvailable = !!allRawDataBySymbol[s.code]?.length;
          return (
            <button key={s.code}
              onClick={() => { if (isAvailable) { setSymbol(s.code); closeAll(); } }}
              disabled={!isAvailable}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left transition-colors ${
                isAvailable ? 'text-white hover:bg-[#2a2e39] cursor-pointer' : 'text-gray-600 cursor-not-allowed'
              } ${isSelected && isAvailable ? 'bg-blue-600/15' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="w-3 flex items-center justify-center">
                  {isSelected && isAvailable && <Check size={10} className="text-blue-400" />}
                </span>
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isAvailable
                      ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)]'
                      : 'bg-gray-700'
                  }`}
                  title={s.source === 'Imported' ? 'User imported data' : 'Data loaded'}
                />
                <span className={`${isSelected && isAvailable ? 'font-bold' : ''} ${isAvailable ? '' : 'italic'}`}>
                  {s.code}
                </span>
              </div>
              <span className={`text-[9px] ${isAvailable ? 'text-emerald-400' : 'text-gray-700'}`}>
                {s.source === 'Imported' ? 'Imported' : 'Ready'}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );

  const TzDropdown = () => (
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={closeAll} />
      <div className="fixed bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[160px] overflow-hidden max-h-[70vh] overflow-y-auto" style={{ zIndex: 9999, right: 8, bottom: 52 }}>
        <div className="px-3 py-1.5 border-b border-[#2a2e39] text-[9px] font-bold uppercase text-gray-500 tracking-wide sticky top-0 bg-[#1e222d]">Timezone</div>
        {TIMEZONES.map(tz => {
          const isSelected = timezone === tz.code;
          return (
            <button key={tz.code}
              onClick={() => { setTimezone(tz.code); closeAll(); }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left text-white hover:bg-[#2a2e39] cursor-pointer ${isSelected ? 'bg-blue-600/15' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="w-3 flex items-center justify-center">
                  {isSelected && <Check size={10} className="text-blue-400" />}
                </span>
                <span className={isSelected ? 'font-bold' : ''}>{tz.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );

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
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left text-white hover:bg-[#2a2e39] cursor-pointer ${isSelected ? 'bg-blue-600/15' : ''}`}>
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
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left text-white hover:bg-[#2a2e39] cursor-pointer ${isSelected ? 'bg-blue-600/15' : ''}`}>
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
      <div className="theme-menu-surface fixed bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[260px]" style={{ zIndex: 9999, left: jumpLeft, bottom: 52 }}>
        <div className="px-3 py-1.5 border-b border-[#2a2e39] text-[9px] font-bold uppercase text-gray-500 tracking-wide flex justify-between items-center">
          <span>Jump to Session</span>
          <span className="text-[8px] text-gray-600 normal-case">UTC+3</span>
        </div>
        {SESSIONS.map(s => {
          const Icon = s.icon;
          const hour = sessionTimes[s.key];
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
                value={sessionEndTimes[s.key] ?? 24}
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
      <div className="flex items-center justify-between gap-1 px-1.5 py-1.5 overflow-x-auto">

        <button onClick={toggleSymbol}
          className="flex h-9 items-center gap-1.5 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold hover:bg-[#2a2e39] transition-colors flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
          <span>{symbol}</span>
          <ChevronDown size={10} className={`transition-transform ${symbolOpen ? 'rotate-180' : ''}`} />
        </button>

        <div className="flex items-center justify-center gap-1 flex-1 min-w-0 flex-wrap">

          <button ref={tfButtonRef} onClick={toggleTf}
            className="flex h-9 items-center gap-1 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold hover:bg-[#2a2e39] transition-colors flex-shrink-0">
            <span>{tfLabel}</span>
            <ChevronDown size={10} className={`transition-transform ${tfOpen ? 'rotate-180' : ''}`} />
          </button>

          <button ref={speedButtonRef} onClick={toggleSpeed}
            className="flex h-9 items-center gap-1.5 px-2.5 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold hover:bg-[#2a2e39] transition-colors flex-shrink-0"
            title="Auto-play speed in underlying 1-minute candles per second">
            <span className="text-gray-400">Speed</span>
            <span>{replaySpeed} bar/s</span>
            <ChevronDown size={10} className={`transition-transform ${speedOpen ? 'rotate-180' : ''}`} />
          </button>

          <button ref={ctButtonRef} onClick={toggleCt}
            className="flex h-9 items-center gap-1 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold hover:bg-[#2a2e39] transition-colors flex-shrink-0"
            title="Chart type">
            <CandlestickChart size={11} />
            <ChevronDown size={10} className={`transition-transform ${ctOpen ? 'rotate-180' : ''}`} />
          </button>

          <button ref={jumpButtonRef} onClick={toggleJump}
            className="theme-menu-item flex h-9 items-center gap-1 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold hover:bg-[#2a2e39] transition-colors flex-shrink-0"
            title="Jump to trading session">
            <ArrowUpDown size={10} />
            <span>Jump</span>
            <ChevronDown size={10} className={`transition-transform ${jumpOpen ? 'rotate-180' : ''}`} />
          </button>

          {!isDrawingMode && !draftPosition ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => startDrawing('buy')} className="h-9 px-2 py-1 bg-blue-600/30 text-blue-400 rounded font-bold text-[10px] whitespace-nowrap">Long position</button>
              <button onClick={() => startDrawing('sell')} className="h-9 px-2 py-1 bg-red-600/30 text-red-400 rounded font-bold text-[10px] whitespace-nowrap">Short position</button>
            </div>
          ) : (
            <div className="flex h-9 min-h-9 items-center gap-2 bg-yellow-900/30 px-2 rounded flex-shrink-0">
              <span className="text-yellow-400 text-[10px] font-bold whitespace-nowrap">{isDrawingMode ? drawingStep?.toUpperCase() : 'POSITION READY'}</span>
              <button onClick={clearDraft} className="flex h-6 w-6 items-center justify-center rounded text-red-400 hover:bg-red-500/10" title="Cancel position tool"><X size={11}/></button>
            </div>
          )}

          {positions.length > 0 && (
            <button onClick={closeAllPositions} className="flex h-9 min-h-9 items-center justify-center px-2 bg-yellow-600 rounded font-bold text-[10px] text-white whitespace-nowrap flex-shrink-0">✕ {positions.length}</button>
          )}
          {pendingOrders.length > 0 && (
            <div className="flex h-9 min-h-9 items-center justify-center px-2 text-[10px] text-yellow-400 bg-yellow-900/30 rounded font-bold whitespace-nowrap flex-shrink-0">{pendingOrders.length}P</div>
          )}

          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => handleMarketOrder('buy')} className="h-9 px-3 bg-green-600/30 hover:bg-green-600/40 active:bg-green-600/50 text-green-400 rounded font-bold text-xs transition-colors">BUY</button>
            <button onClick={() => handleMarketOrder('sell')} className="h-9 px-3 bg-red-600/30 hover:bg-red-600/40 active:bg-red-600/50 text-red-400 rounded font-bold text-xs transition-colors">SELL</button>
          </div>
        </div>

        <button onClick={toggleTz}
          className="flex h-9 items-center gap-1 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold hover:bg-[#2a2e39] transition-colors flex-shrink-0">
          <span>{timezone}</span>
          <ChevronDown size={10} className={`transition-transform ${tzOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {symbolOpen && <SymbolDropdown />}
      {tzOpen && <TzDropdown />}
      {tfOpen && <TimeframeDropdown />}
      {ctOpen && <ChartTypeDropdown />}
      {jumpOpen && <JumpDropdown />}
      {speedOpen && <SpeedDropdown />}
    </div>
  );
}