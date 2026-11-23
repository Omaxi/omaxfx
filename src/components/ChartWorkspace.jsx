import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Play, Pause, SkipForward } from 'lucide-react';
import Chart from './Chart';
import MiniChart from './MiniChart';

const PRESETS = {
  2: [15],
  3: [5, 60],
};

export default function ChartWorkspace() {
  const layout = useStore(state => state.chartLayout);
  const setLayout = useStore(state => state.setChartLayout);
  const isPlaying = useStore(state => state.isPlaying);
  const togglePlay = useStore(state => state.togglePlay);
  const stepForward = useStore(state => state.stepForward);
  const [timeframes, setTimeframes] = useState({ 15: 15, 5: 5, 60: 60 });

  const updateTimeframe = (slot, value) => {
    setTimeframes(current => ({ ...current, [slot]: Number(value) }));
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => cancelAnimationFrame(id);
  }, [layout]);

  return (
    <section className="relative h-full min-h-0 w-full overflow-hidden bg-[#0b0e14]">
      <div className={layout === 1 ? 'absolute inset-0' : layout === 2 ? 'chart-workspace-grid grid h-full min-h-0 grid-cols-2 grid-rows-1 gap-px bg-[#2a2e39]' : 'chart-workspace-grid grid h-full min-h-0 grid-cols-2 grid-rows-2 gap-px bg-[#2a2e39]'}>
        <div className={`chart-workspace-pane relative h-full min-h-0 min-w-0 overflow-hidden bg-[#131722] ${layout === 3 ? 'row-span-2' : ''}`}>
          <Chart chartId="main" />
        </div>
        {layout >= 2 && PRESETS[layout].map(slot => (
          <div key={slot} className="chart-workspace-pane relative h-full min-h-0 min-w-0 overflow-hidden bg-[#131722]">
            <MiniChart chartId={`mini-${slot}`} timeframe={timeframes[slot] ?? slot} onTimeframeChange={value => updateTimeframe(slot, value)} />
          </div>
        ))}
      </div>

      <div className="absolute bottom-3 right-3 z-[200] flex items-end gap-2 pointer-events-auto">
        <button type="button" onClick={togglePlay} aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
          className="replay-play-button w-12 h-12 rounded-full bg-[#1e222d] hover:bg-[#2a2e39] border-2 border-[#2a2e39] text-white flex items-center justify-center shadow-2xl shadow-black/60 active:scale-95 transition-transform">
          {isPlaying ? <Pause size={20}/> : <Play size={20}/>}
        </button>
        <button type="button" onClick={() => stepForward()} aria-label="Next bar"
          className="replay-next-button w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-2xl shadow-blue-900/60 active:scale-95 transition-transform border-2 border-blue-500">
          <SkipForward size={30}/>
        </button>
      </div>
    </section>
  );
}
