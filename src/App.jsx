import Chart from './components/Chart';
import ControlPanel from './components/ControlPanel';
import OrderModal from './components/OrderModal';
import HistoryModal from './components/HistoryModal';
import EquityModal from './components/EquityModal';
import AnalyticsModal from './components/AnalyticsModal';
import ChartThemeModal from './components/ChartThemeModal';
import InfoModal from './components/InfoModal';
import SoundToggle from './components/SoundToggle';
import PeriodModal from './components/PeriodModal';
import GameOverModal from './components/GameOverModal';
import CelebrationOverlay from './components/CelebrationOverlay';
import LoadingScreen from './components/LoadingScreen';
import { useStore, INITIAL_BALANCE } from './store';
import { aggregateData } from './utils/timeframe';
import { useEffect, useRef } from 'react';
import { startSoundtrack, stopSoundtrack } from './utils/audio';
import { fmtMoney, fmtMB } from './utils/format';
import Papa from 'papaparse';
import { Clock, RotateCcw, Info, Sparkles, AlertTriangle } from 'lucide-react';

const formatTime = (sec) => {
  if (sec == null) return '∞';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// Canonical timezone for the whole app (in minutes). All CSVs are shifted
// to this offset at load time.
const CANONICAL_OFFSET = -300; // UTC-5

// =========================================================================
// SYMBOL CONFIGURATION
// =========================================================================
const SYMBOL_CONFIG = [
  {
    code: 'XAUUSD',
    files: [
      'xauusd_2020.csv',
      'xauusd_2021.csv',
      'xauusd_2022.csv',
      'xauusd_2023.csv',
      'xauusd_2024.csv',
      'xauusd_2025.csv',
    ],
    sourceOffset: -300, // UTC-5
    available: true,
  },
  {
    code: 'EURUSD',
    files: [
      'eurusd_2020.csv',
      'eurusd_2021.csv',
      'eurusd_2022.csv',
      'eurusd_2023.csv',
      'eurusd_2024.csv',
      'eurusd_2025.csv',
    ],
    sourceOffset: -300, // UTC-5
    available: true,
  },
  { code: 'CHFJPY', files: ['chfjpy.csv'], sourceOffset: 0, available: false },
  { code: 'GBPAUD', files: ['gbpaud.csv'], sourceOffset: 0, available: false },
];

// =========================================================================
// FORMAT-AGNOSTIC DATE/TIME PARSER
// =========================================================================
const parseDateTimeToUnix = (dateStr, timeStr) => {
  if (!dateStr || timeStr == null) return null;

  const dateClean = String(dateStr).replace(/\D/g, '');
  if (dateClean.length !== 8) return null;
  const year  = dateClean.substring(0, 4);
  const month = dateClean.substring(4, 6);
  const day   = dateClean.substring(6, 8);

  const timeClean = String(timeStr).trim();
  const parts = timeClean.split(':');
  if (parts.length < 2) return null;
  const hour   = String(parts[0]).padStart(2, '0');
  const minute = String(parts[1]).padStart(2, '0');
  const second = parts[2] ? String(parts[2].split('.')[0]).padStart(2, '0') : '00';

  const h  = parseInt(hour, 10);
  const m  = parseInt(minute, 10);
  const s  = parseInt(second, 10);
  const mo = parseInt(month, 10);
  const d  = parseInt(day, 10);
  if (
    h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59 ||
    mo < 1 || mo > 12 || d < 1 || d > 31
  ) return null;

  const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const ms = new Date(isoString).getTime();
  if (isNaN(ms)) return null;
  return ms / 1000;
};

function App() {
  const { 
    isPlaying, stepForward, currentIndex, rawData, balance, positions, 
    musicEnabled, gameStarted,
    gameState, rules, updateTimeRemaining, endGame, restartGame,
    loadingState, openInfo, theme,
    sessionName, setSessionName, saveSession,
    enableFireworks, toggleFireworks,
    symbolWarning, clearSymbolWarning,
  } = useStore();
  const soundtrackStarted = useRef(false);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!symbolWarning) return;
    const t = setTimeout(() => clearSymbolWarning(), 5000);
    return () => clearTimeout(t);
  }, [symbolWarning, clearSymbolWarning]);

  useEffect(() => {
    if (!loadingState.isActive) {
      const t1 = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      const t2 = setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [loadingState.isActive]);

  // ============================================================
  // CSV LOADING — supports one or MANY files per symbol
  // ============================================================
  useEffect(() => {
    let cancelled = false;
    const setLoadingState = useStore.getState().setLoadingState;

    const parseCSVText = (csvText, sourceOffset) => {
      return new Promise((resolve) => {
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: false,
          skipEmptyLines: true,
          complete: (results) => {
            const shiftSec = (CANONICAL_OFFSET - sourceOffset) * 60;
            const formattedData = results.data
              .map(row => {
                const rawTime = parseDateTimeToUnix(row.date, row.time);
                if (rawTime == null) return null;
                const open  = Number(row.open);
                const high  = Number(row.high);
                const low   = Number(row.low);
                const close = Number(row.close);
                if (!Number.isFinite(open) || !Number.isFinite(high) ||
                    !Number.isFinite(low)  || !Number.isFinite(close)) return null;
                return {
                  time: rawTime + shiftSec,
                  open, high, low, close,
                  volume: Number(row.volume) || 0,
                };
              })
              .filter(Boolean);
            resolve(formattedData);
          },
          error: () => resolve([]),
        });
      });
    };

    const loadAll = async () => {
      try {
        setLoadingState({ isActive: true, loaded: 0, total: 0, error: null });

        const available = SYMBOL_CONFIG.filter(s => s.available);
        let totalBytes = 0;
        let loadedBytes = 0;
        const buffers = {};

        for (const sym of available) {
          if (cancelled) return;
          const texts = [];

          for (const file of sym.files) {
            if (cancelled) return;
            const url = `${import.meta.env.BASE_URL}data/${file}`;
            try {
              const res = await fetch(url);
              if (!res.ok) {
                console.warn(`Skipping ${sym.code}/${file}: HTTP ${res.status}`);
                continue;
              }
              const contentLength = res.headers.get('Content-Length');
              const buf = await res.arrayBuffer();
              loadedBytes += buf.byteLength;
              totalBytes += contentLength ? parseInt(contentLength, 10) : buf.byteLength;
              setLoadingState({ loaded: loadedBytes, total: Math.max(totalBytes, loadedBytes) });
              texts.push(new TextDecoder('utf-8').decode(buf));
            } catch (e) {
              console.warn(`Failed to load ${sym.code}/${file}:`, e);
            }
          }

          buffers[sym.code] = { texts, sourceOffset: sym.sourceOffset };
        }

        // Parse each symbol's files, merge, sort, store
        for (const [code, { texts, sourceOffset }] of Object.entries(buffers)) {
          if (cancelled) return;
          let all = [];
          for (const text of texts) {
            const parsed = await parseCSVText(text, sourceOffset);
            all = all.concat(parsed);
          }
          all.sort((a, b) => a.time - b.time);
          console.log(`[Data] ${code}: ${all.length} candles loaded`);
          useStore.getState().setAllDataForSymbol(code, all);
        }

        setLoadingState({ isActive: false });
      } catch (err) {
        console.error('CSV load error:', err);
        setLoadingState({ isActive: false, error: err.message });
      }
    };

    loadAll();
    return () => { cancelled = true; };
  }, []);

  // ============================================================
  // SESSION RESTORE
  // - If no saved session → show PeriodModal
  // - If saved session is invalid → clear it and show PeriodModal
  // ============================================================
  useEffect(() => {
    const state = useStore.getState();
    if (!state.allRawDataBySymbol.XAUUSD) return;
    if (restoredRef.current) return;
    restoredRef.current = true;

    const saved = useStore.getState().readSession();
    if (!saved || !saved.gameStarted || !saved.gamePeriod) {
      useStore.getState().openPeriodModal();
      return;
    }

    const ok = useStore.getState().loadSavedSession();
    if (!ok) {
      try { useStore.getState().clearSession(); } catch (e) {}
      useStore.getState().openPeriodModal();
    }
  }, [loadingState.isActive]);

  // ============================================================
  // SAFETY NET — if gameStarted is true but rawData is empty,
  // wipe the corrupt state and force the PeriodModal open.
  // ============================================================
  useEffect(() => {
    if (loadingState.isActive) return;
    const s = useStore.getState();
    if (s.gameStarted && (!s.rawData || s.rawData.length === 0)) {
      try { s.clearSession(); } catch (e) {}
      useStore.setState({
        gameStarted: false,
        rawData: [],
        displayData: [],
        currentIndex: 0,
        isPlaying: false,
        gameState: { isOver: false, reason: null, message: '', startTime: null, timeRemaining: null },
      });
      useStore.getState().openPeriodModal();
    }
  }, [loadingState.isActive]);

  // ============================================================
  // AUTO-SAVE
  // ============================================================
  useEffect(() => {
    let t = null;
    const unsub = useStore.subscribe((state) => {
      if (!state.gameStarted) return;
      const key = [
        state.currentIndex,
        state.balance.toFixed(2),
        state.positions.length,
        state.tradeHistory.length,
        state.pendingOrders.length,
        state.drawings.length,
        state.drawingsPast.length,
        state.timeframe,
        state.symbol,
        state.timezone,
        state.sessionName,
      ].join('|');
      if (key === App._lastSaveKey) return;
      App._lastSaveKey = key;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        try { useStore.getState().saveSession(); } catch (e) {}
      }, 800);
    });
    return () => { unsub(); if (t) clearTimeout(t); };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (tag === 'BUTTON') return;
      
      const state = useStore.getState();

      if (e.code === 'Space') {
        e.preventDefault();
        state.togglePlay();
        return;
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        state.stepForward();
        return;
      }
      if (e.code === 'KeyM') {
        e.preventDefault();
        state.toggleMusic();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let interval;
    if (isPlaying && currentIndex < rawData.length - 1 && !gameState.isOver) {
      interval = setInterval(() => { stepForward(); }, 250);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentIndex, rawData, stepForward, gameState.isOver]);

  useEffect(() => {
    if (!gameStarted || gameState.isOver || !rules.countdownMinutes) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - gameState.startTime) / 1000;
      const total = rules.countdownMinutes * 60;
      const remaining = Math.max(0, total - elapsed);
      if (remaining <= 0) {
        endGame('countdown', `Time's up! Your ${rules.countdownMinutes}-minute session ended.`);
        clearInterval(interval);
      } else {
        updateTimeRemaining(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameStarted, gameState.isOver, gameState.startTime, rules.countdownMinutes, endGame, updateTimeRemaining]);

  useEffect(() => {
    const startAudio = () => {
      if (!soundtrackStarted.current && musicEnabled) {
        startSoundtrack();
        soundtrackStarted.current = true;
      }
    };
    window.addEventListener('click', startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });
    return () => {
      window.removeEventListener('click', startAudio);
      window.removeEventListener('keydown', startAudio);
    };
  }, [musicEnabled]);

  useEffect(() => {
    if (musicEnabled && soundtrackStarted.current) startSoundtrack();
    else if (!musicEnabled) stopSoundtrack();
  }, [musicEnabled]);

  const currentPrice = rawData[currentIndex]?.close || 0;
  const unrealisedPnl = positions.reduce((sum, pos) => {
    const isBuy = pos.type === 'buy';
    const priceDiff = isBuy ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice;
    return sum + priceDiff * 100 * pos.size;
  }, 0);

  const timeRemaining = gameState.timeRemaining;
  const timeBoxClass = timeRemaining == null 
    ? 'text-gray-500 border-gray-700 bg-gray-900/20'
    : timeRemaining < 60 
      ? 'text-red-400 border-red-600 bg-red-900/40 animate-pulse' 
      : timeRemaining < 300 
        ? 'text-yellow-400 border-yellow-600 bg-yellow-900/30' 
        : 'text-blue-400 border-blue-600 bg-blue-900/30';

  const handleNewSession = () => {
    try { saveSession(); } catch (e) {}
    restartGame();
  };

  return (
    <div className="flex flex-col h-dvh overflow-hidden" style={{ backgroundColor: theme.background }}>
      {/* Hidden audio element — preloaded by the browser at page load. */}
      <audio
        id="sfx-tphit"
        src={`${import.meta.env.BASE_URL}sounds/tphit.mp3`}
        preload="auto"
        style={{ display: 'none' }}
      />

      <header className="px-2 py-1 bg-[#131722] border-b border-[#2a2e39] flex-shrink-0 flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="text-sm font-bold tracking-wider whitespace-nowrap">
            <span className="text-blue-500">Omax</span>
            <span className="text-white">FX</span>
            <span className="hidden sm:inline text-gray-400 ml-1">Simulator</span>
          </h1>
          {gameStarted && (
            <>
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[11px] border ${timeBoxClass}`}>
                <Clock size={10} />
                <span>{formatTime(timeRemaining)}</span>
              </div>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                onBlur={() => { try { saveSession(); } catch (e) {} }}
                maxLength={30}
                title="Session name — click to rename"
                className="hidden md:block bg-transparent text-gray-400 hover:text-white focus:text-white text-[11px] font-bold outline-none border border-transparent hover:border-[#2a2e39] focus:border-blue-500 rounded px-1.5 py-0.5 w-32 transition-colors"
              />
            </>
          )}
          {positions.length > 0 && (
            <span className="bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded text-[10px] font-bold hidden md:inline">
              {positions.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] flex-shrink-0">
          <div className="flex items-baseline gap-1">
            <span className="text-gray-400">Bal:</span>
            <span className="text-green-400 font-bold">${fmtMoney(balance, 0)}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-gray-400 hidden sm:inline">PnL:</span>
            <span className={`font-bold ${unrealisedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${fmtMoney(unrealisedPnl)}
            </span>
          </div>
          {gameStarted && (
            <button 
              onClick={handleNewSession}
              className="w-7 h-7 bg-[#1e222d] border border-[#2a2e39] hover:bg-blue-900/50 hover:text-blue-400 rounded flex items-center justify-center"
              title="New session"
            >
              <RotateCcw size={13} />
            </button>
          )}
          <SoundToggle />
          
          <button
            onClick={toggleFireworks}
            className={`w-7 h-7 border rounded flex items-center justify-center transition-colors ${
              enableFireworks
                ? 'bg-yellow-900/30 border-yellow-600/50 text-yellow-400 hover:bg-yellow-900/50'
                : 'bg-[#1e222d] border-[#2a2e39] text-gray-500 hover:text-gray-300'
            }`}
            title={enableFireworks ? 'Disable Fireworks' : 'Enable Fireworks'}
          >
            <Sparkles size={13} />
          </button>

          <button 
            onClick={openInfo}
            className="w-7 h-7 bg-[#1e222d] border border-[#2a2e39] hover:bg-blue-900/50 hover:text-blue-400 rounded flex items-center justify-center"
            title="Quick guide"
          >
            <Info size={13} />
          </button>
        </div>
      </header>
      
      <main className="flex-1 relative min-h-0">
        <Chart />
      </main>
      
      <ControlPanel />

      <OrderModal />
      <HistoryModal />
      <EquityModal />
      <AnalyticsModal />
      <ChartThemeModal />
      <InfoModal />
      <PeriodModal />
      <GameOverModal />

      <CelebrationOverlay />

      {symbolWarning && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[200] pointer-events-none"
          style={{ top: '56px' }}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1e222d]/98 backdrop-blur border border-amber-500/60 rounded-lg shadow-2xl shadow-black/60">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wide">
                Symbol unavailable at this time
              </span>
              <span className="text-xs text-white font-mono">
                {symbolWarning.message}
              </span>
            </div>
          </div>
        </div>
      )}

      {loadingState.isActive && <LoadingScreen />}
    </div>
  );
}

export default App;