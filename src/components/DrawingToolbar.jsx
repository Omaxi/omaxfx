import { useStore } from '../store';
import { MousePointer2, Minus, TrendingUp, Square, Layers, BarChart2, Trash2 } from 'lucide-react';

const TOOLS = [
  { key: null,            label: 'Cursor',         icon: MousePointer2 },
  { key: 'horizontal',    label: 'Horizontal',     icon: Minus },
  { key: 'trendline',     label: 'Trendline',      icon: TrendingUp },
  { key: 'rectangle',     label: 'Rectangle',      icon: Square },
  { key: 'fibonacci',     label: 'Fibonacci',      icon: Layers },
  { key: 'volumeProfile', label: 'Volume Profile', icon: BarChart2 },
];

export default function DrawingToolbar() {
  const { activeDrawingTool, setActiveDrawingTool, clearDrawings, drawings } = useStore();

  return (
    <div className="absolute top-2 left-2 z-20 flex flex-col gap-1 bg-[#131722]/95 backdrop-blur border border-[#2a2e39] rounded-lg p-1 shadow-lg">
      {TOOLS.map(({ key, label, icon: Icon }) => (
        <button
          key={label}
          onClick={() => setActiveDrawingTool(key)}
          title={label}
          className={`p-1.5 md:p-2 rounded transition-colors ${
            activeDrawingTool === key && key !== null
              ? 'bg-blue-600 text-white'
              : key === null && activeDrawingTool === null
                ? 'text-gray-400'
                : 'text-gray-400 hover:text-white hover:bg-[#2a2e39]'
          }`}
        >
          <Icon size={14} className="md:w-4 md:h-4" />
        </button>
      ))}
      
      {drawings.length > 0 && (
        <>
          <div className="border-t border-[#2a2e39] my-0.5" />
          <button
            onClick={clearDrawings}
            title={`Clear ALL drawings (${drawings.length})`}
            className="p-1.5 md:p-2 rounded text-red-400 hover:bg-red-900/40 transition-colors"
          >
            <Trash2 size={14} className="md:w-4 md:h-4" />
          </button>
        </>
      )}
    </div>
  );
}