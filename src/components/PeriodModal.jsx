import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Calendar, Play, Shield, Target, TrendingDown, User, Sparkles, X, Upload } from 'lucide-react';

const toInputDate = (unixSeconds) => {
  const d = new Date((unixSeconds + 3 * 3600) * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const fromInputDate = (str, endOfDay = false) => {
  const [year, month, day] = str.split('-').map(Number);
  const localMidnight = Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  return Math.floor(localMidnight / 1000) - 3 * 3600;
};

const PRESETS = {
  classic: {
    name: 'Classic', icon: '🎯', desc: 'Balanced — configurable risk limits',
    rules: { startingBalance: 100000, maxRiskPerTrade: 1, maxDailyLoss: 5, maxDrawdown: 10 },
  },
  sprint: {
    name: 'Sprint', icon: '⚡', desc: 'Short, strict risk limits',
    rules: { startingBalance: 100000, maxRiskPerTrade: 1, maxDailyLoss: 3, maxDrawdown: 5 },
  },
  marathon: {
    name: 'Marathon', icon: '🏃', desc: 'Long-term risk discipline',
    rules: { startingBalance: 100000, maxRiskPerTrade: 0.5, maxDailyLoss: 10, maxDrawdown: 20 },
  },
  yolo: {
    name: 'YOLO', icon: '🎲', desc: 'Customizable high-risk limits',
    rules: { startingBalance: 10000, maxRiskPerTrade: 10, maxDailyLoss: 50, maxDrawdown: 100 },
  },
  sniper: {
    name: 'Sniper', icon: '🎯', desc: 'Conservative risk limits',
    rules: { startingBalance: 100000, maxRiskPerTrade: 0.5, maxDailyLoss: 3, maxDrawdown: 8 },
  },
  custom: { name: 'Custom', icon: '⚙️', desc: 'Set your own rules', rules: null },
};

export default function PeriodModal() {
  const { 
    allRawData, isPeriodModalOpen, closePeriodModal, gameStarted, startGame, 
    playerName, setPlayerName
  } = useStore();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [presetKey, setPresetKey] = useState('classic');
  const [startingBalance, setStartingBalance] = useState(100000);
  const [maxRiskPerTrade, setMaxRiskPerTrade] = useState(1);
  const [maxDailyLoss, setMaxDailyLoss] = useState(5);
  const [maxDrawdown, setMaxDrawdown] = useState(10);
  const [propFirmEnabled, setPropFirmEnabled] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (allRawData.length > 0) {
      setFrom(toInputDate(allRawData[0].time));
      setTo(toInputDate(allRawData[allRawData.length - 1].time));
    }
  }, [allRawData]);

  useEffect(() => {
    const preset = PRESETS[presetKey];
    if (preset && preset.rules) {
      setStartingBalance(preset.rules.startingBalance);
      setMaxRiskPerTrade(preset.rules.maxRiskPerTrade);
      setMaxDailyLoss(preset.rules.maxDailyLoss);
      setMaxDrawdown(preset.rules.maxDrawdown);
      setPropFirmEnabled(true);
    }
  }, [presetKey]);

  if (allRawData.length === 0 || !isPeriodModalOpen) return null;

  const minDate = toInputDate(allRawData[0].time);
  const maxDate = toInputDate(allRawData[allRawData.length - 1].time);

  let durationDays = 0;
  if (from && to) {
    const fromTs = fromInputDate(from, false);
    const toTs = fromInputDate(to, true);
    if (toTs >= fromTs) durationDays = Math.round((toTs - fromTs) / 86400);
  }

  const isCustom = presetKey === 'custom';
  const activePreset = PRESETS[presetKey];

  const handleStart = () => {
    const fromTs = fromInputDate(from, false);
    const toTs = fromInputDate(to, true);
    if (!from || !to) { setError('Please select both dates'); return; }
    if (fromTs >= toTs) { setError('Start date must be before End date'); return; }
    if (startingBalance <= 0) { setError('Starting balance must be positive'); return; }
    if (propFirmEnabled && (maxRiskPerTrade <= 0 || maxRiskPerTrade > 100)) { setError('Max risk per trade must be 0-100%'); return; }
    if (propFirmEnabled && (maxDailyLoss <= 0 || maxDailyLoss > 100)) { setError('Max daily loss must be 0-100%'); return; }
    if (propFirmEnabled && (maxDrawdown <= 0 || maxDrawdown > 100)) { setError('Max drawdown must be 0-100%'); return; }
    if (!playerName || playerName.trim().length === 0) { setError('Please enter your name'); return; }
    const count = allRawData.filter(c => c.time >= fromTs && c.time <= toTs).length;
    if (count === 0) { setError('No data in this period'); return; }
    setError('');
    startGame(fromTs, toTs, {
      startingBalance: Number(startingBalance),
      maxRiskPerTrade: Number(maxRiskPerTrade),
      maxDailyLoss: Number(maxDailyLoss),
      maxDrawdown: Number(maxDrawdown),
      propFirmEnabled,
      presetName: activePreset?.name || 'Custom',
    });
  };

  return (
    <div className="fixed inset-0 bg-[#0b0e11]/95 backdrop-blur flex items-center justify-center z-50 p-2 overflow-y-auto">
      <div className="bg-[#131722] rounded-xl w-full max-w-sm border border-[#2a2e39] overflow-hidden shadow-2xl my-2">
        
        <div className="p-3 border-b border-[#2a2e39] flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="period-brand-icon theme-action-contrast bg-blue-600 rounded p-1.5">
                <Calendar size={14} className="text-white" />
              </div>
              <h1 className="text-base font-bold tracking-wider">
                <span className="text-white">OmaxFX Simulator</span>
              </h1>
            </div>
            <p className="text-[10px] text-gray-400">Configure your trading setup</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => window.dispatchEvent(new Event('omaxfx:open-data-import'))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#2a2e39] bg-[#1e222d] text-gray-300 transition-colors hover:border-blue-500 hover:text-blue-400"
              title="Import market CSV" aria-label="Import market CSV">
              <Upload size={15}/>
            </button>
            {gameStarted && (
              <button 
                onClick={closePeriodModal}
                className="p-1 hover:bg-[#2a2e39] rounded text-gray-400 hover:text-white"
                title="Cancel"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">

          
          <div className="grid grid-cols-1 gap-2">
            <div>
              <h3 className="text-[10px] font-bold uppercase text-gray-400 mb-1 flex items-center gap-1.5">
                <User size={10} /> Trader Name
              </h3>
              <input 
                type="text" value={playerName} maxLength={20}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full p-1.5 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-xs focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="border-t border-[#2a2e39] pt-2">
            <h3 className="text-[10px] font-bold uppercase text-gray-400 mb-1.5 flex items-center gap-1.5">
              <Sparkles size={10} /> Challenge Preset
            </h3>
            <div className="grid grid-cols-3 gap-1">
              {Object.entries(PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => setPresetKey(key)}
                  className={`flex flex-col items-center gap-0.5 p-1.5 rounded border transition-all text-center ${
                    presetKey === key 
                      ? 'period-preset-selected bg-blue-600/20 border-blue-500 !text-white' 
                      : 'bg-[#1e222d] border-[#2a2e39] text-gray-400 hover:border-[#3a3e49] hover:text-gray-200'
                  }`}
                >
                  <span className="text-sm">{preset.icon}</span>
                  <span className="text-[9px] font-bold text-inherit">{preset.name}</span>
                </button>
              ))}
            </div>
            <p className="text-[9px] text-gray-500 mt-1 italic text-center">{activePreset?.desc}</p>
          </div>

          <div className="border-t border-[#2a2e39] pt-2">
            <h3 className="text-[10px] font-bold uppercase text-gray-400 mb-1.5 flex items-center gap-1.5">
              <Calendar size={10} /> Period
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-gray-500 block mb-0.5 uppercase">From</label>
                <input 
                  type="date" value={from} min={minDate} max={maxDate}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full p-1.5 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[11px] focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] text-gray-500 block mb-0.5 uppercase">To</label>
                <input 
                  type="date" value={to} min={minDate} max={maxDate}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full p-1.5 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[11px] focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <div className="bg-[#1e222d] rounded p-1 mt-1 flex justify-between text-[10px]">
              <span className="text-gray-400">Duration</span>
              <span className="font-bold text-blue-400">{durationDays} days</span>
            </div>
          </div>

          <div className="border-t border-[#2a2e39] pt-2">
            <h3 className="text-[10px] font-bold uppercase text-gray-400 mb-1.5 flex items-center gap-1.5">
              <Shield size={10} /> Session Rules
            </h3>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] text-gray-400 flex items-center gap-1"><Target size={9} /> Starting balance</label>
                <input 
                  type="number" value={startingBalance} step="1000" min="1000" disabled={!isCustom}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  className={`w-24 p-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[11px] text-right font-mono focus:border-blue-500 outline-none ${!isCustom ? 'opacity-60' : ''}`}
                />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-[#2a2e39] pt-2">
                <label className="text-[10px] text-gray-300 font-semibold">Enforce prop firm rules</label>
                <button type="button" role="switch" aria-checked={propFirmEnabled} onClick={() => setPropFirmEnabled(value => !value)} className={`w-9 h-5 rounded-full p-0.5 transition-colors ${propFirmEnabled ? 'bg-emerald-600' : 'bg-gray-600'}`}>
                  <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${propFirmEnabled ? 'translate-x-4' : ''}`}/>
                </button>
              </div>
              {propFirmEnabled ? <div className="space-y-1.5">

              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] text-gray-400">Max Risk / Trade</label>
                <div className="flex items-center gap-0.5">
                  <input 
                    type="number" value={maxRiskPerTrade} step="0.5" min="0.5" max="100" disabled={!isCustom}
                    onChange={(e) => setMaxRiskPerTrade(e.target.value)}
                    className={`w-14 p-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[11px] text-right font-mono focus:border-blue-500 outline-none ${!isCustom ? 'opacity-60' : ''}`}
                  />
                  <span className="text-[10px] text-gray-500 w-3">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] text-gray-400">Max Daily Loss</label>
                <div className="flex items-center gap-0.5">
                  <input 
                    type="number" value={maxDailyLoss} step="0.5" min="0.5" max="100" disabled={!isCustom}
                    onChange={(e) => setMaxDailyLoss(e.target.value)}
                    className={`w-14 p-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[11px] text-right font-mono focus:border-blue-500 outline-none ${!isCustom ? 'opacity-60' : ''}`}
                  />
                  <span className="text-[10px] text-gray-500 w-3">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] text-gray-400 flex items-center gap-1"><TrendingDown size={9} /> Max Drawdown</label>
                <div className="flex items-center gap-0.5">
                  <input 
                    type="number" value={maxDrawdown} step="1" min="1" max="100" disabled={!isCustom}
                    onChange={(e) => setMaxDrawdown(e.target.value)}
                    className={`w-14 p-1 bg-[#1e222d] rounded border border-[#2a2e39] text-white text-[11px] text-right font-mono focus:border-blue-500 outline-none ${!isCustom ? 'opacity-60' : ''}`}
                  />
                  <span className="text-[10px] text-gray-500 w-3">%</span>
                </div>
              </div></div> : <p className="text-[9px] text-gray-500">Prop-firm restrictions are disabled for this session.</p>}
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded p-1.5 text-red-400 text-[10px]">
              {error}
            </div>
          )}
        </div>

        <div className="p-2 border-t border-[#2a2e39] flex gap-2">
          {gameStarted && (
            <button
              onClick={closePeriodModal}
              className="flex-1 py-2 bg-[#2a2e39] hover:bg-[#3a3e49] rounded-lg font-bold text-sm text-gray-300 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleStart}
            className="theme-action-contrast flex-[2] py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-sm text-white flex items-center justify-center gap-1.5 transition-colors"
          >
            <Play size={14} fill="currentColor" />
            Start {activePreset?.name} Session
          </button>
        </div>
      </div>
    </div>
  );
}