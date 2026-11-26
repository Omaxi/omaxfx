import { useState } from 'react';
import { useStore } from '../store';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const PRESET_COLORS = [
  '#ffffff', '#ef5350', '#26a69a', '#3b82f6',
  '#f59e0b', '#a855f7', '#22c55e', '#06b6d4',
  '#eab308', '#f43f5e', '#84cc16', '#ec4899',
];

export default function StylePanel({ selectedId, onClose }) {
  const { drawings, updateDrawing, snapshotDrawings, setDrawingToolStyle } = useStore();
  const [newFibLevel, setNewFibLevel] = useState('0.618');
  const drawing = drawings.find(d => d.id === selectedId);
  if (!drawing) return null;

  const currentBorder = drawing.borderColor || drawing.color || '#3b82f6';
  const currentFill = drawing.fillColor || (currentBorder + '33');
  const currentWidth = drawing.lineWidth ?? 1;
  const showBorder = drawing.showBorder === true;
  const isText = drawing.type === 'text';
  const fontSize = drawing.fontSize || 14;

  const supportsFill = ['rectangle', 'volumeProfile'].includes(drawing.type);

  const commit = (patch) => {
    snapshotDrawings();
    updateDrawing(selectedId, patch);
    // Keep the selected tool's latest visual style as its default for the next drawing.
    setDrawingToolStyle?.(drawing.type, patch);
  };

  return createPortal(
    <div 
      className="drawing-style-panel fixed top-[72px] left-[36px] z-[10000] w-56 max-h-[calc(100vh-84px)] bg-[#131722]/98 border border-[#2a2e39] rounded-lg shadow-none overflow-y-auto"
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
        {isText ? (
          <>
            {/* Text Color */}
            <div>
              <div className="text-[10px] text-gray-400 uppercase font-bold mb-1.5">Text Color</div>
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

            {/* Font Size */}
            <div>
              <div className="text-[10px] text-gray-400 uppercase font-bold mb-1.5">
                Font Size — {fontSize}px
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="10"
                  max="48"
                  step="1"
                  value={fontSize}
                  onChange={(e) => commit({ fontSize: Number(e.target.value) })}
                  className="flex-1 accent-blue-500"
                />
                <span className="text-[11px] text-gray-300 font-mono w-6 text-right">{fontSize}</span>
              </div>
              <div className="flex gap-1 mt-2">
                {[12, 14, 18, 24].map(sz => (
                  <button
                    key={sz}
                    onClick={() => commit({ fontSize: sz })}
                    className={`flex-1 py-1 rounded text-[10px] font-bold transition-colors ${
                      fontSize === sz 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-[#1e222d] text-gray-400 hover:bg-[#2a2e39]'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
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

            {drawing.type === 'fibonacci' && (
              <div>
                <div className="mb-1.5 text-[10px] font-bold uppercase text-gray-400">Retracement Levels</div>
                <div className="space-y-1">
                  {(drawing.levels || [0, 0.5, 1]).map((level, index) => <div key={index} className="flex items-center gap-1">
                    <input aria-label="Fibonacci level" type="number" min="0" max="1" step="0.001" value={level}
                      onChange={event => {
                        const next = [...(drawing.levels || [0, 0.5, 1])];
                        next[index] = Math.max(0, Math.min(1, Number(event.target.value) || 0));
                        commit({ levels: next });
                      }}
                      className="min-w-0 flex-1 rounded border border-[#2a2e39] bg-[#1e222d] px-2 py-1 text-[10px] font-mono text-white"/>
                    <button type="button" onClick={() => commit({ levels: (drawing.levels || [0, 0.5, 1]).filter((_, i) => i !== index) })}
                      className="px-1 text-red-400" title="Remove level">×</button>
                  </div>)}
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <input aria-label="New Fibonacci level" type="number" min="0" max="1" step="0.001"
                    value={newFibLevel} onChange={event => setNewFibLevel(event.target.value)}
                    className="min-w-0 flex-1 rounded border border-[#2a2e39] bg-[#1e222d] px-2 py-1 text-[10px] font-mono text-white"/>
                  <button type="button" onClick={() => {
                    const value = Number(newFibLevel);
                    if (!Number.isFinite(value) || value < 0 || value > 1) return;
                    const levels = drawing.levels || [0, 0.5, 1];
                    if (!levels.some(level => Math.abs(Number(level) - value) < 0.000001)) {
                      commit({ levels: [...levels, value].sort((a, b) => a - b) });
                    }
                  }} className="rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-500">Add</button>
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
          </>
        )}
      </div>
    </div>, document.body);
}