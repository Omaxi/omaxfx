import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { X, ChevronDown, Check, BarChart3, Palette, Sunrise, Sun, Sunset, ArrowUpDown, CandlestickChart } from 'lucide-react';

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

const SYMBOLS = [
  { code: 'XAUUSD', source: 'Dukascopy', available: true },
  { code: 'EURUSD', source: 'Dukascopy', available: false },
  { code: 'CHFJPY', source: 'Dukascopy', available: false },
  { code: 'GBPAUD', source: 'Dukascopy', available: false },
];

const TIMEZONES = [
  { code: 'UTC-3', label: 'UTC-3' }, { code: 'UTC-2', label: 'UTC-2' }, { code: 'UTC-1', label: 'UTC-1' },
  { code: 'UTC', label: 'UTC' },
  { code: 'UTC+1', label: 'UTC+1' }, { code: 'UTC+2', label: 'UTC+2' }, { code: 'UTC+3', label: 'UTC+3' },
];

const SESSIONS = [
  { key: 'asian',   label: 'Asian',    icon: Sunrise, color: 'text-orange-400' },
  { key: 'london',  label: 'London',   icon: Sun,     color: 'text-blue-400' },
  { key: 'newyork', label: 'New York', icon: Sunset,  color: 'text-purple-400' },
];

export default function ControlPanel() {
  const { 
    positions, setTimeframe, timeframe, closeAllPositions, openOrderModal,
    pendingOrders, startDrawing, isDrawingMode, drawingStep, clearDraft,
    openHistory, openEquity, openAnalytics, openTheme,
    symbol, setSymbol, timezone, setTimezone,
    sessionTimes, setSessionTime, jumpToSession,
    chartType, setChartType
  } = useStore();

  const [symbolOpen, setSymbolOpen] = useState(false);
  const [tzOpen, setTzOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [ctOpen, setCtOpen] = useState(false);

  const tfButtonRef = useRef(null);
  const jumpButtonRef = useRef(null);
  const ctButtonRef = useRef(null);
  const [tfLeft, setTfLeft] = useState(0);
  const [jumpLeft, setJumpLeft] = useState(0);
  const [ctLeft, setCtLeft] = useState(0);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSymbolOpen(false); setTzOpen(false); setTfOpen(false); setJumpOpen(false); setCtOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeAll = () => { 
    setSymbolOpen(false); setTzOpen(false); setTfOpen(false); setJumpOpen(false); setCtOpen(false);
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

  const tfLabel = TIMEFRAMES.find(t => t.value === timeframe)?.label || '1 min';

  const SymbolDropdown = () => (
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={closeAll} />
      <div className="fixed bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[220px] overflow-hidden" style={{ zIndex: 9999, left: 8, bottom: 52 }}>
        <div className="px-3 py-1.5 border-b border-[#2a2e39] text-[9px] font-bold uppercase text-gray-500 tracking-wide">Choose Symbol</div>
        {SYMBOLS.map(s => {
          const isSelected = symbol === s.code;
          const isAvailable = s.available;
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
                <span className={isSelected && isAvailable ? 'font-bold' : ''}>{s.code}</span>
              </div>
              <span className={`text-[9px] ${isAvailable ? 'text-gray-400' : 'text-gray-700'}`}>{s.source}</span>
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
      <div className="fixed bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[140px] overflow-hidden" style={{ zIndex: 9999, left: tfLeft, bottom: 52 }}>
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

  const ChartTypeDropdown = () => (
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={closeAll} />
      <div className="fixed bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[130px] overflow-hidden" style={{ zIndex: 9999, left: ctLeft, bottom: 52 }}>
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
      <div className="fixed bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[260px]" style={{ zIndex: 9999, left: jumpLeft, bottom: 52 }}>
        <div className="px-3 py-1.5 border-b border-[#2a2e39] text-[9px] font-bold uppercase text-gray-500 tracking-wide flex justify-between items-center">
          <span>Jump to Session</span>
          <span className="text-[8px] text-gray-600 normal-case">chart hour</span>
        </div>
        {SESSIONS.map(s => {
          const Icon = s.icon;
          const hour = sessionTimes[s.key];
          return (
            <div key={s.key} className="flex items-center gap-2 px-3 py-2 hover:bg-[#2a2e39]/40">
              <Icon size={12} className={s.color} />
              <span className="text-xs text-white font-bold w-16">{s.label}</span>
              <input
                type="number"
                min="0"
                max="23"
                value={hour}
                onChange={(e) => setSessionTime(s.key, e.target.value)}
                className="w-12 bg-[#131722] text-white text-[11px] font-mono px-1.5 py-0.5 rounded border border-[#2a2e39] outline-none text-center focus:border-blue-500"
                title="Hour (0-23)"
              />
              <span className="text-[10px] text-gray-500 font-mono">:00</span>
              <div className="flex-1" />
              <button
                onClick={() => { jumpToSession(s.key); closeAll(); }}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded"
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
    <div className="flex-shrink-0 bg-[#131722] border-t border-[#2a2e39]">
      <div className="flex items-center justify-between gap-1 px-1.5 py-1.5 overflow-x-auto">

        <button onClick={toggleSymbol}
          className="flex items-center gap-1 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold hover:bg-[#2a2e39] transition-colors flex-shrink-0">
          <span>{symbol}</span>
          <ChevronDown size={10} className={`transition-transform ${symbolOpen ? 'rotate-180' : ''}`} />
        </button>

        <div className="flex items-center justify-center gap-1 flex-1 min-w-0 flex-wrap">

          <button ref={tfButtonRef} onClick={toggleTf}
            className="flex items-center gap-1 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold hover:bg-[#2a2e39] transition-colors flex-shrink-0">
            <span>{tfLabel}</span>
            <ChevronDown size={10} className={`transition-transform ${tfOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Chart type button */}
          <button ref={ctButtonRef} onClick={toggleCt}
            className="flex items-center gap-1 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold hover:bg-[#2a2e39] transition-colors flex-shrink-0"
            title="Chart type">
            <CandlestickChart size={11} />
            <ChevronDown size={10} className={`transition-transform ${ctOpen ? 'rotate-180' : ''}`} />
          </button>

          <button ref={jumpButtonRef} onClick={toggleJump}
            className="flex items-center gap-1 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold hover:bg-[#2a2e39] transition-colors flex-shrink-0"
            title="Jump to trading session">
            <ArrowUpDown size={10} />
            <span>Jump</span>
            <ChevronDown size={10} className={`transition-transform ${jumpOpen ? 'rotate-180' : ''}`} />
          </button>

          {!isDrawingMode ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => startDrawing('buy')} className="px-2 py-1 bg-blue-600/30 text-blue-400 rounded font-bold text-[10px] whitespace-nowrap">Long position</button>
              <button onClick={() => startDrawing('sell')} className="px-2 py-1 bg-red-600/30 text-red-400 rounded font-bold text-[10px] whitespace-nowrap">Short position</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-yellow-900/30 px-2 py-1 rounded flex-shrink-0">
              <span className="text-yellow-400 text-[10px] font-bold animate-pulse whitespace-nowrap">{drawingStep?.toUpperCase()}</span>
              <button onClick={clearDraft} className="text-red-400"><X size={11}/></button>
            </div>
          )}

          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={openHistory} className="px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold">History</button>
            <button onClick={openEquity} className="px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold">Equity</button>
            <button onClick={openAnalytics} title="Advanced Analytics"
              className="p-1.5 bg-[#1e222d] rounded border border-[#2a2e39] text-blue-400 hover:bg-[#2a2e39] transition-colors">
              <BarChart3 size={12} />
            </button>
            <button onClick={openTheme} title="Chart Appearance"
              className="p-1.5 bg-[#1e222d] rounded border border-[#2a2e39] text-purple-400 hover:bg-[#2a2e39] transition-colors">
              <Palette size={12} />
            </button>
          </div>

          {positions.length > 0 && (
            <button onClick={closeAllPositions} className="px-2 py-1 bg-yellow-600 rounded font-bold text-[10px] text-white whitespace-nowrap flex-shrink-0">✕ {positions.length}</button>
          )}
          {pendingOrders.length > 0 && (
            <div className="px-2 py-1 text-[10px] text-yellow-400 bg-yellow-900/30 rounded font-bold whitespace-nowrap flex-shrink-0">{pendingOrders.length}P</div>
          )}

          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => openOrderModal('buy')} className="px-3 py-1.5 bg-green-600 active:bg-green-700 rounded font-bold text-xs text-white">BUY</button>
            <button onClick={() => openOrderModal('sell')} className="px-3 py-1.5 bg-red-600 active:bg-red-700 rounded font-bold text-xs text-white">SELL</button>
          </div>
        </div>

        <button onClick={toggleTz}
          className="flex items-center gap-1 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold hover:bg-[#2a2e39] transition-colors flex-shrink-0">
          <span>{timezone}</span>
          <ChevronDown size={10} className={`transition-transform ${tzOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {symbolOpen && <SymbolDropdown />}
      {tzOpen && <TzDropdown />}
      {tfOpen && <TimeframeDropdown />}
      {ctOpen && <ChartTypeDropdown />}
      {jumpOpen && <JumpDropdown />}
    </div>
  );
}