import { useStore } from '../store';
import { Play, Pause, SkipForward, History, LineChart, X } from 'lucide-react';

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

export default function ControlPanel() {
  const { 
    stepForward, togglePlay, isPlaying,
    positions, setTimeframe, timeframe, openOrderModal, closeAllPositions,
    pendingOrders, startDrawing, isDrawingMode, drawingStep, clearDraft,
    openHistory, openEquity
  } = useStore();

  return (
    <div className="flex-shrink-0 bg-[#131722] border-t border-[#2a2e39]">
      
      {/* MOBILE */}
      <div className="md:hidden">
        
        {/* Row 1: Timeframes + History + Equity */}
        <div className="flex items-center gap-1 px-1 py-1 border-b border-[#2a2e39]/60">
          <select 
            value={timeframe}
            onChange={(e) => setTimeframe(Number(e.target.value))}
            className="bg-[#1e222d] text-white px-1.5 py-1 rounded border border-[#2a2e39] font-bold text-[10px]"
          >
            {TIMEFRAMES.map(tf => (
              <option key={tf.value} value={tf.value}>{tf.label}</option>
            ))}
          </select>
          
          <div className="flex-1" />
          
          <button 
            onClick={openHistory} 
            className="flex items-center gap-1 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold"
          >
            <History size={10} />
            History
          </button>
          <button 
            onClick={openEquity} 
            className="flex items-center gap-1 px-2 py-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[10px] font-bold"
          >
            <LineChart size={10} />
            Equity
          </button>
        </div>

        {/* Row 2: Draw tools + Trading buttons */}
        <div className="flex items-center gap-1 px-1 py-1 border-b border-[#2a2e39]/60">
          {!isDrawingMode ? (
            <>
              <button 
                onClick={() => startDrawing('buy')} 
                className="flex-1 py-1.5 bg-blue-600/30 text-blue-400 rounded font-bold text-[10px]"
              >
                Long
              </button>
              <button 
                onClick={() => startDrawing('sell')} 
                className="flex-1 py-1.5 bg-red-600/30 text-red-400 rounded font-bold text-[10px]"
              >
                Short
              </button>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-between bg-yellow-900/30 px-2 py-1 rounded">
              <span className="text-yellow-400 text-[10px] font-bold animate-pulse">
                {drawingStep?.toUpperCase()}
              </span>
              <button onClick={clearDraft} className="text-red-400"><X size={12}/></button>
            </div>
          )}
          
          <button 
            onClick={() => openOrderModal('buy')} 
            className="flex-1 py-1.5 bg-green-600 rounded font-bold text-[11px] text-white"
          >
            BUY
          </button>
          <button 
            onClick={() => openOrderModal('sell')} 
            className="flex-1 py-1.5 bg-red-600 rounded font-bold text-[11px] text-white"
          >
            SELL
          </button>
          
          {positions.length > 0 && (
            <button 
              onClick={closeAllPositions} 
              className="py-1.5 px-2 bg-yellow-600 rounded font-bold text-[10px] text-white whitespace-nowrap"
            >
              ✕ {positions.length}
            </button>
          )}
        </div>

        {/* Row 3: Playback — always visible, dedicated row */}
        <div className="flex items-center gap-1.5 px-1.5 py-1">
          <button 
            onClick={togglePlay}
            className="flex-1 py-1.5 bg-blue-600 active:bg-blue-700 rounded text-white font-bold flex items-center justify-center gap-1.5"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span className="text-[11px]">{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <button 
            onClick={stepForward}
            className="py-1.5 px-3 bg-[#1e222d] active:bg-[#2a2e39] rounded text-white font-bold"
          >
            <SkipForward size={14} />
          </button>
          
          {pendingOrders.length > 0 && (
            <div className="text-[10px] text-yellow-400 bg-yellow-900/30 py-1.5 px-2 rounded font-bold whitespace-nowrap">
              {pendingOrders.length} P
            </div>
          )}
        </div>
      </div>

      {/* DESKTOP */}
      <div className="hidden md:flex p-2 items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-[#1e222d] px-3 py-1.5 rounded-lg">
          <button onClick={togglePlay} className="hover:text-blue-400">
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button onClick={stepForward} className="hover:text-blue-400"><SkipForward size={18} /></button>
        </div>

        <div className="flex items-center gap-1 bg-[#1e222d] p-1 rounded-lg">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                timeframe === tf.value 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-[#2a2e39]'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {!isDrawingMode ? (
            <>
              <button onClick={() => startDrawing('buy')} className="px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-400 rounded text-xs font-bold">
                Long position
              </button>
              <button onClick={() => startDrawing('sell')} className="px-3 py-1.5 bg-red-600/30 hover:bg-red-600/50 text-red-400 rounded text-xs font-bold">
                Short position
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 bg-yellow-900/30 px-3 py-1.5 rounded-lg">
              <span className="text-yellow-400 text-xs font-bold animate-pulse">
                Click chart: {drawingStep?.toUpperCase()}
              </span>
              <button onClick={clearDraft} className="text-red-400 text-xs hover:underline">Cancel</button>
            </div>
          )}
        </div>

        {pendingOrders.length > 0 && (
          <div className="text-xs text-yellow-400 bg-yellow-900/30 px-3 py-1.5 rounded-lg">
            {pendingOrders.length} Pending
          </div>
        )}

        <div className="flex items-center gap-2">
          <button onClick={openHistory} className="px-3 py-1.5 bg-[#1e222d] hover:bg-[#2a2e39] rounded text-xs font-bold border border-[#2a2e39]">
            History
          </button>
          <button onClick={openEquity} className="px-3 py-1.5 bg-[#1e222d] hover:bg-[#2a2e39] rounded text-xs font-bold border border-[#2a2e39]">
            Equity
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => openOrderModal('buy')} className="px-4 py-1.5 bg-green-600 hover:bg-green-700 rounded font-bold text-sm">BUY</button>
          <button onClick={() => openOrderModal('sell')} className="px-4 py-1.5 bg-red-600 hover:bg-red-700 rounded font-bold text-sm">SELL</button>
          {positions.length > 0 && (
            <button onClick={closeAllPositions} className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded font-bold text-xs">
              CLOSE ALL ({positions.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}