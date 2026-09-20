import { useStore } from '../store';
import { Play, Pause, SkipForward } from 'lucide-react';

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
    <div className="p-3 bg-[#131722] border-t border-[#2a2e39] flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 bg-[#1e222d] px-4 py-2 rounded-lg">
        <button onClick={togglePlay} className="hover:text-blue-400">
          {isPlaying ? <Pause size={24} /> : <Play size={24} />}
        </button>
        <button onClick={stepForward} className="hover:text-blue-400"><SkipForward size={20} /></button>
      </div>

      <div className="flex items-center gap-1 bg-[#1e222d] p-1 rounded-lg">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf.value}
            onClick={() => setTimeframe(tf.value)}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
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
            <button onClick={() => startDrawing('buy')} className="px-3 py-2 bg-blue-600/30 hover:bg-blue-600/50 text-blue-400 rounded text-xs font-bold">
              Long position
            </button>
            <button onClick={() => startDrawing('sell')} className="px-3 py-2 bg-red-600/30 hover:bg-red-600/50 text-red-400 rounded text-xs font-bold">
              Short position
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 bg-yellow-900/30 px-3 py-2 rounded-lg">
            <span className="text-yellow-400 text-xs font-bold animate-pulse">
              Click chart: {drawingStep?.toUpperCase()}
            </span>
            <button onClick={clearDraft} className="text-red-400 text-xs hover:underline">Cancel</button>
          </div>
        )}
      </div>

      {pendingOrders.length > 0 && (
        <div className="text-xs text-yellow-400 bg-yellow-900/30 px-3 py-2 rounded-lg">
          {pendingOrders.length} Pending
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={openHistory} className="px-4 py-2 bg-[#1e222d] hover:bg-[#2a2e39] rounded text-xs font-bold border border-[#2a2e39]">
          History
        </button>
        <button onClick={openEquity} className="px-4 py-2 bg-[#1e222d] hover:bg-[#2a2e39] rounded text-xs font-bold border border-[#2a2e39]">
          Equity
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => openOrderModal('buy')} className="px-5 py-2 bg-green-600 hover:bg-green-700 rounded font-bold">BUY</button>
        <button onClick={() => openOrderModal('sell')} className="px-5 py-2 bg-red-600 hover:bg-red-700 rounded font-bold">SELL</button>
        {positions.length > 0 && (
          <button onClick={closeAllPositions} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-bold text-sm">
            CLOSE ALL ({positions.length})
          </button>
        )}
      </div>
    </div>
  );
}