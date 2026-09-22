import { useStore } from '../store';
import { Minus, Square, Layers, BarChart2, Trash2, Undo2, Redo2 } from 'lucide-react';

const TrendlineIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="5" cy="19" r="2" fill="currentColor" stroke="none" />
    <circle cx="19" cy="5" r="2" fill="currentColor" stroke="none" />
    <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" />
  </svg>
);

const TOOLS = [
  { key: 'horizontal',    label: 'Horizontal',     icon: Minus },
  { key: 'trendline',     label: 'Trendline',      icon: TrendlineIcon },
  { key: 'rectangle',     label: 'Rectangle',      icon: Square },
  { key: 'fibonacci',     label: 'Fibonacci',      icon: Layers },
  { key: 'volumeProfile', label: 'Volume Profile', icon: BarChart2 },
];

export default function DrawingToolbar() {
  const { 
    activeDrawingTool, setActiveDrawingTool, clearDrawings, drawings,
    drawingsPast, drawingsFuture, undoDrawings, redoDrawings
  } = useStore();

  const canUndo = drawingsPast.length > 0;
  const canRedo = drawingsFuture.length > 0;

  return (
    <div className="absolute top-1 left-1 md:top-2 md:left-2 z-20 flex flex-col gap-0.5 md:gap-1 bg-[#131722]/95 backdrop-blur border border-[#2a2e39] rounded-md md:rounded-lg p-0.5 md:p-1 shadow-lg">
      {/* Undo / Redo */}
      <button
        onClick={undoDrawings}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className={`p-1 md:p-1.5 rounded transition-colors ${
          canUndo ? 'text-gray-300 hover:text-white hover:bg-[#2a2e39]' : 'text-gray-700 cursor-not-allowed'
        }`}
      >
        <Undo2 size={12} />
      </button>
      <button
        onClick={redoDrawings}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        className={`p-1 md:p-1.5 rounded transition-colors ${
          canRedo ? 'text-gray-300 hover:text-white hover:bg-[#2a2e39]' : 'text-gray-700 cursor-not-allowed'
        }`}
      >
        <Redo2 size={12} />
      </button>

      <div className="border-t border-[#2a2e39] my-0.5" />

      {TOOLS.map(({ key, label, icon: Icon }) => (
        <button
          key={label}
          onClick={() => setActiveDrawingTool(key)}
          title={label}
          className={`p-1 md:p-1.5 rounded transition-colors ${
            activeDrawingTool === key
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#2a2e39]'
          }`}
        >
          <Icon size={12} />
        </button>
      ))}
      
      {drawings.length > 0 && (
        <>
          <div className="border-t border-[#2a2e39] my-0.5" />
          <button
            onClick={clearDrawings}
            title={`Clear ALL drawings (${drawings.length})`}
            className="p-1 md:p-1.5 rounded text-red-400 hover:bg-red-900/40 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  );
}