import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { X, ChevronDown, Check } from 'lucide-react';

const TIMEFRAMES = [
  { label: '1m', value: 1 },
  { label: '5m', value: 5 },
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '4h', value: 240 },
  { label: 'D', value: 1440 },
  { label: 'W', value: 10080 },
];

const SYMBOLS = [
  { code: 'XAUUSD', source: 'Dukascopy', available: true },
  { code: 'EURUSD', source: 'Dukascopy', available: false },
  { code: 'CHFJPY', source: 'Dukascopy', available: false },
  { code: 'GBPAUD', source: 'Dukascopy', available: false },
];

const TIMEZONES = [
  { code: 'UTC+3', label: 'UTC+3', available: true },
  { code: 'UTC+2', label: 'UTC+2', available: false },
  { code: 'UTC+1', label: 'UTC+1', available: false },
  { code: 'UTC',   label: 'UTC',   available: false },
];

export default function ControlPanel() {
  const { 
    positions, setTimeframe, timeframe, closeAllPositions, openOrderModal,
    pendingOrders, startDrawing, isDrawingMode, drawingStep, clearDraft,
    openHistory, openEquity, symbol, setSymbol, timezone, setTimezone
  } = useStore();

  const [symbolOpen, setSymbolOpen] = useState(false);
  const [tzOpen, setTzOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSymbolOpen(false);
        setTzOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleSymbol = () => {
    setSymbolOpen(o => !o);
    setTzOpen(false);
  };
  const toggleTz = () => {
    setTzOpen(o => !o);
    setSymbolOpen(false);
  };

  return (
    <div className="flex-shrink-0 bg-[#131722] border-t border-[#2a2e39] relative z-40">
      <div className="flex items-center justify-between gap-1 px-1.5 py-1.5 overflow-x-auto">

        {/* SYMBOL SELECTOR (left) */}
        <div className="relative flex-shrink-0 z-50">
          <button
            onClick={toggleSymbol}
            className="flex items-center gap-1 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold hover:bg-[#2a2e39] transition-colors"
            title="Symbol"
          >
            <span>{symbol}</span>
            <ChevronDown size={10} className={`transition-transform ${symbolOpen ? 'rotate-180' : ''}`} />
          </button>

          {symbolOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSymbolOpen(false)}
              />
              <div className="absolute bottom-full left-0 mb-1 z-[100] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[200px] overflow-hidden">
                <div className="px-3 py-1.5 border-b border-[#2a2e39] text-[9px] font-bold uppercase text-gray-500 tracking-wide">
                  Choose Symbol
                </div>
                {SYMBOLS.map(s => {
                  const isSelected = symbol === s.code;
                  const isAvailable = s.available;
                  return (
                    <button
                      key={s.code}
                      onClick={() => {
                        if (isAvailable) {
                          setSymbol(s.code);
                          setSymbolOpen(false);
                        }
                      }}
                      disabled={!isAvailable}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left transition-colors ${
                        isAvailable
                          ? 'text-white hover:bg-[#2a2e39] cursor-pointer'
                          : 'text-gray-600 cursor-not-allowed'
                      } ${isSelected && isAvailable ? 'bg-blue-600/15' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-3 flex items-center justify-center">
                          {isSelected && isAvailable && <Check size={10} className="text-blue-400" />}
                        </span>
                        <span className={isSelected && isAvailable ? 'font-bold' : ''}>{s.code}</span>
                      </div>
                      <span className={`text-[9px] ${isAvailable ? 'text-gray-400' : 'text-gray-700'}`}>
                        {s.source}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* MIDDLE — all trading controls */}
        <div className="flex items-center justify-center gap-1 flex-1 min-w-0 flex-wrap">

          {/* Timeframes */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-1.5 py-1 rounded text-[10px] font-bold transition-colors ${
                  timeframe === tf.value 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-[#2a2e39]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Long/Short draw */}
          {!isDrawingMode ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button 
                onClick={() => startDrawing('buy')} 
                className="px-2 py-1 bg-blue-600/30 text-blue-400 rounded font-bold text-[10px] whitespace-nowrap"
              >
                Long position
              </button>
              <button 
                onClick={() => startDrawing('sell')} 
                className="px-2 py-1 bg-red-600/30 text-red-400 rounded font-bold text-[10px] whitespace-nowrap"
              >
                Short position
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-yellow-900/30 px-2 py-1 rounded flex-shrink-0">
              <span className="text-yellow-400 text-[10px] font-bold animate-pulse whitespace-nowrap">
                {drawingStep?.toUpperCase()}
              </span>
              <button onClick={clearDraft} className="text-red-400"><X size={11}/></button>
            </div>
          )}

          {/* History + Equity */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button 
              onClick={openHistory} 
              className="px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold"
            >
              History
            </button>
            <button 
              onClick={openEquity} 
              className="px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold"
            >
              Equity
            </button>
          </div>

          {/* Close all + Pending */}
          {positions.length > 0 && (
            <button 
              onClick={closeAllPositions} 
              className="px-2 py-1 bg-yellow-600 rounded font-bold text-[10px] text-white whitespace-nowrap flex-shrink-0"
            >
              ✕ {positions.length}
            </button>
          )}
          {pendingOrders.length > 0 && (
            <div className="px-2 py-1 text-[10px] text-yellow-400 bg-yellow-900/30 rounded font-bold whitespace-nowrap flex-shrink-0">
              {pendingOrders.length}P
            </div>
          )}

          {/* BUY / SELL */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button 
              onClick={() => openOrderModal('buy')} 
              className="px-3 py-1.5 bg-green-600 active:bg-green-700 rounded font-bold text-xs text-white"
            >
              BUY
            </button>
            <button 
              onClick={() => openOrderModal('sell')} 
              className="px-3 py-1.5 bg-red-600 active:bg-red-700 rounded font-bold text-xs text-white"
            >
              SELL
            </button>
          </div>
        </div>

        {/* TIMEZONE SELECTOR (right) */}
        <div className="relative flex-shrink-0 z-50">
          <button
            onClick={toggleTz}
            className="flex items-center gap-1 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold hover:bg-[#2a2e39] transition-colors"
            title="Timezone"
          >
            <span>{timezone}</span>
            <ChevronDown size={10} className={`transition-transform ${tzOpen ? 'rotate-180' : ''}`} />
          </button>

          {tzOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setTzOpen(false)}
              />
              <div className="absolute bottom-full right-0 mb-1 z-[100] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[140px] overflow-hidden">
                <div className="px-3 py-1.5 border-b border-[#2a2e39] text-[9px] font-bold uppercase text-gray-500 tracking-wide">
                  Timezone
                </div>
                {TIMEZONES.map(tz => {
                  const isSelected = timezone === tz.code;
                  const isAvailable = tz.available;
                  return (
                    <button
                      key={tz.code}
                      onClick={() => {
                        if (isAvailable) {
                          setTimezone(tz.code);
                          setTzOpen(false);
                        }
                      }}
                      disabled={!isAvailable}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left transition-colors ${
                        isAvailable
                          ? 'text-white hover:bg-[#2a2e39] cursor-pointer'
                          : 'text-gray-600 cursor-not-allowed'
                      } ${isSelected && isAvailable ? 'bg-blue-600/15' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-3 flex items-center justify-center">
                          {isSelected && isAvailable && <Check size={10} className="text-blue-400" />}
                        </span>
                        <span className={isSelected && isAvailable ? 'font-bold' : ''}>{tz.label}</span>
                      </div>
                      {!isAvailable && (
                        <span className="text-[9px] text-gray-700">soon</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}