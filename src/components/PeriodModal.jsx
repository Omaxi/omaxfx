import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Calendar, Play, Shield, Clock, Target, TrendingDown, User, Sparkles } from 'lucide-react';

const toInputDate = (unixSeconds) => {
  const d = new Date(unixSeconds * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const fromInputDate = (str, endOfDay = false) => {
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return Math.floor(new Date(`${str}T${time}`).getTime() / 1000);
};

// ---------- CHALLENGE PRESETS ----------
const PRESETS = {
  classic: {
    name: 'Classic',
    icon: '🎯',
    desc: 'Balanced — for players who like control',
    rules: {
      startingBalance: 100000,
      maxRiskPerTrade: 1,
      maxDailyLoss: 5,
      maxDrawdown: 10,
      countdownMinutes: 60,
    },
  },
  sprint: {
    name: 'Sprint',
    icon: '⚡',
    desc: 'Quick 15-minute race',
    rules: {
      startingBalance: 100000,
      maxRiskPerTrade: 1,
      maxDailyLoss: 3,
      maxDrawdown: 5,
      countdownMinutes: 15,
    },
  },
  marathon: {
    name: 'Marathon',
    icon: '🏃',
    desc: 'Long, patient game — 4 hours',
    rules: {
      startingBalance: 100000,
      maxRiskPerTrade: 0.5,
      maxDailyLoss: 10,
      maxDrawdown: 20,
      countdownMinutes: 240,
    },
  },
  yolo: {
    name: 'YOLO',
    icon: '🎲',
    desc: 'High risk, high reward — 5 minutes',
    rules: {
      startingBalance: 10000,
      maxRiskPerTrade: 10,
      maxDailyLoss: 50,
      maxDrawdown: 100,
      countdownMinutes: 5,
    },
  },
  sniper: {
    name: 'Sniper',
    icon: '🎯',
    desc: 'Tiny risk, tight stops — for perfectionists',
    rules: {
      startingBalance: 100000,
      maxRiskPerTrade: 0.5,
      maxDailyLoss: 3,
      maxDrawdown: 8,
      countdownMinutes: 30,
    },
  },
  custom: {
    name: 'Custom',
    icon: '⚙️',
    desc: 'Set your own rules',
    rules: null,
  },
};

export default function PeriodModal() {
  const { allRawData, gameStarted, startGame, playerName, setPlayerName } = useStore();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  
  const [presetKey, setPresetKey] = useState('classic');
  const [startingBalance, setStartingBalance] = useState(100000);
  const [maxRiskPerTrade, setMaxRiskPerTrade] = useState(1);
  const [maxDailyLoss, setMaxDailyLoss] = useState(5);
  const [maxDrawdown, setMaxDrawdown] = useState(10);
  const [countdownMinutes, setCountdownMinutes] = useState(60);
  
  const [error, setError] = useState('');

  useEffect(() => {
    if (allRawData.length > 0) {
      setFrom(toInputDate(allRawData[0].time));
      setTo(toInputDate(allRawData[allRawData.length - 1].time));
    }
  }, [allRawData]);

  // Apply preset rules when preset changes
  useEffect(() => {
    const preset = PRESETS[presetKey];
    if (preset && preset.rules) {
      setStartingBalance(preset.rules.startingBalance);
      setMaxRiskPerTrade(preset.rules.maxRiskPerTrade);
      setMaxDailyLoss(preset.rules.maxDailyLoss);
      setMaxDrawdown(preset.rules.maxDrawdown);
      setCountdownMinutes(preset.rules.countdownMinutes);
    }
  }, [presetKey]);

  // Auto-switch to Custom if user modifies a rule value
  const handleRuleChange = (setter) => (value) => {
    setter(value);
    if (presetKey !== 'custom') {
      const preset = PRESETS[presetKey];
      if (preset && preset.rules) {
        const numVal = Number(value);
        const same =
          (setter === setStartingBalance && numVal === preset.rules.startingBalance) ||
          (setter === setMaxRiskPerTrade && numVal === preset.rules.maxRiskPerTrade) ||
          (setter === setMaxDailyLoss && numVal === preset.rules.maxDailyLoss) ||
          (setter === setMaxDrawdown && numVal === preset.rules.maxDrawdown) ||
          (setter === setCountdownMinutes && numVal === preset.rules.countdownMinutes);
        // Only switch to custom if they changed it to something different
        // (individual check happens per-field)
      }
    }
  };

  if (allRawData.length === 0 || gameStarted) return null;

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
    if (maxRiskPerTrade <= 0 || maxRiskPerTrade > 100) { setError('Max risk per trade must be 0-100%'); return; }
    if (maxDailyLoss <= 0 || maxDailyLoss > 100) { setError('Max daily loss must be 0-100%'); return; }
    if (maxDrawdown <= 0 || maxDrawdown > 100) { setError('Max drawdown must be 0-100%'); return; }
    if (countdownMinutes !== null && countdownMinutes <= 0) { setError('Countdown must be positive'); return; }
    if (!playerName || playerName.trim().length === 0) { setError('Please enter your name'); return; }

    const count = allRawData.filter(c => c.time >= fromTs && c.time <= toTs).length;
    if (count === 0) { setError('No data in this period'); return; }

    setError('');
    startGame(fromTs, toTs, {
      startingBalance: Number(startingBalance),
      maxRiskPerTrade: Number(maxRiskPerTrade),
      maxDailyLoss: Number(maxDailyLoss),
      maxDrawdown: Number(maxDrawdown),
      countdownMinutes: countdownMinutes === null ? null : Number(countdownMinutes),
    });
  };

  return (
    <div className="fixed inset-0 bg-[#0b0e11]/95 backdrop-blur flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#131722] rounded-2xl w-full max-w-lg border border-[#2a2e39] overflow-hidden shadow-2xl my-4">
        
        <div className="p-5 border-b border-[#2a2e39]">
          <div className="flex items-center gap-3 mb-1">
            <div className="bg-blue-600 rounded-lg p-2">
              <Calendar size={18} />
            </div>
            <h1 className="text-xl font-bold tracking-wider">
              <span className="text-blue-500">Omax</span>
              <span className="text-white">FX Game</span>
            </h1>
          </div>
          <p className="text-xs text-gray-400">Configure your backtest</p>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          
          {/* PLAYER NAME */}
          <div>
            <h3 className="text-xs font-bold uppercase text-gray-400 mb-3 flex items-center gap-2">
              <User size={12} /> Player Name
            </h3>
            <input 
              type="text"
              value={playerName}
              maxLength={20}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="w-full p-2.5 bg-[#1e222d] rounded-lg border border-[#2a2e39] text-white text-sm focus:border-blue-500 outline-none"
            />
          </div>

          {/* CHALLENGE PRESET */}
          <div className="border-t border-[#2a2e39] pt-4">
            <h3 className="text-xs font-bold uppercase text-gray-400 mb-3 flex items-center gap-2">
              <Sparkles size={12} /> Challenge Preset
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => setPresetKey(key)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-center ${
                    presetKey === key 
                      ? 'bg-blue-600/20 border-blue-500 text-white' 
                      : 'bg-[#1e222d] border-[#2a2e39] text-gray-400 hover:border-[#3a3e49] hover:text-gray-200'
                  }`}
                >
                  <span className="text-xl">{preset.icon}</span>
                  <span className="text-xs font-bold">{preset.name}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-2 italic text-center">
              {activePreset?.desc}
            </p>
          </div>

          {/* PERIOD */}
          <div className="border-t border-[#2a2e39] pt-4">
            <h3 className="text-xs font-bold uppercase text-gray-400 mb-3 flex items-center gap-2">
              <Calendar size={12} /> Backtesting Period
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 uppercase">From</label>
                <input 
                  type="date" value={from} min={minDate} max={maxDate}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full p-2.5 bg-[#1e222d] rounded-lg border border-[#2a2e39] text-white text-sm focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 uppercase">To</label>
                <input 
                  type="date" value={to} min={minDate} max={maxDate}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full p-2.5 bg-[#1e222d] rounded-lg border border-[#2a2e39] text-white text-sm focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <div className="bg-[#1e222d] rounded-lg p-2 mt-2 flex justify-between text-xs">
              <span className="text-gray-400">Duration</span>
              <span className="font-bold text-blue-400">{durationDays} days</span>
            </div>
          </div>

          {/* RULES */}
          <div className="border-t border-[#2a2e39] pt-4">
            <h3 className="text-xs font-bold uppercase text-gray-400 mb-3 flex items-center gap-2">
              <Shield size={12} /> Game Rules
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs text-gray-400 flex-1 flex items-center gap-2">
                  <Target size={12} /> Starting Balance
                </label>
                <input 
                  type="number" value={startingBalance} step="1000" min="1000"
                  disabled={!isCustom}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  className={`w-32 p-2 bg-[#1e222d] rounded-lg border border-[#2a2e39] text-white text-sm text-right font-mono focus:border-blue-500 outline-none ${
                    !isCustom ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="text-xs text-gray-400 flex-1">Max Risk / Trade</label>
                <div className="flex items-center gap-1">
                  <input 
                    type="number" value={maxRiskPerTrade} step="0.5" min="0.5" max="100"
                    disabled={!isCustom}
                    onChange={(e) => setMaxRiskPerTrade(e.target.value)}
                    className={`w-20 p-2 bg-[#1e222d] rounded-lg border border-[#2a2e39] text-white text-sm text-right font-mono focus:border-blue-500 outline-none ${
                      !isCustom ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  />
                  <span className="text-xs text-gray-500 w-4">%</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="text-xs text-gray-400 flex-1">Max Daily Loss</label>
                <div className="flex items-center gap-1">
                  <input 
                    type="number" value={maxDailyLoss} step="0.5" min="0.5" max="100"
                    disabled={!isCustom}
                    onChange={(e) => setMaxDailyLoss(e.target.value)}
                    className={`w-20 p-2 bg-[#1e222d] rounded-lg border border-[#2a2e39] text-white text-sm text-right font-mono focus:border-blue-500 outline-none ${
                      !isCustom ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  />
                  <span className="text-xs text-gray-500 w-4">%</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="text-xs text-gray-400 flex-1 flex items-center gap-2">
                  <TrendingDown size={12} /> Max Drawdown
                </label>
                <div className="flex items-center gap-1">
                  <input 
                    type="number" value={maxDrawdown} step="1" min="1" max="100"
                    disabled={!isCustom}
                    onChange={(e) => setMaxDrawdown(e.target.value)}
                    className={`w-20 p-2 bg-[#1e222d] rounded-lg border border-[#2a2e39] text-white text-sm text-right font-mono focus:border-blue-500 outline-none ${
                      !isCustom ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  />
                  <span className="text-xs text-gray-500 w-4">%</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="text-xs text-gray-400 flex-1 flex items-center gap-2">
                  <Clock size={12} /> Countdown
                </label>
                <div className="flex items-center gap-1">
                  <input 
                    type="number" value={countdownMinutes} step="5" min="1"
                    disabled={!isCustom}
                    onChange={(e) => setCountdownMinutes(e.target.value)}
                    className={`w-20 p-2 bg-[#1e222d] rounded-lg border border-[#2a2e39] text-white text-sm text-right font-mono focus:border-blue-500 outline-none ${
                      !isCustom ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  />
                  <span className="text-xs text-gray-500">min</span>
                </div>
              </div>
            </div>

            {!isCustom && (
              <p className="text-[10px] text-gray-500 mt-3 italic text-center">
                Pick <button onClick={() => setPresetKey('custom')} className="text-blue-400 hover:underline">Custom</button> to edit rules
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-400 text-xs">
              {error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#2a2e39]">
          <button
            onClick={handleStart}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-colors"
          >
            <Play size={18} fill="currentColor" />
            Start {activePreset?.name} Challenge
          </button>
        </div>
      </div>
    </div>
  );
}