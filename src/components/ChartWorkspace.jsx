import { useState } from 'react';
import { LayoutGrid, Columns2, Square } from 'lucide-react';
import Chart from './Chart';
import MiniChart from './MiniChart';

const PRESETS = {
  2: [15],
  4: [5, 15, 60],
};

export default function ChartWorkspace() {
  const [layout, setLayout] = useState(1);
  const [timeframes, setTimeframes] = useState({ 15: 15, 5: 5, 60: 60 });

  const updateTimeframe = (slot, value) => {
    setTimeframes(current => ({ ...current, [slot]: Number(value) }));
  };

  return (
    <section className="relative h-full min-h-0 w-full overflow-hidden bg-[#0b0e14]">
      <div className={layout === 1 ? 'absolute inset-0' : layout === 2 ? 'grid h-full min-h-0 grid-cols-2 gap-px bg-[#2a2e39]' : 'grid h-full min-h-0 grid-cols-2 grid-rows-2 gap-px bg-[#2a2e39]'}>
        <div className="relative min-h-0 min-w-0 overflow-hidden bg-[#131722]">
          <Chart />
        </div>
        {layout >= 2 && PRESETS[layout].map((slot, index) => (
          <div key={slot} className="relative min-h-0 min-w-0 overflow-hidden bg-[#131722]">
            <MiniChart timeframe={timeframes[slot] ?? slot} onTimeframeChange={value => updateTimeframe(slot, value)} />
          </div>
        ))}
      </div>
      <div className="absolute right-3 top-2 z-[100] flex items-center gap-1 rounded-lg border border-[#2a2e39] bg-[#131722]/95 p-1 shadow-xl">
        <span className="px-1 text-[9px] font-bold uppercase tracking-wide text-gray-500">Layout</span>
        <button type="button" onClick={() => setLayout(1)} title="Single chart" aria-label="Single chart" aria-pressed={layout === 1} className={`flex h-7 w-8 items-center justify-center rounded ${layout === 1 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-[#2a2e39]'}`}><Square size={14}/></button>
        <button type="button" onClick={() => setLayout(2)} title="Two charts" aria-label="Two charts" aria-pressed={layout === 2} className={`flex h-7 w-8 items-center justify-center rounded ${layout === 2 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-[#2a2e39]'}`}><Columns2 size={15}/></button>
        <button type="button" onClick={() => setLayout(4)} title="Four charts" aria-label="Four charts" aria-pressed={layout === 4} className={`flex h-7 w-8 items-center justify-center rounded ${layout === 4 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-[#2a2e39]'}`}><LayoutGrid size={15}/></button>
      </div>
    </section>
  );
}
