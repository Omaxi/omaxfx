import { useStore } from '../store';
import { Minus, Square, MoveVertical, Trash2, Undo2, Redo2, Pencil, Type, ArrowUpRight } from 'lucide-react';

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

const FibonacciIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M4 5h16M4 11h16M4 19h16" />
    <path d="M6 19 18 5" strokeWidth="1.5" />
    <circle cx="6" cy="19" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="18" cy="5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

const TOOLS = [
  { key: 'horizontal',    label: 'Horizontal',     icon: Minus },
  { key: 'vertical',      label: 'Vertical',       icon: MoveVertical },
  { key: 'trendline',     label: 'Trendline',      icon: TrendlineIcon },
  { key: 'arrow',         label: 'Continuous Arrow', icon: ArrowUpRight },
  { key: 'rectangle',     label: 'Rectangle',      icon: Square },
  { key: 'fibonacci',     label: 'Fibonacci',      icon: FibonacciIcon },
  { key: 'text',          label: 'Text Note',      icon: Type },
];

export default function DrawingToolbar({ positionClassName = 'absolute top-1 left-0 md:top-2' }) {
  const { 
    activeDrawingTool, setActiveDrawingTool, clearDrawings, drawings,
    drawingsPast, drawingsFuture, undoDrawings, redoDrawings,
    isPencilMode, setPencilMode
  } = useStore();

  const canUndo = drawingsPast.length > 0;
  const canRedo = drawingsFuture.length > 0;
  const locked = isPencilMode; // when pencil active, other tools locked

  return (
    <div className={`${positionClassName} z-30 flex max-h-[calc(100%-12px)] flex-col gap-0.5 overflow-y-auto overflow-x-hidden md:gap-1 drawing-toolbar bg-[#131722]/95 rounded-md md:rounded-lg p-0.5 md:p-1 shadow-none`}>
      {/* Pencil — top priority button */}
      <button
        onClick={() => setPencilMode(!isPencilMode)}
        title={isPencilMode ? 'Exit pencil (clears strokes)' : 'Freehand pencil'}
        className={`p-1 md:p-1.5 rounded transition-colors ${
          isPencilMode
            ? 'bg-blue-600 text-white'
            : 'text-gray-300 hover:text-white hover:bg-[#2a2e39]'
        }`}
      >
        <Pencil size={12} />
      </button>

      <button
        onClick={clearDrawings}
        disabled={!drawings.length || locked}
        title={drawings.length ? `Delete all drawings (${drawings.length})` : 'No drawings to delete'}
        aria-label="Delete all drawings"
        className="drawing-toolbar-clear flex shrink-0 items-center justify-center rounded p-1 md:p-1.5 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Trash2 size={14} />
      </button>

      <div className="border-t border-[#2a2e39] my-0.5" />

      {/* Undo / Redo */}
      <button
        onClick={undoDrawings}
        disabled={!canUndo || locked}
        title="Undo (Ctrl+Z)"
        className={`p-1 md:p-1.5 rounded transition-colors ${
          !canUndo || locked ? 'text-gray-700 cursor-not-allowed' : 'text-gray-300 hover:text-white hover:bg-[#2a2e39]'
        }`}
      >
        <Undo2 size={12} />
      </button>
      <button
        onClick={redoDrawings}
        disabled={!canRedo || locked}
        title="Redo (Ctrl+Y)"
        className={`p-1 md:p-1.5 rounded transition-colors ${
          !canRedo || locked ? 'text-gray-700 cursor-not-allowed' : 'text-gray-300 hover:text-white hover:bg-[#2a2e39]'
        }`}
      >
        <Redo2 size={12} />
      </button>

      <div className="border-t border-[#2a2e39] my-0.5" />

      {TOOLS.map(({ key, label, icon: Icon }) => (
        <button
          key={label}
          onClick={() => setActiveDrawingTool(key)}
          disabled={locked}
          title={locked ? 'Exit pencil mode first' : label}
          className={`p-1 md:p-1.5 rounded transition-colors ${
            locked
              ? 'text-gray-700 cursor-not-allowed'
              : activeDrawingTool === key
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#2a2e39]'
          }`}
        >
          <Icon size={12} />
        </button>
      ))}
      
    </div>
  );
}