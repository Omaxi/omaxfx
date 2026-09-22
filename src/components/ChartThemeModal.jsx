import { useState } from 'react';
import { useStore } from '../store';
import { X, Palette, RotateCcw } from 'lucide-react';

const BACKGROUND_PRESETS = [
  { name: 'Midnight', value: '#0b0e11' },
  { name: 'Dark', value: '#131722' },
  { name: 'Charcoal', value: '#1a1a1a' },
  { name: 'Navy', value: '#0a1929' },
  { name: 'Black', value: '#000000' },
  { name: 'Deep Purple', value: '#1a0f2e' },
];

const CANDLE_PRESETS = [
  { name: 'Classic', up: '#26a69a', down: '#ef5350' },
  { name: 'Pro Blue', up: '#2962ff', down: '#f23645' },
  { name: 'Neon', up: '#00e676', down: '#ff1744' },
  { name: 'Pastel', up: '#4ade80', down: '#f87171' },
  { name: 'Amber', up: '#f59e0b', down: '#dc2626' },
  { name: 'Monochrome', up: '#9ca3af', down: '#4b5563' },
];

export default function ChartThemeModal() {
  const { isThemeOpen, closeTheme, theme, setTheme, resetTheme } = useStore();
  const [activeTab, setActiveTab] = useState('background');

  if (!isThemeOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[60] p-2" onClick={closeTheme}>
      <div 
        className="bg-[#131722] rounded-lg w-full max-w-md border border-[#2a2e39] overflow-hidden flex flex-col max-h-[96vh]" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-3 py-2 border-b border-[#2a2e39] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-blue-400" />
            <h2 className="text-sm font-bold">Chart Appearance</h2>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={resetTheme}
              className="p-1.5 hover:bg-[#2a2e39] rounded text-gray-400 hover:text-white"
              title="Reset to defaults"
            >
              <RotateCcw size={14} />
            </button>
            <button onClick={closeTheme} className="p-1 hover:bg-[#2a2e39] rounded">
              <X size={16}/>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a2e39] flex-shrink-0">
          {[
            { key: 'background', label: 'Background' },
            { key: 'candles', label: 'Candles' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 text-xs font-bold transition-colors ${
                activeTab === tab.key 
                  ? 'text-blue-400 border-b-2 border-blue-500' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-3 space-y-4">

          {/* BACKGROUND TAB */}
          {activeTab === 'background' && (
            <>
              <div>
                <div className="text-[10px] text-gray-400 uppercase font-bold mb-2">Presets</div>
                <div className="grid grid-cols-3 gap-2">
                  {BACKGROUND_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setTheme({ background: p.value })}
                      className={`p-2 rounded border-2 transition-all ${
                        theme.background === p.value 
                          ? 'border-blue-500' 
                          : 'border-[#2a2e39] hover:border-[#3a3e49]'
                      }`}
                    >
                      <div 
                        className="w-full aspect-square rounded mb-1"
                        style={{ backgroundColor: p.value, border: '1px solid #2a2e39' }}
                      />
                      <div className="text-[10px] font-bold text-center">{p.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-gray-400 uppercase font-bold mb-2">Custom</div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={theme.background}
                    onChange={(e) => setTheme({ background: e.target.value })}
                    className="w-12 h-10 rounded bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.background}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setTheme({ background: v });
                    }}
                    className="flex-1 bg-[#1e222d] text-white text-xs font-mono px-3 py-2 rounded border border-[#2a2e39] outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {/* CANDLES TAB */}
          {activeTab === 'candles' && (
            <>
              <div>
                <div className="text-[10px] text-gray-400 uppercase font-bold mb-2">Presets</div>
                <div className="grid grid-cols-3 gap-2">
                  {CANDLE_PRESETS.map(p => (
                    <button
                      key={p.name}
                      onClick={() => setTheme({ 
                        upBody: p.up, upWick: p.up,
                        downBody: p.down, downWick: p.down 
                      })}
                      className={`p-2 rounded border-2 transition-all ${
                        theme.upBody === p.up && theme.downBody === p.down
                          ? 'border-blue-500' 
                          : 'border-[#2a2e39] hover:border-[#3a3e49]'
                      }`}
                    >
                      <div className="flex gap-0.5 h-8 mb-1">
                        <div 
                          className="flex-1 rounded-sm"
                          style={{ backgroundColor: p.up }}
                        />
                        <div 
                          className="flex-1 rounded-sm"
                          style={{ backgroundColor: p.down }}
                        />
                      </div>
                      <div className="text-[10px] font-bold text-center">{p.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-[#2a2e39] pt-3 space-y-2">
                <div className="text-[10px] text-gray-400 uppercase font-bold">Custom Colors</div>
                
                {[
                  { key: 'upBody', label: 'Bull Body' },
                  { key: 'upWick', label: 'Bull Wick' },
                  { key: 'downBody', label: 'Bear Body' },
                  { key: 'downWick', label: 'Bear Wick' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-300 w-24">{label}</span>
                    <input
                      type="color"
                      value={theme[key]}
                      onChange={(e) => setTheme({ [key]: e.target.value })}
                      className="w-10 h-7 rounded bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={theme[key]}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setTheme({ [key]: v });
                      }}
                      className="flex-1 bg-[#1e222d] text-white text-[11px] font-mono px-2 py-1 rounded border border-[#2a2e39] outline-none"
                    />
                  </div>
                ))}
              </div>

              {/* Live Preview */}
              <div className="border-t border-[#2a2e39] pt-3">
                <div className="text-[10px] text-gray-400 uppercase font-bold mb-2">Preview</div>
                <div 
                  className="rounded-lg p-4 flex items-end justify-center gap-1.5 h-24"
                  style={{ backgroundColor: theme.background }}
                >
                  {[1, 2, 3, 4, 5].map(i => {
                    const isUp = i % 2 === 1;
                    return (
                      <div key={i} className="flex flex-col items-center" style={{ height: '100%' }}>
                        <div 
                          className="w-0.5"
                          style={{ 
                            backgroundColor: isUp ? theme.upWick : theme.downWick,
                            flex: 1,
                            minHeight: '8px',
                          }}
                        />
                        <div 
                          className="w-3 rounded-sm"
                          style={{ 
                            backgroundColor: isUp ? theme.upBody : theme.downBody,
                            height: `${30 + (i * 6)}%`,
                          }}
                        />
                        <div 
                          className="w-0.5"
                          style={{ 
                            backgroundColor: isUp ? theme.upWick : theme.downWick,
                            flex: 1,
                            minHeight: '8px',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}