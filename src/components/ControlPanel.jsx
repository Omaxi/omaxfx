import { useStore } from '../store';
import { X } from 'lucide-react';

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
    positions, setTimeframe, timeframe, closeAllPositions, openOrderModal,
    pendingOrders, startDrawing, isDrawingMode, drawingStep, clearDraft,
    openHistory, openEquity
  } = useStore();

  return (
    <div className="flex-shrink-0 bg-[#131722] border-t border-[#2a2e39]">
      <div className="flex items-center gap-1 px-1.5 py-1.5 overflow-x-auto">
        
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

        <div className="flex-1 min-w-2" />

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
    </div>
  );
}