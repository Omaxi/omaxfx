import { X, RotateCcw } from 'lucide-react';
import { useStore } from '../store';

const Toggle = ({ label, description, checked, onChange }) => (
  <label className="flex items-center justify-between gap-4 rounded-lg bg-[#1e222d] px-3 py-2.5 cursor-pointer">
    <span className="min-w-0">
      <span className="block text-xs font-semibold text-gray-200">{label}</span>
      {description && <span className="mt-0.5 block text-[10px] text-gray-500">{description}</span>}
    </span>
    <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)}
      className="h-4 w-4 shrink-0 accent-blue-500" />
  </label>
);

const ColorField = ({ label, value, onChange }) => (
  <label className="flex items-center justify-between gap-3 rounded-lg bg-[#1e222d] px-3 py-2">
    <span className="text-xs text-gray-300">{label}</span>
    <span className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-gray-500">{value}</span>
      <input type="color" value={value || '#171a27'} onChange={e => onChange(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded border border-[#3a4050] bg-transparent p-0.5" aria-label={label} />
    </span>
  </label>
);

export default function SettingsModal({ open, onClose }) {
  const theme = useStore(state => state.theme);
  const setTheme = useStore(state => state.setTheme);
  const chartOptions = useStore(state => state.chartOptions);
  const setChartOptions = useStore(state => state.setChartOptions);
  if (!open) return null;

  const reset = () => {
    setTheme({ background: '#171a27', upBody: '#0897a7', downBody: '#59616e', upWick: '#0897a7', downWick: '#59616e' });
    setChartOptions({ gridVisible: true, lastPriceLineVisible: true, crosshairVerticalVisible: false, crosshairHorizontalVisible: false });
  };

  return (
    <div className="fixed inset-0 z-[16000] flex items-center justify-center bg-black/65 p-3" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="chart-settings-title"
        className="flex max-h-[min(88vh,760px)] w-full max-w-[620px] flex-col overflow-hidden rounded-xl border border-[#343b4b] bg-[#131722] text-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#2a2e39] px-4 py-3">
          <div>
            <h2 id="chart-settings-title" className="text-base font-bold">Chart settings</h2>
            <p className="mt-0.5 text-[10px] text-gray-500">Customize chart colors, grid, price line and crosshair</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings" className="rounded p-1.5 text-gray-400 hover:bg-[#2a2e39] hover:text-white"><X size={18}/></button>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Candlestick colors</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ColorField label="Bullish candle body" value={theme.upBody} onChange={v => setTheme({ upBody: v })}/>
              <ColorField label="Bearish candle body" value={theme.downBody} onChange={v => setTheme({ downBody: v })}/>
              <ColorField label="Bullish candle wick" value={theme.upWick} onChange={v => setTheme({ upWick: v })}/>
              <ColorField label="Bearish candle wick" value={theme.downWick} onChange={v => setTheme({ downWick: v })}/>
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Chart appearance</h3>
            <ColorField label="Background color" value={theme.background} onChange={v => setTheme({ background: v })}/>
            <Toggle label="Background grid" description="Show horizontal and vertical chart grid lines" checked={chartOptions?.gridVisible ?? true} onChange={v => setChartOptions({ gridVisible: v })}/>
            <Toggle label="Last price line" description="Dotted line from the latest candle to the price axis" checked={chartOptions?.lastPriceLineVisible ?? true} onChange={v => setChartOptions({ lastPriceLineVisible: v })}/>
          </section>
          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Crosshair</h3>
            <p className="text-[10px] text-gray-500">Axis price and date labels remain available. Toggle the dotted guide lines independently.</p>
            <Toggle label="Vertical dotted line" checked={chartOptions?.crosshairVerticalVisible ?? false} onChange={v => setChartOptions({ crosshairVerticalVisible: v })}/>
            <Toggle label="Horizontal dotted line" checked={chartOptions?.crosshairHorizontalVisible ?? false} onChange={v => setChartOptions({ crosshairHorizontalVisible: v })}/>
          </section>
        </div>
        <footer className="flex items-center justify-between border-t border-[#2a2e39] px-4 py-3">
          <button type="button" onClick={reset} className="flex items-center gap-2 rounded-lg bg-[#1e222d] px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-[#2a2e39]"><RotateCcw size={13}/> Reset defaults</button>
          <button type="button" onClick={onClose} className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700">Done</button>
        </footer>
      </section>
    </div>
  );
}
