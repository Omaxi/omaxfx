import { useStore } from '../store';
import { X } from 'lucide-react';

const PRESET_COLORS = [
  '#ffffff', '#ef5350', '#26a69a', '#3b82f6',
  '#f59e0b', '#a855f7', '#22c55e', '#06b6d4',
  '#eab308', '#f43f5e', '#84cc16', '#ec4899',
];

export default function StylePanel({ selectedId, onClose }) {
  const { drawings, updateDrawing, snapshotDrawings } = useStore();
  const drawing = drawings.find(d => d.id === selectedId);
  if (!drawing) return null;

  const currentBorder = drawing.borderColor || drawing.color || '#f59e0b';
  const currentFill = drawing.fillColor || (currentBorder + '33');
  const currentWidth = drawing.lineWidth ?? 1;
  const showBorder = drawing.showBorder !== false; // Default to true

  const supportsFill = ['rectangle', 'fibonacci', 'volumeProfile'].includes(drawing.type);

  const commit = (patch) => {
    snapshotDrawings();
    updateDrawing(selectedId, patch);
  };

  return (
    <div 
      className="absolute top-14 right-2 z-40 w-56 bg-[#131722]/98 backdrop-blur border border-[#2a2e39] rounded-lg shadow-2xl overflow-hidden"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex justify-between items-center px-3 py-2 border-b border-[#2a2e39]">
        <div className="text-[11px] font-bold text-white uppercase tracking-wide">Style</div>
        <button 
          onClick={onClose}
          className="p-0.5 hover:bg-[#2a2e39] rounded"
        >
          <X size={12} className="text-gray-400" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Show Border Toggle */}
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-gray-400 uppercase font-bold">Show Border Line</div>
          <button
            onClick={() => commit({ showBorder: !showBorder })}
            className={`w-8 h-4 rounded-full transition-colors relative ${showBorder ? 'bg-blue-600' : 'bg-[#2a2e39]'}`}
          >
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${showBorder ? 'left-4' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Border/Line color */}
        <div>
          <div className="text-[10px] text-gray-400 uppercase font-bold mb-1.5">Line Color</div>
          <div className="grid grid-cols-6 gap-1">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => commit({ borderColor: c, color: c })}
                className={`w-full aspect-square rounded border-2 transition-transform hover:scale-110 ${
                  currentBorder.toLowerCase() === c.toLowerCase() ? 'border-white' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="color"
              value={currentBorder}
              onChange={(e) => commit({ borderColor: e.target.value, color: e.target.value })}
              className="w-8 h-7 rounded bg-transparent cursor-pointer"
            />
            <input
              type="text"
              value={currentBorder}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                  commit({ borderColor: v, color: v });
                }
              }}
              className="flex-1 bg-[#1e222d] text-white text-[11px] font-mono px-2 py-1 rounded border border-[#2a2e39] outline-none"
            />
          </div>
        </div>

        {/* Fill color — only for shapes */}
        {supportsFill && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase font-bold mb-1.5">Fill Color</div>
            <div className="grid grid-cols-6 gap-1">
              {PRESET_COLORS.map(c => {
                const fillVariant = c + '33';
                return (
                  <button
                    key={c}
                    onClick={() => commit({ fillColor: fillVariant })}
                    className={`w-full aspect-square rounded border-2 transition-transform hover:scale-110 relative overflow-hidden ${
                      currentFill.toLowerCase() === fillVariant.toLowerCase() ? 'border-white' : 'border-transparent'
                    }`}
                  >
                    <div className="absolute inset-0" style={{ backgroundColor: c + '55' }} />
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="color"
                value={currentFill.substring(0, 7)}
                onChange={(e) => commit({ fillColor: e.target.value + '33' })}
                className="w-8 h-7 rounded bg-transparent cursor-pointer"
              />
              <input
                type="text"
                value={currentFill}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9a-fA-F]{0,8}$/.test(v)) {
                    commit({ fillColor: v });
                  }
                }}
                className="flex-1 bg-[#1e222d] text-white text-[11px] font-mono px-2 py-1 rounded border border-[#2a2e39] outline-none"
              />
            </div>
          </div>
        )}

        {/* Line width — only show if border is enabled */}
        {showBorder && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase font-bold mb-1.5">
              Line Width — {currentWidth}px
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="1"
                max="6"
                step="1"
                value={currentWidth}
                onChange={(e) => commit({ lineWidth: Number(e.target.value) })}
                className="flex-1 accent-blue-500"
              />
              <span className="text-[11px] text-gray-300 font-mono w-6 text-right">{currentWidth}</span>
            </div>
            <div className="flex gap-1 mt-2">
              {[1, 2, 3, 4].map(w => (
                <button
                  key={w}
                  onClick={() => commit({ lineWidth: w })}
                  className={`flex-1 py-1 rounded text-[10px] font-bold transition-colors ${
                    currentWidth === w 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-[#1e222d] text-gray-400 hover:bg-[#2a2e39]'
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}